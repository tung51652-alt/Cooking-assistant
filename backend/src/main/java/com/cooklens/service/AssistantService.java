package com.cooklens.service;

import com.cooklens.client.ChatProvider;
import com.cooklens.config.LlmSettings;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.Recipe;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import com.cooklens.repository.ChatAdmission;
import com.cooklens.repository.SessionOperations;
import com.cooklens.repository.SessionOperations.Operation;
import com.cooklens.repository.SessionStore;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.cfg.*;
import com.fasterxml.jackson.databind.type.LogicalType;
import jakarta.validation.Validator;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class AssistantService {
    private static final long LIFETIME = Duration.ofHours(24).toMillis();
    private static final int MAX_ACTIONS = 100;
    private final SessionStore store;
    private final GatewayService gateway;
    private final RuntimeContract contract;
    private final ObjectMapper mapper;
    private final ObjectMapper input;
    private final ObjectMapper persisted;
    private final PersistedSessionValidator storedValidator;
    private final Validator validator;
    private final ChatProvider provider;
    private final ChatContextBuilder context;
    private final LlmSettings llm;
    private final ChatPricing pricing;
    private final ChatAdmission admission = new ChatAdmission();

    public AssistantService(
            SessionStore store,
            GatewayService gateway,
            RuntimeContract contract,
            ObjectMapper mapper,
            Validator validator) {
        this(store, gateway, contract, mapper, validator, null, null, null, null);
    }

    @Autowired
    public AssistantService(
            SessionStore store,
            GatewayService gateway,
            RuntimeContract contract,
            ObjectMapper mapper,
            Validator validator,
            ChatProvider provider,
            ChatContextBuilder context,
            LlmSettings llm,
            ChatPricing pricing) {
        this.store = store;
        this.gateway = gateway;
        this.contract = contract;
        this.mapper = mapper;
        this.validator = validator;
        this.provider = provider;
        this.context = context;
        this.llm = llm;
        this.pricing = pricing;
        input =
                mapper.copy()
                        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                        .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
        persisted = input.copy().enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES);
        persisted
                .coercionConfigFor(LogicalType.Textual)
                .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
        storedValidator = new PersistedSessionValidator(gateway, LIFETIME, MAX_ACTIONS);
    }

    public <T> T parse(byte[] body, Class<T> type) {
        try {
            var tree = input.readTree(body);
            if (tree == null || !tree.isObject()) throw ApiFailure.invalid();
            if (type == LlmTestRequest.class) {
                for (var field : List.of("provider", "model", "api_key"))
                    if (!tree.path(field).isTextual()) throw ApiFailure.invalid();
                if (tree.hasNonNull("base_url") && !tree.get("base_url").isTextual())
                    throw ApiFailure.invalid();
            } else {
                var strings =
                        type == CreateSession.class
                                ? List.of("recipe_id", "corpus_version", "operation_id")
                                : type == SessionAction.class
                                        ? List.of("action", "operation_id")
                                        : List.of("text", "operation_id");
                for (var field : strings)
                    if (!tree.path(field).isTextual()) throw ApiFailure.invalid();
                if (type != CreateSession.class
                        && (!tree.path("expected_version").isIntegralNumber()
                                || !tree.path("expected_version").canConvertToLong()))
                    throw ApiFailure.invalid();
            }
            T value = input.treeToValue(tree, type);
            if (value == null || !validator.validate(value).isEmpty()) throw ApiFailure.invalid();
            return value;
        } catch (java.io.IOException e) {
            throw ApiFailure.invalid();
        }
    }

    private String uuid(String value) {
        try {
            String result = UUID.fromString(value).toString();
            if (!result.equalsIgnoreCase(value)) throw ApiFailure.invalid();
            return result;
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiFailure.invalid();
        }
    }

    private SessionResponse response(Session session, String requestId) {
        return new SessionResponse(contract.apiVersion, requestId, session);
    }

    public SessionResponse create(CreateSession request, String requestId) {
        String operation = uuid(request.operationId());
        var existing = store.transact(c -> findCreation(c, operation, request));
        if (existing != null) return response(existing, requestId);
        if (!contract.corpusVersion.equals(request.corpusVersion()))
            throw new ApiFailure(409, "RECIPE_VERSION_MISMATCH");
        var detail = gateway.detail(request.recipeId(), requestId);
        String snapshot;
        try {
            snapshot = mapper.writeValueAsString(detail.recipe());
        } catch (java.io.IOException e) {
            throw ApiFailure.unavailable();
        }
        return response(
                store.transact(
                        c -> {
                            var replay = findCreation(c, operation, request);
                            if (replay != null) return replay;
                            long now = System.currentTimeMillis();
                            try (var purge =
                                    c.prepareStatement(
                                            "DELETE FROM sessions WHERE expires_at < ?")) {
                                purge.setLong(1, now - Duration.ofDays(7).toMillis());
                                purge.executeUpdate();
                            }
                            try (var query = c.createStatement();
                                    var count =
                                            query.executeQuery("SELECT COUNT(*) FROM sessions")) {
                                count.next();
                                if (count.getInt(1) >= 10000)
                                    throw new ApiFailure(503, "SERVICE_BUSY");
                            }
                            String id = UUID.randomUUID().toString();
                            try (var insert =
                                    c.prepareStatement(
                                            "INSERT INTO sessions VALUES"
                                                    + " (?,?,?,?,?,'ready',0,0,?,?,?)")) {
                                insert.setString(1, id);
                                insert.setString(2, operation);
                                insert.setString(3, request.recipeId());
                                insert.setString(4, detail.corpusVersion());
                                insert.setString(5, snapshot);
                                insert.setLong(6, now);
                                insert.setLong(7, now);
                                insert.setLong(8, now + LIFETIME);
                                insert.executeUpdate();
                            }
                            return load(c, id);
                        }),
                requestId);
    }

    private Session findCreation(Connection c, String operation, CreateSession request)
            throws Exception {
        try (var query =
                c.prepareStatement(
                        "SELECT id, recipe_id, corpus_version FROM sessions WHERE"
                                + " create_operation=?")) {
            query.setString(1, operation);
            try (var result = query.executeQuery()) {
                if (!result.next()) return null;
                var session = readStoredSession(c, result.getString("id"));
                if (!request.recipeId().equals(session.recipe().id())
                        || !request.corpusVersion().equals(session.corpusVersion()))
                    throw new ApiFailure(409, "OPERATION_CONFLICT");
                requireActive(session);
                return session;
            }
        }
    }

    public SessionResponse get(String id, String requestId) {
        String sessionId = uuid(id);
        return response(store.transact(c -> load(c, sessionId)), requestId);
    }

    public SessionResponse act(String id, SessionAction request, String requestId) {
        String sessionId = uuid(id), operation = uuid(request.operationId());
        return response(
                store.transact(
                        c ->
                                applyAction(
                                        c,
                                        sessionId,
                                        operation,
                                        request,
                                        "action",
                                        request.action().name())),
                requestId);
    }

    private Session applyAction(
            Connection c,
            String sessionId,
            String operation,
            SessionAction request,
            String kind,
            String value)
            throws Exception {
        var session = load(c, sessionId);
        var operationRecord = findOperation(c, sessionId, operation);
        if (operationRecord != null) {
            if (!operationRecord.kind().equals(kind)
                    || !operationRecord
                            .fingerprint()
                            .equals(
                                    SessionOperations.fingerprint(
                                            kind, value, request.expectedVersion())))
                throw new ApiFailure(409, "OPERATION_CONFLICT");
            return session;
        }
        requireVersion(session, request.expectedVersion());
        if (session.status() == Status.finished) throw new ApiFailure(409, "SESSION_FINISHED");
        if (session.history().size() >= MAX_ACTIONS
                || (session.history().size() == MAX_ACTIONS - 1
                        && request.action() != Action.finish))
            throw new ApiFailure(409, "SESSION_HISTORY_LIMIT");
        int step = session.currentStep();
        Status status = session.status();
        switch (request.action()) {
            case start -> {
                if (status != Status.ready) throw new ApiFailure(409, "INVALID_SESSION_ACTION");
                step = 1;
                status = Status.cooking;
            }
            case finish -> status = Status.finished;
            case next, previous, repeat -> {
                if (status != Status.cooking) throw new ApiFailure(409, "INVALID_SESSION_ACTION");
                if (request.action() == Action.next)
                    step = Math.min(step + 1, session.totalSteps());
                if (request.action() == Action.previous) step = Math.max(1, step - 1);
            }
        }
        long now = System.currentTimeMillis(), version = session.version() + 1;
        try (var update =
                c.prepareStatement(
                        "UPDATE sessions SET status=?, current_step=?, version=?, updated_at=?"
                                + " WHERE id=? AND version=?")) {
            update.setString(1, status.name());
            update.setInt(2, step);
            update.setLong(3, version);
            update.setLong(4, now);
            update.setString(5, sessionId);
            update.setLong(6, session.version());
            if (update.executeUpdate() != 1) throw new ApiFailure(409, "SESSION_VERSION_CONFLICT");
        }
        try (var insert =
                c.prepareStatement("INSERT INTO session_actions VALUES (?,?,?,?,?,?,?)")) {
            insert.setString(1, sessionId);
            insert.setString(2, operation);
            insert.setString(3, request.action().name());
            insert.setLong(4, request.expectedVersion());
            insert.setLong(5, version);
            insert.setInt(6, step);
            insert.setLong(7, now);
            insert.executeUpdate();
        }
        if (kind.equals("action"))
            SessionOperations.completedAction(
                    c, sessionId, operation, request.action(), request.expectedVersion(), now);
        else
            SessionOperations.completedCommand(
                    c, sessionId, operation, value, request.expectedVersion(), now);
        return load(c, sessionId);
    }

    public LlmTestResponse testLlm(LlmTestRequest request, String requestId) {
        if (provider == null || llm == null) throw new ApiFailure(503, "ASSISTANT_NOT_CONFIGURED");
        var override =
                new LlmSettings.UserOverride(
                        request.provider(), request.baseUrl(), request.model(), request.apiKey());
        String normalizedProvider = llm.normalizeUserProvider(override, true);
        LlmSettings.Connection config = llm.resolveUserConnection(override, 64, true);
        var prompt =
                new ChatProvider.Prompt(
                        List.of(
                                new ChatProvider.Message(
                                        ChatProvider.Role.system, "Reply briefly in plain text."),
                                new ChatProvider.Message(ChatProvider.Role.user, "hello")));
        long start = System.nanoTime();
        ChatProvider.Completion completion;
        try {
            completion = provider.complete(prompt, config);
        } catch (ApiFailure failure) {
            throw failure;
        } catch (RuntimeException error) {
            throw new ApiFailure(503, "ASSISTANT_PROVIDER_UNAVAILABLE");
        }
        long latencyMs =
                Math.max(
                        0L,
                        java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(
                                System.nanoTime() - start));
        return new LlmTestResponse(
                contract.apiVersion,
                requestId,
                true,
                normalizedProvider,
                completion.model(),
                completion.text(),
                latencyMs);
    }

    public SessionResponse message(String id, SessionMessage request, String requestId) {
        return message(id, request, requestId, new AssistantTiming(), null);
    }

    public SessionResponse message(
            String id, SessionMessage request, String requestId, AssistantTiming timing) {
        return message(id, request, requestId, timing, null);
    }

    public SessionResponse message(
            String id,
            SessionMessage request,
            String requestId,
            AssistantTiming timing,
            LlmSettings.UserOverride userLlm) {
        String operation = uuid(request.operationId());
        String sessionId = uuid(id);
        Action command = CookingCommands.parse(request.text());
        if (command != null)
            return timing.measure(
                    AssistantTiming.Stage.prepare,
                    () ->
                            response(
                                    store.transact(
                                            c ->
                                                    applyAction(
                                                            c,
                                                            sessionId,
                                                            operation,
                                                            new SessionAction(
                                                                    command,
                                                                    request.expectedVersion(),
                                                                    operation),
                                                            "message_action",
                                                            request.text())),
                                    requestId));
        var prepared =
                timing.measure(
                        AssistantTiming.Stage.prepare,
                        () -> prepareMessage(sessionId, request, true, userLlm));
        if (prepared.replay()) return response(prepared.session(), requestId);
        ChatProvider.Completion result;
        try {
            result =
                    timing.measure(
                            AssistantTiming.Stage.provider,
                            () ->
                                    prepared.config() != null && prepared.config().byok()
                                            ? provider.complete(
                                                    prepared.prompt(), prepared.config())
                                            : provider.complete(prepared.prompt()));
        } catch (RuntimeException error) {
            ApiFailure failure =
                    error instanceof ApiFailure known
                            ? known
                            : new ApiFailure(503, "ASSISTANT_PROVIDER_UNAVAILABLE");
            var usage =
                    error instanceof ChatProvider.Failure known
                            ? known.usage()
                            : ChatProvider.Usage.unknown();
            timing.measure(
                    AssistantTiming.Stage.persist,
                    () -> {
                        settleMessage(sessionId, request, usage, failure.code());
                        failMessage(sessionId, request, failure);
                        return null;
                    });
            throw failure;
        }
        return timing.measure(
                AssistantTiming.Stage.persist,
                () -> persistCompletion(sessionId, operation, request, requestId, result));
    }

    private SessionResponse persistCompletion(
            String sessionId,
            String operation,
            SessionMessage request,
            String requestId,
            ChatProvider.Completion result) {
        var usage = result == null ? ChatProvider.Usage.unknown() : result.usage();
        settleMessage(sessionId, request, usage, "PROVIDER_COMPLETED");
        try {
            var reply =
                    result == null
                            ? null
                            : new StoredReply(
                                    result.text(),
                                    result.provider(),
                                    result.model(),
                                    usage == null ? null : usage.inputTokens(),
                                    usage == null ? null : usage.outputTokens());
            return response(completeMessage(sessionId, request, reply).session(), requestId);
        } catch (ApiFailure failure) {
            store.transact(
                    c -> {
                        admission.outcome(c, sessionId, operation, failure.code());
                        return null;
                    });
            throw failure;
        }
    }

    private void settleMessage(
            String session, SessionMessage request, ChatProvider.Usage usage, String outcome) {
        store.transact(
                c -> {
                    admission.settle(c, session, uuid(request.operationId()), usage, outcome);
                    return null;
                });
    }

    record PreparedMessage(
            Session session,
            boolean replay,
            ChatProvider.Prompt prompt,
            LlmSettings.Connection config) {}

    record StoredReply(
            String text, String provider, String model, Long inputTokens, Long outputTokens) {}

    private record MessageOutcome(
            Session session,
            boolean replay,
            ApiFailure failure,
            ChatProvider.Prompt prompt,
            LlmSettings.Connection config) {
        MessageOutcome(Session session, boolean replay, ApiFailure failure) {
            this(session, replay, failure, null, null);
        }

        PreparedMessage checked() {
            if (failure != null) throw failure;
            return new PreparedMessage(session, replay, prompt, config);
        }
    }

    // Called by the provider orchestration only after configuration/context/admission checks.
    PreparedMessage prepareMessage(String id, SessionMessage request) {
        return prepareMessage(id, request, false, null);
    }

    private PreparedMessage prepareMessage(
            String id,
            SessionMessage request,
            boolean providerCall,
            LlmSettings.UserOverride userLlm) {
        String sessionId = uuid(id), operation = uuid(request.operationId());
        return store.transact(
                        c -> {
                            var session = load(c, sessionId);
                            expirePending(c, sessionId);
                            var prior = findOperation(c, sessionId, operation);
                            if (prior != null) return replayMessage(session, prior, request);
                            requireVersion(session, request.expectedVersion());
                            if (session.status() == Status.finished)
                                throw new ApiFailure(409, "SESSION_FINISHED");
                            if (session.messages().size() >= 60)
                                throw new ApiFailure(409, "SESSION_MESSAGE_LIMIT");
                            if (SessionOperations.read(c, sessionId).stream()
                                    .anyMatch(op -> op.status().equals("pending")))
                                return new MessageOutcome(
                                        session,
                                        false,
                                        new ApiFailure(409, "ASSISTANT_REQUEST_IN_PROGRESS"));
                            long now = System.currentTimeMillis();
                            ChatProvider.Prompt prompt = null;
                            LlmSettings.Connection config = null;
                            if (providerCall) {
                                if (provider == null
                                        || llm == null
                                        || context == null
                                        || pricing == null)
                                    throw new ApiFailure(503, "ASSISTANT_NOT_CONFIGURED");
                                boolean byok = userLlm != null && userLlm.hasApiKey();
                                if (byok) {
                                    config = llm.resolveUserConnection(userLlm, null, false);
                                } else {
                                    provider.requireConfigured();
                                    config = llm.requireConfigured();
                                }
                                prompt =
                                        context.build(
                                                session, request.text(), config.maxInputTokens());
                                if (byok) provider.validate(prompt, config);
                                else provider.validate(prompt);
                                admission.reserve(
                                        c,
                                        sessionId,
                                        operation,
                                        config.model(),
                                        pricing.quote(config, prompt),
                                        now,
                                        byok);
                            }
                            try (var insert =
                                    c.prepareStatement(
                                            """
INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,deadline,status)
VALUES (?,?,'message',?,?,?,?,'pending')
""")) {
                                insert.setString(1, sessionId);
                                insert.setString(2, operation);
                                insert.setString(
                                        3,
                                        SessionOperations.fingerprint(
                                                "message",
                                                request.text(),
                                                request.expectedVersion()));
                                insert.setLong(4, request.expectedVersion());
                                insert.setLong(5, now);
                                insert.setLong(6, now + 25000);
                                insert.executeUpdate();
                            }
                            return new MessageOutcome(session, false, null, prompt, config);
                        })
                .checked();
    }

    PreparedMessage completeMessage(String id, SessionMessage request, StoredReply reply) {
        String sessionId = uuid(id), operation = uuid(request.operationId());
        return store.transact(
                        c -> {
                            var session = readStoredSession(c, sessionId);
                            expirePending(c, sessionId);
                            var prior = findOperation(c, sessionId, operation);
                            if (prior == null) throw PersistedSessionValidator.unavailable();
                            matchMessage(prior, request);
                            if (!prior.status().equals("pending"))
                                return replayMessage(session, prior, request);
                            ApiFailure rejected = null;
                            if (Instant.parse(session.expiresAt()).toEpochMilli()
                                    <= System.currentTimeMillis())
                                rejected = new ApiFailure(410, "SESSION_EXPIRED");
                            else if (session.version() != request.expectedVersion())
                                rejected = new ApiFailure(409, "SESSION_VERSION_CONFLICT");
                            else if (reply == null
                                    || reply.text() == null
                                    || reply.text().isBlank()
                                    || reply.text().length() > 16384
                                    || reply.provider() == null
                                    || reply.provider().isBlank()
                                    || reply.provider().length() > 100
                                    || reply.model() == null
                                    || reply.model().isBlank()
                                    || reply.model().length() > 200
                                    || (reply.inputTokens() != null && reply.inputTokens() < 0)
                                    || (reply.outputTokens() != null && reply.outputTokens() < 0))
                                rejected = new ApiFailure(503, "ASSISTANT_PROVIDER_UNAVAILABLE");
                            if (rejected != null) {
                                recordFailure(c, sessionId, operation, rejected);
                                return new MessageOutcome(session, false, rejected);
                            }
                            long now = System.currentTimeMillis(), version = session.version() + 1;
                            try (var update =
                                    c.prepareStatement(
                                            "UPDATE session_operations SET"
                                                + " status='completed',committed_version=? WHERE"
                                                + " session_id=? AND operation_id=? AND"
                                                + " status='pending'")) {
                                update.setLong(1, version);
                                update.setString(2, sessionId);
                                update.setString(3, operation);
                                if (update.executeUpdate() != 1)
                                    throw PersistedSessionValidator.unavailable();
                            }
                            try (var insert =
                                    c.prepareStatement(
                                            "INSERT INTO session_chat_turns VALUES"
                                                    + " (?,?,?,?,?,?,?,?,?,?,?)")) {
                                insert.setString(1, sessionId);
                                insert.setLong(2, version);
                                insert.setString(3, operation);
                                insert.setLong(4, request.expectedVersion());
                                insert.setString(5, request.text());
                                insert.setString(6, reply.text());
                                insert.setLong(7, now);
                                insert.setString(8, reply.provider());
                                insert.setString(9, reply.model());
                                insert.setObject(10, reply.inputTokens());
                                insert.setObject(11, reply.outputTokens());
                                insert.executeUpdate();
                            }
                            try (var update =
                                    c.prepareStatement(
                                            "UPDATE sessions SET version=?,updated_at=? WHERE id=?"
                                                    + " AND version=?")) {
                                update.setLong(1, version);
                                update.setLong(2, now);
                                update.setString(3, sessionId);
                                update.setLong(4, request.expectedVersion());
                                if (update.executeUpdate() != 1)
                                    throw new ApiFailure(409, "SESSION_VERSION_CONFLICT");
                            }
                            return new MessageOutcome(load(c, sessionId), false, null);
                        })
                .checked();
    }

    void failMessage(String id, SessionMessage request, ApiFailure failure) {
        String sessionId = uuid(id), operation = uuid(request.operationId());
        store.transact(
                c -> {
                    readStoredSession(c, sessionId);
                    expirePending(c, sessionId);
                    var prior = findOperation(c, sessionId, operation);
                    if (prior == null) throw PersistedSessionValidator.unavailable();
                    matchMessage(prior, request);
                    if (prior.status().equals("pending"))
                        recordFailure(c, sessionId, operation, failure);
                    return null;
                });
    }

    private Operation findOperation(Connection c, String session, String operation)
            throws SQLException {
        return SessionOperations.read(c, session).stream()
                .filter(op -> op.id().equals(operation))
                .findFirst()
                .orElse(null);
    }

    private void matchMessage(Operation prior, SessionMessage request) {
        if (!prior.kind().equals("message")
                || !prior.fingerprint()
                        .equals(
                                SessionOperations.fingerprint(
                                        "message", request.text(), request.expectedVersion())))
            throw new ApiFailure(409, "OPERATION_CONFLICT");
    }

    private MessageOutcome replayMessage(Session session, Operation prior, SessionMessage request) {
        matchMessage(prior, request);
        requireActive(session);
        if (prior.status().equals("completed")) return new MessageOutcome(session, true, null);
        if (prior.status().equals("failed"))
            return new MessageOutcome(
                    session, false, new ApiFailure(prior.errorStatus(), prior.errorCode()));
        return new MessageOutcome(
                session, false, new ApiFailure(409, "ASSISTANT_REQUEST_IN_PROGRESS"));
    }

    private void expirePending(Connection c, String session) throws SQLException {
        admission.unknown(c, session, System.currentTimeMillis());
        try (var update =
                c.prepareStatement(
                        """
UPDATE session_operations SET status='failed',error_status=503,error_code='ASSISTANT_OUTCOME_UNKNOWN'
WHERE session_id=? AND status='pending' AND deadline<=?
""")) {
            update.setString(1, session);
            update.setLong(2, System.currentTimeMillis());
            update.executeUpdate();
        }
    }

    private void recordFailure(Connection c, String session, String operation, ApiFailure failure)
            throws SQLException {
        try (var update =
                c.prepareStatement(
                        "UPDATE session_operations SET status='failed',error_status=?,error_code=?"
                                + " WHERE session_id=? AND operation_id=? AND status='pending'")) {
            update.setInt(1, failure.status());
            update.setString(2, failure.code());
            update.setString(3, session);
            update.setString(4, operation);
            update.executeUpdate();
        }
    }

    private void requireVersion(Session session, long expected) {
        if (session.version() != expected) throw new ApiFailure(409, "SESSION_VERSION_CONFLICT");
    }

    private Session load(Connection c, String id) throws Exception {
        var session = readStoredSession(c, id);
        requireActive(session);
        return session;
    }

    private void requireActive(Session session) {
        if (Instant.parse(session.expiresAt()).toEpochMilli() <= System.currentTimeMillis())
            throw new ApiFailure(410, "SESSION_EXPIRED");
    }

    private Session readStoredSession(Connection c, String id) throws Exception {
        try (var query = c.prepareStatement("SELECT * FROM sessions WHERE id=?")) {
            query.setString(1, id);
            try (var result = query.executeQuery()) {
                if (!result.next()) throw new ApiFailure(404, "SESSION_NOT_FOUND");
                Recipe recipe =
                        persisted.readValue(storedText(result, "recipe_json"), Recipe.class);
                var state =
                        new PersistedSessionValidator.State(
                                storedText(result, "id"),
                                storedText(result, "create_operation"),
                                storedText(result, "recipe_id"),
                                storedText(result, "corpus_version"),
                                recipe,
                                Status.valueOf(storedText(result, "status")),
                                Math.toIntExact(storedInteger(result, "current_step")),
                                storedInteger(result, "version"),
                                storedInteger(result, "created_at"),
                                storedInteger(result, "updated_at"),
                                storedInteger(result, "expires_at"));
                var history = new ArrayList<PersistedSessionValidator.Event>();
                try (var events =
                        c.prepareStatement(
                                "SELECT * FROM session_actions WHERE session_id=? ORDER BY version"
                                        + " LIMIT ?")) {
                    events.setString(1, id);
                    events.setInt(2, MAX_ACTIONS + 1);
                    try (var rows = events.executeQuery()) {
                        while (rows.next())
                            history.add(
                                    new PersistedSessionValidator.Event(
                                            storedText(rows, "operation_id"),
                                            Action.valueOf(storedText(rows, "action")),
                                            storedInteger(rows, "expected_version"),
                                            storedInteger(rows, "version"),
                                            Math.toIntExact(storedInteger(rows, "current_step")),
                                            storedInteger(rows, "created_at")));
                    }
                }
                var turns = new ArrayList<PersistedSessionValidator.Turn>();
                try (var queryTurns =
                        c.prepareStatement(
                                "SELECT * FROM session_chat_turns WHERE session_id=? ORDER BY"
                                        + " version LIMIT 31")) {
                    queryTurns.setString(1, id);
                    try (var rows = queryTurns.executeQuery()) {
                        while (rows.next())
                            turns.add(
                                    new PersistedSessionValidator.Turn(
                                            storedText(rows, "operation_id"),
                                            storedInteger(rows, "expected_version"),
                                            storedInteger(rows, "version"),
                                            storedText(rows, "user_text"),
                                            storedText(rows, "assistant_text"),
                                            storedInteger(rows, "created_at"),
                                            storedText(rows, "provider"),
                                            storedText(rows, "model"),
                                            SessionOperations.nullableInteger(rows, "input_tokens"),
                                            SessionOperations.nullableInteger(
                                                    rows, "output_tokens")));
                    }
                }
                storedValidator.validate(state, history, turns);
                storedValidator.validateOperations(
                        state, history, turns, SessionOperations.read(c, id));
                var events =
                        history.stream()
                                .map(
                                        event ->
                                                new ActionEvent(
                                                        event.operationId(),
                                                        event.action(),
                                                        event.version(),
                                                        event.currentStep(),
                                                        instant(event.createdAt())))
                                .toList();
                var messages = new ArrayList<Message>();
                for (var turn : turns) {
                    messages.add(new Message("user", turn.userText()));
                    messages.add(new Message("assistant", turn.assistantText()));
                }
                return new Session(
                        id,
                        state.corpusVersion(),
                        recipe.updatedAt(),
                        recipe,
                        state.status(),
                        state.currentStep(),
                        recipe.instructions().size(),
                        state.version(),
                        instant(state.createdAt()),
                        instant(state.updatedAt()),
                        instant(state.expiresAt()),
                        events,
                        messages);
            }
        } catch (ApiFailure e) {
            throw e;
        } catch (Exception e) {
            throw PersistedSessionValidator.unavailable();
        }
    }

    private String storedText(ResultSet row, String field) throws SQLException {
        if (row.getObject(field) instanceof String value) return value;
        throw PersistedSessionValidator.unavailable();
    }

    private long storedInteger(ResultSet row, String field) throws SQLException {
        Object value = row.getObject(field);
        if (value instanceof Integer || value instanceof Long) return ((Number) value).longValue();
        throw PersistedSessionValidator.unavailable();
    }

    private String instant(long time) {
        return Instant.ofEpochMilli(time).toString();
    }
}
