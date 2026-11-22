package com.cooklens.service;

import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.*;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class PersistedSessionValidatorTest {
    private static final long LIFETIME = Duration.ofHours(24).toMillis();
    private static final int MAX_ACTIONS = 100;
    private static final long BASE_TIME = 1_760_000_000_000L;

    private PersistedSessionValidator validator;
    private RuntimeContract contract;

    @BeforeEach
    void setUp() throws Exception {
        ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        contract = new RuntimeContract(mapper);
        Validator beanValidator = Validation.buildDefaultValidatorFactory().getValidator();
        GatewayService gateway = new GatewayService(contract, null, null, beanValidator, mapper);
        validator = new PersistedSessionValidator(gateway, LIFETIME, MAX_ACTIONS);
    }

    private static Recipe sampleRecipe(String id, int stepCount) {
        List<Instruction> instructions = new ArrayList<>();
        for (int i = 1; i <= stepCount; i++) {
            instructions.add(new Instruction(i, "Bước " + i, BigDecimal.valueOf(5)));
        }
        return new Recipe(
                id,
                "Phở bò mẫu",
                "pho",
                "vi",
                "vietnamese",
                BigDecimal.valueOf(2),
                BigDecimal.valueOf(15),
                BigDecimal.valueOf(30),
                List.of(new Ingredient("Bánh phở", "banh pho", false, BigDecimal.valueOf(200), "g", null)),
                instructions,
                List.of("truyen-thong"),
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                new Source(
                        "CookLens Corpus",
                        "https://example.com/recipes/" + id,
                        "CC-BY-4.0",
                        "2026-01-01T00:00:00Z",
                        "CookLens",
                        null,
                        ""));
    }

    private static PersistedSessionValidator.State state(
            String id,
            String createOp,
            String recipeId,
            String corpusVersion,
            Recipe recipe,
            Status status,
            int currentStep,
            long version,
            long createdAt,
            long updatedAt,
            long expiresAt) {
        return new PersistedSessionValidator.State(
                id, createOp, recipeId, corpusVersion, recipe, status, currentStep, version, createdAt, updatedAt, expiresAt);
    }

    private static void assertStorageUnavailable(Runnable call) {
        ApiFailure failure = assertThrows(ApiFailure.class, call::run);
        assertEquals(503, failure.status());
        assertEquals("ASSISTANT_STORAGE_UNAVAILABLE", failure.code());
    }

    @Test
    void acceptsValidReadyCookingBoundsAndFinishedSessions() {
        Recipe recipe = sampleRecipe("pho-bo-1", 3);
        String id = UUID.randomUUID().toString();
        String createOp = UUID.randomUUID().toString();

        // Ready state with zero events
        assertDoesNotThrow(() -> validator.validate(
                state(id, createOp, "pho-bo-1", contract.corpusVersion, recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Full walk: start -> previous (clamp 1) -> repeat -> next (2) -> next (3) -> next (clamp 3) -> previous (2) -> finish
        List<PersistedSessionValidator.Event> events = List.of(
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.start, 0, 1, 1, BASE_TIME + 10),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.previous, 1, 2, 1, BASE_TIME + 20),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.repeat, 2, 3, 1, BASE_TIME + 30),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.next, 3, 4, 2, BASE_TIME + 40),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.next, 4, 5, 3, BASE_TIME + 50),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.next, 5, 6, 3, BASE_TIME + 60),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.previous, 6, 7, 2, BASE_TIME + 70),
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.finish, 7, 8, 2, BASE_TIME + 80));

        assertDoesNotThrow(() -> validator.validate(
                state(id, createOp, "pho-bo-1", contract.corpusVersion, recipe, Status.finished, 2, 8, BASE_TIME, BASE_TIME + 80, BASE_TIME + LIFETIME),
                events));

        // Direct finish from ready preserves current_step = 0
        List<PersistedSessionValidator.Event> readyFinish = List.of(
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.finish, 0, 1, 0, BASE_TIME + 5));
        assertDoesNotThrow(() -> validator.validate(
                state(id, createOp, "pho-bo-1", contract.corpusVersion, recipe, Status.finished, 0, 1, BASE_TIME, BASE_TIME + 5, BASE_TIME + LIFETIME),
                readyFinish));
    }

    @Test
    void acceptsHistoricalCorpusVersionAndBackwardsClockTimestamps() {
        Recipe recipe = sampleRecipe("pho-bo-old", 2);
        String id = UUID.randomUUID().toString();
        String createOp = UUID.randomUUID().toString();
        long backwardsTimestamp = BASE_TIME - 60_000L;
        List<PersistedSessionValidator.Event> events = List.of(
                new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.start, 0, 1, 1, backwardsTimestamp));

        assertDoesNotThrow(() -> validator.validate(
                state(id, createOp, "pho-bo-old", "legacy-corpus-v0", recipe, Status.cooking, 1, 1, BASE_TIME, backwardsTimestamp, BASE_TIME + LIFETIME),
                events));
    }

    @Test
    void acceptsHundredEventsWhenFinalSlotIsFinishAndRejectsNonFinishInFinalSlot() {
        Recipe recipe = sampleRecipe("pho-limit", 2);
        String id = UUID.randomUUID().toString();
        String createOp = UUID.randomUUID().toString();

        List<PersistedSessionValidator.Event> validHundred = new ArrayList<>();
        validHundred.add(new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.start, 0, 1, 1, BASE_TIME + 1));
        for (int v = 2; v <= 99; v++) {
            validHundred.add(new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.repeat, v - 1, v, 1, BASE_TIME + v));
        }
        validHundred.add(new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.finish, 99, 100, 1, BASE_TIME + 100));

        assertDoesNotThrow(() -> validator.validate(
                state(id, createOp, "pho-limit", contract.corpusVersion, recipe, Status.finished, 1, 100, BASE_TIME, BASE_TIME + 100, BASE_TIME + LIFETIME),
                validHundred));

        // 100th event is repeat instead of finish -> must fail with 503
        List<PersistedSessionValidator.Event> invalidHundred = new ArrayList<>(validHundred.subList(0, 99));
        invalidHundred.add(new PersistedSessionValidator.Event(UUID.randomUUID().toString(), Action.repeat, 99, 100, 1, BASE_TIME + 100));

        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-limit", contract.corpusVersion, recipe, Status.cooking, 1, 100, BASE_TIME, BASE_TIME + 100, BASE_TIME + LIFETIME),
                invalidHundred));
    }

    @Test
    void rejectsCorruptMetadataUuidsRecipeSnapshotAndExpiry() {
        Recipe recipe = sampleRecipe("pho-meta", 2);
        String id = UUID.randomUUID().toString();
        String createOp = UUID.randomUUID().toString();

        // Non-canonical uppercase UUID
        assertStorageUnavailable(() -> validator.validate(
                state(id.toUpperCase(Locale.ROOT), createOp, "pho-meta", contract.corpusVersion, recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Blank or oversized corpus_version
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-meta", "   ", recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-meta", "v".repeat(101), recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Mismatched recipe_id vs recipe.id()
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "other-recipe", contract.corpusVersion, recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Unsafe source URL
        Recipe unsafeUrlRecipe = new Recipe(
                recipe.id(), recipe.title(), recipe.normalizedDish(), recipe.language(), recipe.cuisine(),
                recipe.servings(), recipe.prepTimeMinutes(), recipe.cookTimeMinutes(),
                recipe.ingredients(), recipe.instructions(), recipe.tags(), recipe.createdAt(), recipe.updatedAt(),
                new Source("Bad", "javascript:alert(1)", "CC-BY-4.0", "2026-01-01T00:00:00Z", "Bad", null, ""));
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-meta", contract.corpusVersion, unsafeUrlRecipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Non-sequential instruction steps (1, 3)
        Recipe badStepsRecipe = new Recipe(
                recipe.id(), recipe.title(), recipe.normalizedDish(), recipe.language(), recipe.cuisine(),
                recipe.servings(), recipe.prepTimeMinutes(), recipe.cookTimeMinutes(),
                recipe.ingredients(),
                List.of(new Instruction(1, "Step 1", null), new Instruction(3, "Step 3", null)),
                recipe.tags(), recipe.createdAt(), recipe.updatedAt(), recipe.source());
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-meta", contract.corpusVersion, badStepsRecipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME),
                List.of()));

        // Wrong expiresAt
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-meta", contract.corpusVersion, recipe, Status.ready, 0, 0, BASE_TIME, BASE_TIME, BASE_TIME + LIFETIME + 1),
                List.of()));
    }

    @Test
    void rejectsInconsistentHistoryVersionsTransitionsStepsAndTimestamps() {
        Recipe recipe = sampleRecipe("pho-hist", 2);
        String id = UUID.randomUUID().toString();
        String createOp = UUID.randomUUID().toString();
        String op1 = UUID.randomUUID().toString();
        String op2 = UUID.randomUUID().toString();

        // Duplicate operation_id in history
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.cooking, 2, 2, BASE_TIME, BASE_TIME + 20, BASE_TIME + LIFETIME),
                List.of(
                        new PersistedSessionValidator.Event(op1, Action.start, 0, 1, 1, BASE_TIME + 10),
                        new PersistedSessionValidator.Event(op1, Action.next, 1, 2, 2, BASE_TIME + 20))));

        // Version mismatch between state and history size
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.cooking, 1, 2, BASE_TIME, BASE_TIME + 10, BASE_TIME + LIFETIME),
                List.of(new PersistedSessionValidator.Event(op1, Action.start, 0, 1, 1, BASE_TIME + 10))));

        // Action after finished
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.finished, 0, 2, BASE_TIME, BASE_TIME + 20, BASE_TIME + LIFETIME),
                List.of(
                        new PersistedSessionValidator.Event(op1, Action.finish, 0, 1, 0, BASE_TIME + 10),
                        new PersistedSessionValidator.Event(op2, Action.repeat, 1, 2, 0, BASE_TIME + 20))));

        // Invalid transition: next from ready
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.ready, 1, 1, BASE_TIME, BASE_TIME + 10, BASE_TIME + LIFETIME),
                List.of(new PersistedSessionValidator.Event(op1, Action.next, 0, 1, 1, BASE_TIME + 10))));

        // Wrong current_step recorded on event
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.cooking, 2, 1, BASE_TIME, BASE_TIME + 10, BASE_TIME + LIFETIME),
                List.of(new PersistedSessionValidator.Event(op1, Action.start, 0, 1, 2, BASE_TIME + 10))));

        // State current_step disagrees with replayed history
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.cooking, -2, 1, BASE_TIME, BASE_TIME + 10, BASE_TIME + LIFETIME),
                List.of(new PersistedSessionValidator.Event(op1, Action.start, 0, 1, 1, BASE_TIME + 10))));

        // State updatedAt disagrees with last event timestamp
        assertStorageUnavailable(() -> validator.validate(
                state(id, createOp, "pho-hist", contract.corpusVersion, recipe, Status.cooking, 1, 1, BASE_TIME, BASE_TIME + 999, BASE_TIME + LIFETIME),
                List.of(new PersistedSessionValidator.Event(op1, Action.start, 0, 1, 1, BASE_TIME + 10))));
    }
}
