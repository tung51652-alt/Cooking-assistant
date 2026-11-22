package com.cooklens.service;

import com.cooklens.client.RecipesClient;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.*;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import com.cooklens.repository.SessionStore;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AssistantServiceTest {
    @TempDir
    Path tempDir;

    private RuntimeContract contract;
    private RecipesClient recipesClient;
    private AssistantService service;
    private Path dbPath;

    @BeforeEach
    void setUp() throws Exception {
        ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        contract = new RuntimeContract(mapper);
        Validator beanValidator = Validation.buildDefaultValidatorFactory().getValidator();
        recipesClient = mock(RecipesClient.class);
        GatewayService gateway = new GatewayService(contract, null, recipesClient, beanValidator, mapper);
        dbPath = tempDir.resolve("sessions.sqlite");
        SessionStore store = new SessionStore(dbPath.toString());
        service = new AssistantService(store, gateway, contract, mapper, beanValidator);
    }

    private static Recipe recipe(String id, String dish, int stepCount) {
        List<Instruction> instructions = new ArrayList<>();
        for (int i = 1; i <= stepCount; i++) {
            instructions.add(new Instruction(i, "Bước " + i + " cho " + id, BigDecimal.valueOf(i * 5L)));
        }
        return new Recipe(
                id,
                "Công thức " + id,
                dish,
                "vi",
                "vietnamese",
                BigDecimal.valueOf(2),
                BigDecimal.valueOf(10),
                BigDecimal.valueOf(20),
                List.of(new Ingredient("Nguyên liệu", "nguyen lieu", false, BigDecimal.valueOf(100), "g", null)),
                instructions,
                List.of("mvp"),
                "2026-01-01T00:00:00Z",
                "2026-01-05T00:00:00Z",
                new Source(
                        "CookLens",
                        "https://example.com/recipes/" + id,
                        "CC-BY-4.0",
                        "2026-01-01T00:00:00Z",
                        "CookLens",
                        null,
                        ""));
    }

    private void stubRecipe(Recipe r) {
        when(recipesClient.detail(eq(r.id()), anyString()))
                .thenReturn(new DetailResult(contract.corpusVersion, r));
    }

    private static ApiFailure assertFailure(int status, String code, Runnable call) {
        ApiFailure failure = assertThrows(ApiFailure.class, call::run);
        assertEquals(status, failure.status(), "Unexpected HTTP status for " + failure.code());
        assertEquals(code, failure.code());
        return failure;
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }

    @Test
    void parseEnforcesStrictJsonTypesAndConstraints() {
        String op = uuid();
        CreateSession created = service.parse(
                utf8("{\"recipe_id\":\"pho-1\",\"corpus_version\":\"" + contract.corpusVersion + "\",\"operation_id\":\"" + op + "\"}"),
                CreateSession.class);
        assertEquals("pho-1", created.recipeId());
        assertEquals(contract.corpusVersion, created.corpusVersion());
        assertEquals(op, created.operationId());

        SessionAction action = service.parse(
                utf8("{\"action\":\"start\",\"expected_version\":0,\"operation_id\":\"" + op + "\"}"),
                SessionAction.class);
        assertEquals(Action.start, action.action());
        assertEquals(0L, action.expectedVersion());

        SessionMessage msg = service.parse(
                utf8("{\"text\":\"Lửa nhỏ bao lâu?\",\"expected_version\":1,\"operation_id\":\"" + op + "\"}"),
                SessionMessage.class);
        assertEquals("Lửa nhỏ bao lâu?", msg.text());

        // Non-object / malformed / unknown field / duplicate key / coercion / invalid pattern
        List<String> invalidCreatePayloads = List.of(
                "[]",
                "null",
                "{broken",
                "{\"recipe_id\":\"pho-1\",\"corpus_version\":\"v1\",\"operation_id\":\"" + op + "\",\"extra\":true}",
                "{\"recipe_id\":\"pho-1\",\"recipe_id\":\"pho-1\",\"corpus_version\":\"v1\",\"operation_id\":\"" + op + "\"}",
                "{\"recipe_id\":123,\"corpus_version\":\"v1\",\"operation_id\":\"" + op + "\"}",
                "{\"recipe_id\":\"INVALID_UPPER\",\"corpus_version\":\"v1\",\"operation_id\":\"" + op + "\"}",
                "{\"recipe_id\":\"pho-1\",\"corpus_version\":\"\",\"operation_id\":\"" + op + "\"}",
                "{\"recipe_id\":\"pho-1\",\"corpus_version\":\"" + "c".repeat(101) + "\",\"operation_id\":\"" + op + "\"}");
        for (String payload : invalidCreatePayloads) {
            assertFailure(422, "VALIDATION_ERROR", () -> service.parse(utf8(payload), CreateSession.class));
        }

        List<String> invalidActionPayloads = List.of(
                "{\"action\":\"jump\",\"expected_version\":0,\"operation_id\":\"" + op + "\"}",
                "{\"action\":\"start\",\"expected_version\":\"0\",\"operation_id\":\"" + op + "\"}",
                "{\"action\":\"start\",\"expected_version\":0.0,\"operation_id\":\"" + op + "\"}",
                "{\"action\":\"start\",\"expected_version\":true,\"operation_id\":\"" + op + "\"}",
                "{\"action\":\"start\",\"expected_version\":-1,\"operation_id\":\"" + op + "\"}",
                "{\"action\":\"start\",\"expected_version\":0,\"operation_id\":123}");
        for (String payload : invalidActionPayloads) {
            assertFailure(422, "VALIDATION_ERROR", () -> service.parse(utf8(payload), SessionAction.class));
        }

        List<String> invalidMessagePayloads = List.of(
                "{\"text\":\"   \",\"expected_version\":0,\"operation_id\":\"" + op + "\"}",
                "{\"text\":\"" + "a".repeat(2001) + "\",\"expected_version\":0,\"operation_id\":\"" + op + "\"}",
                "{\"text\":42,\"expected_version\":0,\"operation_id\":\"" + op + "\"}");
        for (String payload : invalidMessagePayloads) {
            assertFailure(422, "VALIDATION_ERROR", () -> service.parse(utf8(payload), SessionMessage.class));
        }
    }

    @Test
    void allActionsStepBoundsAndHistoryProgression() {
        Recipe pho = recipe("pho-3-steps", "pho", 3);
        stubRecipe(pho);

        String reqId = uuid();
        SessionResponse created = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), reqId);
        assertEquals(contract.apiVersion, created.apiVersion());
        assertEquals(reqId, created.requestId());
        Session s = created.session();
        assertEquals(Status.ready, s.status());
        assertEquals(0, s.currentStep());
        assertEquals(3, s.totalSteps());
        assertEquals(0L, s.version());
        assertEquals(pho.updatedAt(), s.recipeVersion());
        assertTrue(s.history().isEmpty());
        assertTrue(s.messages().isEmpty());
        assertEquals(
                Instant.parse(s.createdAt()).plus(Duration.ofHours(24)),
                Instant.parse(s.expiresAt()));

        // Before start: next, previous, repeat are rejected without mutating version
        for (Action disallowed : List.of(Action.next, Action.previous, Action.repeat)) {
            assertFailure(409, "INVALID_SESSION_ACTION",
                    () -> service.act(s.id(), new SessionAction(disallowed, 0L, uuid()), uuid()));
        }
        assertEquals(0L, service.get(s.id(), uuid()).session().version());

        // start -> cooking, step 1, version 1
        Session s1 = service.act(s.id(), new SessionAction(Action.start, 0L, uuid()), uuid()).session();
        assertEquals(Status.cooking, s1.status());
        assertEquals(1, s1.currentStep());
        assertEquals(1L, s1.version());

        // start again while cooking -> 409 INVALID_SESSION_ACTION
        assertFailure(409, "INVALID_SESSION_ACTION",
                () -> service.act(s.id(), new SessionAction(Action.start, 1L, uuid()), uuid()));

        // previous at first step (bound 1) -> stays at 1, version increments
        Session s2 = service.act(s.id(), new SessionAction(Action.previous, 1L, uuid()), uuid()).session();
        assertEquals(Status.cooking, s2.status());
        assertEquals(1, s2.currentStep());
        assertEquals(2L, s2.version());

        // repeat -> stays at 1, version increments
        Session s3 = service.act(s.id(), new SessionAction(Action.repeat, 2L, uuid()), uuid()).session();
        assertEquals(1, s3.currentStep());
        assertEquals(3L, s3.version());

        // next -> step 2 -> step 3
        Session s4 = service.act(s.id(), new SessionAction(Action.next, 3L, uuid()), uuid()).session();
        assertEquals(2, s4.currentStep());
        assertEquals(4L, s4.version());

        Session s5 = service.act(s.id(), new SessionAction(Action.next, 4L, uuid()), uuid()).session();
        assertEquals(3, s5.currentStep());
        assertEquals(5L, s5.version());

        // next at last step (bound N) -> stays at 3, remains cooking (does NOT auto-finish), version increments
        Session s6 = service.act(s.id(), new SessionAction(Action.next, 5L, uuid()), uuid()).session();
        assertEquals(Status.cooking, s6.status());
        assertEquals(3, s6.currentStep());
        assertEquals(6L, s6.version());

        // previous from last step -> step 2
        Session s7 = service.act(s.id(), new SessionAction(Action.previous, 6L, uuid()), uuid()).session();
        assertEquals(2, s7.currentStep());
        assertEquals(7L, s7.version());

        // finish -> finished, preserves current_step = 2
        Session s8 = service.act(s.id(), new SessionAction(Action.finish, 7L, uuid()), uuid()).session();
        assertEquals(Status.finished, s8.status());
        assertEquals(2, s8.currentStep());
        assertEquals(8L, s8.version());
        assertEquals(8, s8.history().size());
        assertEquals(
                List.of(Action.start, Action.previous, Action.repeat, Action.next, Action.next, Action.next, Action.previous, Action.finish),
                s8.history().stream().map(ActionEvent::action).toList());
        assertEquals(List.of(1, 1, 1, 2, 3, 3, 2, 2), s8.history().stream().map(ActionEvent::currentStep).toList());
    }

    @Test
    void singleStepRecipeBoundsAndFinishFromReady() {
        Recipe oneStep = recipe("pho-1-step", "pho", 1);
        stubRecipe(oneStep);

        // Finish directly from ready keeps current_step = 0
        Session ready = service.create(new CreateSession(oneStep.id(), contract.corpusVersion, uuid()), uuid()).session();
        Session finishedFromReady = service.act(ready.id(), new SessionAction(Action.finish, 0L, uuid()), uuid()).session();
        assertEquals(Status.finished, finishedFromReady.status());
        assertEquals(0, finishedFromReady.currentStep());
        assertEquals(1L, finishedFromReady.version());

        // Single-step recipe: start -> 1, next -> 1 (still cooking), previous -> 1, repeat -> 1, finish -> finished at 1
        Session s = service.create(new CreateSession(oneStep.id(), contract.corpusVersion, uuid()), uuid()).session();
        s = service.act(s.id(), new SessionAction(Action.start, 0L, uuid()), uuid()).session();
        assertEquals(1, s.currentStep());
        s = service.act(s.id(), new SessionAction(Action.next, 1L, uuid()), uuid()).session();
        assertEquals(Status.cooking, s.status());
        assertEquals(1, s.currentStep());
        s = service.act(s.id(), new SessionAction(Action.previous, 2L, uuid()), uuid()).session();
        assertEquals(1, s.currentStep());
        s = service.act(s.id(), new SessionAction(Action.repeat, 3L, uuid()), uuid()).session();
        assertEquals(1, s.currentStep());
        s = service.act(s.id(), new SessionAction(Action.finish, 4L, uuid()), uuid()).session();
        assertEquals(Status.finished, s.status());
        assertEquals(1, s.currentStep());
        assertEquals(5L, s.version());
    }

    @Test
    void terminalStateBlocksNewActionsAndMessagesButAllowsReplay() {
        Recipe pho = recipe("pho-term", "pho", 2);
        stubRecipe(pho);

        String createOp = uuid();
        String startOp = uuid();
        String finishOp = uuid();
        Session s = service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()).session();
        s = service.act(s.id(), new SessionAction(Action.start, 0L, startOp), uuid()).session();
        Session finished = service.act(s.id(), new SessionAction(Action.finish, 1L, finishOp), uuid()).session();
        assertEquals(Status.finished, finished.status());

        for (Action action : Action.values()) {
            assertFailure(409, "SESSION_FINISHED",
                    () -> service.act(finished.id(), new SessionAction(action, 2L, uuid()), uuid()));
        }
        assertFailure(409, "SESSION_FINISHED",
                () -> service.message(finished.id(), new SessionMessage("Xong chưa?", 2L, uuid()), uuid()));

        // Replaying create, start, and finish after finished returns latest state without mutation
        assertEquals(finished, service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()).session());
        assertEquals(finished, service.act(finished.id(), new SessionAction(Action.start, 0L, startOp), uuid()).session());
        assertEquals(finished, service.act(finished.id(), new SessionAction(Action.finish, 1L, finishOp), uuid()).session());
    }

    @Test
    void historyLimitReservesLastSlotForFinish() {
        Recipe pho = recipe("pho-limit", "pho", 2);
        stubRecipe(pho);

        String startOp = uuid();
        Session s = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();
        s = service.act(s.id(), new SessionAction(Action.start, 0L, startOp), uuid()).session();
        for (long v = 1; v < 99; v++) {
            s = service.act(s.id(), new SessionAction(Action.repeat, v, uuid()), uuid()).session();
        }
        assertEquals(99L, s.version());
        assertEquals(99, s.history().size());
        assertEquals(Status.cooking, s.status());

        // At 99 events, only finish is allowed; non-finish actions fail with 409 SESSION_HISTORY_LIMIT
        String sessionId = s.id();
        for (Action nonFinish : List.of(Action.next, Action.previous, Action.repeat, Action.start)) {
            assertFailure(409, "SESSION_HISTORY_LIMIT",
                    () -> service.act(sessionId, new SessionAction(nonFinish, 99L, uuid()), uuid()));
        }
        assertEquals(99L, service.get(sessionId, uuid()).session().version());

        // 100th slot accepts finish and preserves full 100-event history without trimming
        String finishOp = uuid();
        Session finished = service.act(sessionId, new SessionAction(Action.finish, 99L, finishOp), uuid()).session();
        assertEquals(Status.finished, finished.status());
        assertEquals(100L, finished.version());
        assertEquals(100, finished.history().size());
        assertEquals(startOp, finished.history().get(0).operationId());
        assertEquals(finishOp, finished.history().get(99).operationId());

        // Replay still succeeds at 100 events
        assertEquals(finished, service.act(sessionId, new SessionAction(Action.start, 0L, startOp), uuid()).session());
        assertEquals(finished, service.act(sessionId, new SessionAction(Action.finish, 99L, finishOp), uuid()).session());
    }

    @Test
    void duplicateConflictingOperationsStaleVersionAndConcurrentWrites() throws Exception {
        Recipe pho = recipe("pho-ops", "pho", 3);
        stubRecipe(pho);

        String createOp = uuid();
        Session created = service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()).session();
        // Exact replay (with uppercase UUID) returns same session without another upstream call
        Session replayedCreate = service.create(
                new CreateSession(pho.id(), contract.corpusVersion, createOp.toUpperCase(Locale.ROOT)), uuid()).session();
        assertEquals(created.id(), replayedCreate.id());
        verify(recipesClient, times(1)).detail(eq(pho.id()), anyString());

        // Conflicting create operation (different recipe or corpus_version) -> 409 OPERATION_CONFLICT
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.create(new CreateSession("other-recipe", contract.corpusVersion, createOp), uuid()));
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.create(new CreateSession(pho.id(), "other-corpus", createOp), uuid()));

        String startOp = uuid();
        Session started = service.act(created.id(), new SessionAction(Action.start, 0L, startOp), uuid()).session();
        // Conflicting action operation (different action or expected_version) -> 409 OPERATION_CONFLICT
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.act(created.id(), new SessionAction(Action.finish, 0L, startOp), uuid()));
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.act(created.id(), new SessionAction(Action.start, 1L, startOp), uuid()));

        // Stale and future expected_version -> 409 SESSION_VERSION_CONFLICT
        assertFailure(409, "SESSION_VERSION_CONFLICT",
                () -> service.act(created.id(), new SessionAction(Action.next, 0L, uuid()), uuid()));
        assertFailure(409, "SESSION_VERSION_CONFLICT",
                () -> service.act(created.id(), new SessionAction(Action.next, 5L, uuid()), uuid()));

        // Message checks version first, then returns 503 ASSISTANT_NOT_CONFIGURED without mutating session
        assertFailure(409, "SESSION_VERSION_CONFLICT",
                () -> service.message(created.id(), new SessionMessage("Hỏi", 0L, uuid()), uuid()));
        assertFailure(503, "ASSISTANT_NOT_CONFIGURED",
                () -> service.message(created.id(), new SessionMessage("Hỏi", 1L, uuid()), uuid()));
        assertEquals(started, service.get(created.id(), uuid()).session());

        // Concurrent competing operations at expected_version=1: exactly one wins, the other gets 409 SESSION_VERSION_CONFLICT
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch go = new CountDownLatch(1);
            Callable<Object> task = () -> {
                ready.countDown();
                go.await(5, TimeUnit.SECONDS);
                try {
                    return service.act(created.id(), new SessionAction(Action.next, 1L, uuid()), uuid()).session();
                } catch (ApiFailure failure) {
                    return failure;
                }
            };
            Future<Object> f1 = pool.submit(task);
            Future<Object> f2 = pool.submit(task);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            go.countDown();

            List<Object> results = List.of(f1.get(10, TimeUnit.SECONDS), f2.get(10, TimeUnit.SECONDS));
            long successes = results.stream().filter(Session.class::isInstance).count();
            long conflicts = results.stream()
                    .filter(ApiFailure.class::isInstance)
                    .map(ApiFailure.class::cast)
                    .filter(f -> f.status() == 409 && "SESSION_VERSION_CONFLICT".equals(f.code()))
                    .count();
            assertEquals(1, successes, "Exactly one concurrent writer must succeed");
            assertEquals(1, conflicts, "The losing concurrent writer must receive 409 SESSION_VERSION_CONFLICT");

            Session after = service.get(created.id(), uuid()).session();
            assertEquals(2L, after.version());
            assertEquals(2, after.currentStep());
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void expiryPrecedenceOverReplayAndPurgeAfterSevenDays() throws Exception {
        Recipe pho = recipe("pho-exp", "pho", 2);
        stubRecipe(pho);

        String createOp = uuid();
        Session created = service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()).session();

        // Expire session by shifting created_at/updated_at/expires_at into the past (keeping 24h lifetime invariant)
        long expiredAt = System.currentTimeMillis() - 60_000L;
        long createdAt = expiredAt - Duration.ofHours(24).toMillis();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
             var ps = c.prepareStatement("UPDATE sessions SET created_at=?, updated_at=?, expires_at=? WHERE id=?")) {
            ps.setLong(1, createdAt);
            ps.setLong(2, createdAt);
            ps.setLong(3, expiredAt);
            ps.setString(4, created.id());
            assertEquals(1, ps.executeUpdate());
        }

        // Expired retained session: get, act, message, and same-payload create replay all return 410 SESSION_EXPIRED
        assertFailure(410, "SESSION_EXPIRED", () -> service.get(created.id(), uuid()));
        assertFailure(410, "SESSION_EXPIRED",
                () -> service.act(created.id(), new SessionAction(Action.start, 0L, uuid()), uuid()));
        assertFailure(410, "SESSION_EXPIRED",
                () -> service.message(created.id(), new SessionMessage("Xin chào", 0L, uuid()), uuid()));
        assertFailure(410, "SESSION_EXPIRED",
                () -> service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()));

        // Retained create operation with different payload returns 409 OPERATION_CONFLICT even when expired
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.create(new CreateSession("different-recipe", contract.corpusVersion, createOp), uuid()));
        assertFailure(409, "OPERATION_CONFLICT",
                () -> service.create(new CreateSession(pho.id(), "different-corpus", createOp), uuid()));

        // Corrupt expired record: 503 ASSISTANT_STORAGE_UNAVAILABLE takes precedence over both 409 and 410
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
             var ps = c.prepareStatement("UPDATE sessions SET current_step=-2 WHERE id=?")) {
            ps.setString(1, created.id());
            assertEquals(1, ps.executeUpdate());
        }
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE", () -> service.get(created.id(), uuid()));
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE",
                () -> service.create(new CreateSession(pho.id(), contract.corpusVersion, createOp), uuid()));
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE",
                () -> service.create(new CreateSession("different-recipe", contract.corpusVersion, createOp), uuid()));

        // Age record past 7-day purge threshold; creating a new session purges it -> 404 SESSION_NOT_FOUND
        long purgeableExpiry = System.currentTimeMillis() - Duration.ofDays(8).toMillis();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
             var ps = c.prepareStatement("UPDATE sessions SET current_step=0, expires_at=? WHERE id=?")) {
            ps.setLong(1, purgeableExpiry);
            ps.setString(2, created.id());
            assertEquals(1, ps.executeUpdate());
        }
        Session fresh = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();
        assertNotEquals(created.id(), fresh.id());
        assertFailure(404, "SESSION_NOT_FOUND", () -> service.get(created.id(), uuid()));
    }

    @Test
    void corruptPersistedStorageAndUnsupportedSchemaReturn503WithoutMutation() throws Exception {
        Recipe pho = recipe("pho-corrupt", "pho", 2);
        stubRecipe(pho);

        Session s1 = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();
        Session s2 = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();
        Session s3 = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();

        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
             var st = c.createStatement()) {
            st.executeUpdate("UPDATE sessions SET recipe_json='{broken' WHERE id='" + s1.id() + "'");
            st.executeUpdate("UPDATE sessions SET current_step='not-an-int' WHERE id='" + s2.id() + "'");
            st.executeUpdate("UPDATE sessions SET current_step=-2 WHERE id='" + s3.id() + "'");
        }

        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE", () -> service.get(s1.id(), uuid()));
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE", () -> service.get(s2.id(), uuid()));
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE", () -> service.get(s3.id(), uuid()));
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE",
                () -> service.act(s3.id(), new SessionAction(Action.start, 0L, uuid()), uuid()));

        // Verify corrupt row was not mutated by rejected reads/writes
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbPath);
             var ps = c.prepareStatement("SELECT current_step, version FROM sessions WHERE id=?")) {
            ps.setString(1, s3.id());
            try (var rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertEquals(-2, rs.getInt("current_step"));
                assertEquals(0L, rs.getLong("version"));
            }
        }

        // Unsupported PRAGMA user_version on a fresh SessionStore returns 503 without downgrading schema
        Path badSchemaDb = tempDir.resolve("bad-schema.sqlite");
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + badSchemaDb);
             var st = c.createStatement()) {
            st.execute("PRAGMA user_version=2");
        }
        ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        Validator beanValidator = Validation.buildDefaultValidatorFactory().getValidator();
        GatewayService gateway = new GatewayService(contract, null, recipesClient, beanValidator, mapper);
        AssistantService badSchemaService = new AssistantService(
                new SessionStore(badSchemaDb.toString()), gateway, contract, mapper, beanValidator);
        assertFailure(503, "ASSISTANT_STORAGE_UNAVAILABLE",
                () -> badSchemaService.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()));

        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + badSchemaDb);
             var st = c.createStatement();
             var rs = st.executeQuery("PRAGMA user_version")) {
            assertTrue(rs.next());
            assertEquals(2, rs.getInt(1));
        }
    }

    @Test
    void recipeErrorsMissingSessionAndParallelSessionIsolation() {
        Recipe pho = recipe("pho-iso", "pho", 3);
        Recipe banhMi = recipe("banh-mi-iso", "banh_mi", 2);
        stubRecipe(pho);
        stubRecipe(banhMi);

        // Wrong corpus_version -> 409 RECIPE_VERSION_MISMATCH without calling upstream
        assertFailure(409, "RECIPE_VERSION_MISMATCH",
                () -> service.create(new CreateSession(pho.id(), "stale-corpus-version", uuid()), uuid()));
        verify(recipesClient, never()).detail(anyString(), anyString());

        // Missing recipe from upstream -> 404 RECIPE_NOT_FOUND
        when(recipesClient.detail(eq("missing-recipe"), anyString()))
                .thenThrow(new ApiFailure(404, "RECIPE_NOT_FOUND"));
        assertFailure(404, "RECIPE_NOT_FOUND",
                () -> service.create(new CreateSession("missing-recipe", contract.corpusVersion, uuid()), uuid()));

        // Upstream returns mismatched corpus_version -> 503 DEPENDENCY_NOT_READY
        when(recipesClient.detail(eq("bad-upstream"), anyString()))
                .thenReturn(new DetailResult("wrong-upstream-corpus", recipe("bad-upstream", "pho", 2)));
        assertFailure(503, "DEPENDENCY_NOT_READY",
                () -> service.create(new CreateSession("bad-upstream", contract.corpusVersion, uuid()), uuid()));

        // Invalid UUID and missing session ID
        assertFailure(422, "VALIDATION_ERROR", () -> service.get("not-a-uuid", uuid()));
        assertFailure(422, "VALIDATION_ERROR",
                () -> service.create(new CreateSession(pho.id(), contract.corpusVersion, "not-a-uuid"), uuid()));
        assertFailure(404, "SESSION_NOT_FOUND", () -> service.get(uuid(), uuid()));
        assertFailure(404, "SESSION_NOT_FOUND",
                () -> service.act(uuid(), new SessionAction(Action.start, 0L, uuid()), uuid()));
        assertFailure(404, "SESSION_NOT_FOUND",
                () -> service.message(uuid(), new SessionMessage("Xin chào", 0L, uuid()), uuid()));

        // Parallel session isolation: two active sessions for different recipes do not mix state/steps/history
        Session sPho = service.create(new CreateSession(pho.id(), contract.corpusVersion, uuid()), uuid()).session();
        Session sBanhMi = service.create(new CreateSession(banhMi.id(), contract.corpusVersion, uuid()), uuid()).session();

        sPho = service.act(sPho.id(), new SessionAction(Action.start, 0L, uuid()), uuid()).session();
        sPho = service.act(sPho.id(), new SessionAction(Action.next, 1L, uuid()), uuid()).session();

        sBanhMi = service.act(sBanhMi.id(), new SessionAction(Action.start, 0L, uuid()), uuid()).session();
        sBanhMi = service.act(sBanhMi.id(), new SessionAction(Action.finish, 1L, uuid()), uuid()).session();

        Session reloadedPho = service.get(sPho.id(), uuid()).session();
        Session reloadedBanhMi = service.get(sBanhMi.id(), uuid()).session();

        assertEquals("pho-iso", reloadedPho.recipe().id());
        assertEquals(Status.cooking, reloadedPho.status());
        assertEquals(2, reloadedPho.currentStep());
        assertEquals(3, reloadedPho.totalSteps());
        assertEquals(2L, reloadedPho.version());

        assertEquals("banh-mi-iso", reloadedBanhMi.recipe().id());
        assertEquals(Status.finished, reloadedBanhMi.status());
        assertEquals(1, reloadedBanhMi.currentStep());
        assertEquals(2, reloadedBanhMi.totalSteps());
        assertEquals(2L, reloadedBanhMi.version());
    }
}
