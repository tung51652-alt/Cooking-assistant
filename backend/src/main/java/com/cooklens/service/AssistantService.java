package com.cooklens.service;

import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.Recipe;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import com.cooklens.repository.SessionStore;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.cfg.*;
import com.fasterxml.jackson.databind.type.LogicalType;
import jakarta.validation.Validator;
import java.sql.*;
import java.time.*;
import java.util.*;
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
    public AssistantService(SessionStore store, GatewayService gateway, RuntimeContract contract, ObjectMapper mapper, Validator validator) {
        this.store=store; this.gateway=gateway; this.contract=contract; this.mapper=mapper; this.validator=validator;
        input=mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
        persisted=input.copy().enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES);
        persisted.coercionConfigFor(LogicalType.Textual)
                .setCoercion(CoercionInputShape.Integer,CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Float,CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Boolean,CoercionAction.Fail);
        storedValidator=new PersistedSessionValidator(gateway,LIFETIME,MAX_ACTIONS);
    }
    public <T> T parse(byte[] body, Class<T> type) {
        try {
            var tree=input.readTree(body);
            if (tree == null || !tree.isObject()) throw ApiFailure.invalid();
            var strings=type == CreateSession.class ? List.of("recipe_id", "corpus_version", "operation_id")
                    : type == SessionAction.class ? List.of("action", "operation_id") : List.of("text", "operation_id");
            for (var field : strings) if (!tree.path(field).isTextual()) throw ApiFailure.invalid();
            if (type != CreateSession.class && (!tree.path("expected_version").isIntegralNumber()
                    || !tree.path("expected_version").canConvertToLong())) throw ApiFailure.invalid();
            T value = input.treeToValue(tree, type);
            if (value == null || !validator.validate(value).isEmpty()) throw ApiFailure.invalid();
            return value;
        } catch (java.io.IOException e) { throw ApiFailure.invalid(); }
    }
    private String uuid(String value) {
        try {
            String result=UUID.fromString(value).toString();
            if (!result.equalsIgnoreCase(value)) throw ApiFailure.invalid();
            return result;
        } catch (IllegalArgumentException | NullPointerException e) { throw ApiFailure.invalid(); }
    }
    private SessionResponse response(Session session, String requestId) {
        return new SessionResponse(contract.apiVersion, requestId, session);
    }
    public SessionResponse create(CreateSession request, String requestId) {
        String operation=uuid(request.operationId());
        var existing=store.transact(c -> findCreation(c, operation, request));
        if (existing != null) return response(existing, requestId);
        if (!contract.corpusVersion.equals(request.corpusVersion())) throw new ApiFailure(409, "RECIPE_VERSION_MISMATCH");
        var detail=gateway.detail(request.recipeId(), requestId);
        String snapshot;
        try { snapshot=mapper.writeValueAsString(detail.recipe()); }
        catch (java.io.IOException e) { throw ApiFailure.unavailable(); }
        return response(store.transact(c -> {
            var replay=findCreation(c, operation, request);
            if (replay != null) return replay;
            long now=System.currentTimeMillis();
            try (var purge=c.prepareStatement("DELETE FROM sessions WHERE expires_at < ?")) {
                purge.setLong(1, now-Duration.ofDays(7).toMillis()); purge.executeUpdate();
            }
            try (var query=c.createStatement(); var count=query.executeQuery("SELECT COUNT(*) FROM sessions")) {
                count.next();
                if (count.getInt(1) >= 10000) throw new ApiFailure(503, "SERVICE_BUSY");
            }
            String id=UUID.randomUUID().toString();
            try (var insert=c.prepareStatement("INSERT INTO sessions VALUES (?,?,?,?,?,'ready',0,0,?,?,?)")) {
                insert.setString(1,id); insert.setString(2,operation); insert.setString(3,request.recipeId());
                insert.setString(4,detail.corpusVersion()); insert.setString(5,snapshot);
                insert.setLong(6,now); insert.setLong(7,now); insert.setLong(8,now+LIFETIME); insert.executeUpdate();
            }
            return load(c,id);
        }), requestId);
    }
    private Session findCreation(Connection c, String operation, CreateSession request) throws Exception {
        try (var query=c.prepareStatement("SELECT id, recipe_id, corpus_version FROM sessions WHERE create_operation=?")) {
            query.setString(1,operation);
            try (var result=query.executeQuery()) {
                if (!result.next()) return null;
                var session=readStoredSession(c,result.getString("id"));
                if (!request.recipeId().equals(session.recipe().id()) || !request.corpusVersion().equals(session.corpusVersion()))
                    throw new ApiFailure(409,"OPERATION_CONFLICT");
                requireActive(session);
                return session;
            }
        }
    }
    public SessionResponse get(String id, String requestId) {
        String sessionId=uuid(id);
        return response(store.transact(c -> load(c,sessionId)), requestId);
    }
    public SessionResponse act(String id, SessionAction request, String requestId) {
        String sessionId=uuid(id), operation=uuid(request.operationId());
        return response(store.transact(c -> {
            var session=load(c,sessionId);
            try (var query=c.prepareStatement("SELECT action, expected_version FROM session_actions WHERE session_id=? AND operation_id=?")) {
                query.setString(1,sessionId); query.setString(2,operation);
                try (var result=query.executeQuery()) {
                    if (result.next()) {
                        if (!request.action().name().equals(result.getString("action")) || request.expectedVersion() != result.getLong("expected_version"))
                            throw new ApiFailure(409,"OPERATION_CONFLICT");
                        return session;
                    }
                }
            }
            requireVersion(session,request.expectedVersion());
            if (session.status() == Status.finished) throw new ApiFailure(409,"SESSION_FINISHED");
            if (session.history().size() >= MAX_ACTIONS || (session.history().size() == MAX_ACTIONS-1 && request.action() != Action.finish))
                throw new ApiFailure(409,"SESSION_HISTORY_LIMIT");
            int step=session.currentStep();
            Status status=session.status();
            switch (request.action()) {
                case start -> {
                    if (status != Status.ready) throw new ApiFailure(409,"INVALID_SESSION_ACTION");
                    step=1; status=Status.cooking;
                }
                case finish -> status=Status.finished;
                case next, previous, repeat -> {
                    if (status != Status.cooking) throw new ApiFailure(409,"INVALID_SESSION_ACTION");
                    if (request.action() == Action.next) step=Math.min(step+1,session.totalSteps());
                    if (request.action() == Action.previous) step=Math.max(1,step-1);
                }
            }
            long now=System.currentTimeMillis(), version=session.version()+1;
            try (var update=c.prepareStatement("UPDATE sessions SET status=?, current_step=?, version=?, updated_at=? WHERE id=? AND version=?")) {
                update.setString(1,status.name()); update.setInt(2,step); update.setLong(3,version); update.setLong(4,now);
                update.setString(5,sessionId); update.setLong(6,session.version());
                if (update.executeUpdate() != 1) throw new ApiFailure(409,"SESSION_VERSION_CONFLICT");
            }
            try (var insert=c.prepareStatement("INSERT INTO session_actions VALUES (?,?,?,?,?,?,?)")) {
                insert.setString(1,sessionId); insert.setString(2,operation); insert.setString(3,request.action().name());
                insert.setLong(4,request.expectedVersion()); insert.setLong(5,version); insert.setInt(6,step); insert.setLong(7,now); insert.executeUpdate();
            }
            return load(c,sessionId);
        }), requestId);
    }
    public SessionResponse message(String id, SessionMessage request, String requestId) {
        uuid(request.operationId());
        String sessionId=uuid(id);
        store.transact(c -> {
            var session=load(c,sessionId);
            requireVersion(session,request.expectedVersion());
            if (session.status() == Status.finished) throw new ApiFailure(409,"SESSION_FINISHED");
            throw new ApiFailure(503,"ASSISTANT_NOT_CONFIGURED");
        });
        throw new ApiFailure(503,"ASSISTANT_NOT_CONFIGURED");
    }
    private void requireVersion(Session session, long expected) {
        if (session.version() != expected) throw new ApiFailure(409,"SESSION_VERSION_CONFLICT");
    }
    private Session load(Connection c, String id) throws Exception {
        var session=readStoredSession(c,id);
        requireActive(session);
        return session;
    }
    private void requireActive(Session session) {
        if (Instant.parse(session.expiresAt()).toEpochMilli() <= System.currentTimeMillis()) throw new ApiFailure(410,"SESSION_EXPIRED");
    }
    private Session readStoredSession(Connection c, String id) throws Exception {
        try (var query=c.prepareStatement("SELECT * FROM sessions WHERE id=?")) {
            query.setString(1,id);
            try (var result=query.executeQuery()) {
                if (!result.next()) throw new ApiFailure(404,"SESSION_NOT_FOUND");
                Recipe recipe=persisted.readValue(storedText(result,"recipe_json"),Recipe.class);
                var state=new PersistedSessionValidator.State(storedText(result,"id"),storedText(result,"create_operation"),
                        storedText(result,"recipe_id"),storedText(result,"corpus_version"),recipe,Status.valueOf(storedText(result,"status")),
                        Math.toIntExact(storedInteger(result,"current_step")),storedInteger(result,"version"),
                        storedInteger(result,"created_at"),storedInteger(result,"updated_at"),storedInteger(result,"expires_at"));
                var history=new ArrayList<PersistedSessionValidator.Event>();
                try (var events=c.prepareStatement("SELECT * FROM session_actions WHERE session_id=? ORDER BY version LIMIT ?")) {
                    events.setString(1,id);
                    events.setInt(2,MAX_ACTIONS+1);
                    try (var rows=events.executeQuery()) {
                        while (rows.next()) history.add(new PersistedSessionValidator.Event(storedText(rows,"operation_id"),
                                Action.valueOf(storedText(rows,"action")),storedInteger(rows,"expected_version"),storedInteger(rows,"version"),
                                Math.toIntExact(storedInteger(rows,"current_step")),storedInteger(rows,"created_at")));
                    }
                }
                storedValidator.validate(state,history);
                var events=history.stream().map(event -> new ActionEvent(event.operationId(),event.action(),event.version(),event.currentStep(),instant(event.createdAt()))).toList();
                return new Session(id,state.corpusVersion(),recipe.updatedAt(),recipe,state.status(),state.currentStep(),recipe.instructions().size(),state.version(),
                        instant(state.createdAt()),instant(state.updatedAt()),instant(state.expiresAt()),events,List.of());
            }
        } catch (ApiFailure e) { throw e; }
        catch (Exception e) { throw PersistedSessionValidator.unavailable(); }
    }
    private String storedText(ResultSet row, String field) throws SQLException {
        if (row.getObject(field) instanceof String value) return value;
        throw PersistedSessionValidator.unavailable();
    }
    private long storedInteger(ResultSet row, String field) throws SQLException {
        Object value=row.getObject(field);
        if (value instanceof Integer || value instanceof Long) return ((Number)value).longValue();
        throw PersistedSessionValidator.unavailable();
    }
    private String instant(long time) { return Instant.ofEpochMilli(time).toString(); }
}
