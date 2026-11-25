package com.cooklens.service;

import com.cooklens.dto.ApiModels.Recipe;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import com.cooklens.repository.SessionOperations;
import com.cooklens.repository.SessionOperations.Operation;
import java.util.*;

final class PersistedSessionValidator {
    record State(String id, String createOperation, String recipeId, String corpusVersion, Recipe recipe,
                 Status status, int currentStep, long version, long createdAt, long updatedAt, long expiresAt) {}
    record Event(String operationId, Action action, long expectedVersion, long version, int currentStep, long createdAt) {}
    record Turn(String operationId, long expectedVersion, long version, String userText, String assistantText,
                long createdAt, String provider, String model, Long inputTokens, Long outputTokens) {}
    private final GatewayService gateway;
    private final long lifetime;
    private final int maxActions;
    PersistedSessionValidator(GatewayService gateway, long lifetime, int maxActions) {
        this.gateway=gateway; this.lifetime=lifetime; this.maxActions=maxActions;
    }
    void validate(State state, List<Event> events) {
        validate(state,events,List.of());
    }
    void validate(State state, List<Event> events, List<Turn> turns) {
        try {
            canonicalUuid(state.id()); canonicalUuid(state.createOperation());
            require(state.corpusVersion() != null && !state.corpusVersion().isBlank() && state.corpusVersion().length() <= 100);
            // Validate the pinned snapshot, without comparing its corpus version to today's manifest.
            gateway.validateRecipeSnapshot(state.recipeId(),state.recipe());
            require(state.expiresAt() == Math.addExact(state.createdAt(),lifetime));
            require(events.size() <= maxActions && turns.size() <= 30 && state.version() == events.size()+turns.size());
            var revisions=new TreeMap<Long,Object>();
            for (var event : events) require(revisions.put(event.version(),event) == null);
            for (var turn : turns) require(revisions.put(turn.version(),turn) == null);
            int step=0, total=state.recipe().instructions().size();
            Status status=Status.ready;
            long updated=state.createdAt();
            var operations=new HashSet<String>();
            int actionCount=0;
            for (long version=1; version<=state.version(); version++) {
                Object revision=revisions.get(version);
                require(status != Status.finished);
                if (revision instanceof Turn turn) {
                    canonicalUuid(turn.operationId());
                    require(operations.add(turn.operationId()) && turn.expectedVersion() == version-1);
                    require(turn.userText() != null && !turn.userText().isBlank() && turn.userText().length()<=2000);
                    require(turn.assistantText() != null && !turn.assistantText().isBlank() && turn.assistantText().length()<=16384);
                    require(turn.provider() != null && !turn.provider().isBlank() && turn.provider().length()<=100);
                    require(turn.model() != null && !turn.model().isBlank() && turn.model().length()<=200);
                    require(turn.inputTokens() == null || turn.inputTokens()>=0);
                    require(turn.outputTokens() == null || turn.outputTokens()>=0);
                    updated=turn.createdAt();
                    continue;
                }
                require(revision instanceof Event);
                var event=(Event)revision;
                canonicalUuid(event.operationId());
                require(operations.add(event.operationId()) && event.expectedVersion() == version-1);
                require(++actionCount < maxActions || event.action() == Action.finish);
                switch (event.action()) {
                    case start -> { require(status == Status.ready); status=Status.cooking; step=1; }
                    case finish -> status=Status.finished;
                    case next, previous, repeat -> {
                        require(status == Status.cooking);
                        if (event.action() == Action.next) step=Math.min(step+1,total);
                        if (event.action() == Action.previous) step=Math.max(1,step-1);
                    }
                }
                require(event.currentStep() == step);
                // Versions define order; wall-clock timestamps can move backwards after a clock adjustment.
                updated=event.createdAt();
            }
            require(state.status() == status && state.currentStep() == step && state.updatedAt() == updated);
        } catch (RuntimeException e) { throw unavailable(); }
    }
    void validateOperations(State state, List<Event> events, List<Turn> turns, List<Operation> operations) {
        try {
            var byId=new HashMap<String,Operation>();
            int completed=0, pending=0;
            for (var op : operations) {
                canonicalUuid(op.id());
                require(byId.put(op.id(),op) == null && op.fingerprint().matches("[0-9a-f]{64}"));
                require(List.of("action","message","message_action").contains(op.kind()));
                if (op.kind().equals("message_action")) require(op.commandText()!=null && op.commandText().length()<=2000 && CookingCommands.parse(op.commandText())!=null);
                else require(op.commandText()==null);
                require(op.expectedVersion()>=0 && op.expectedVersion()<=state.version());
                if (op.kind().equals("message")) require(op.deadline() != null && op.deadline() == Math.addExact(op.createdAt(),25000));
                else require(op.deadline() == null);
                switch (op.status()) {
                    case "completed" -> {
                        completed++;
                        require(op.committedVersion() != null && op.committedVersion() == op.expectedVersion()+1);
                        require(op.errorStatus() == null && op.errorCode() == null);
                    }
                    case "pending" -> {
                        require(op.kind().equals("message") && ++pending<=1);
                        require(op.committedVersion() == null && op.errorStatus() == null && op.errorCode() == null);
                    }
                    case "failed" -> {
                        require(op.kind().equals("message") && op.committedVersion() == null);
                        require(op.errorStatus() != null && op.errorStatus()>=400 && op.errorStatus()<=599);
                        require(op.errorCode() != null && op.errorCode().matches("[A-Z][A-Z0-9_]{0,99}"));
                    }
                    default -> throw unavailable();
                }
            }
            require(completed == events.size()+turns.size());
            for (var event : events) {
                var op=byId.get(event.operationId());
                require(op != null && (op.kind().equals("action") || op.kind().equals("message_action")) && op.status().equals("completed"));
                if (op.kind().equals("action")) require(op.fingerprint().equals(SessionOperations.actionFingerprint(event.action(),event.expectedVersion())));
                else {
                    require(CookingCommands.parse(op.commandText()) == event.action());
                    require(op.fingerprint().equals(SessionOperations.fingerprint("message_action",op.commandText(),event.expectedVersion())));
                }
                require(op.expectedVersion() == event.expectedVersion() && op.committedVersion() == event.version() && op.createdAt() == event.createdAt());
            }
            for (var turn : turns) {
                var op=byId.get(turn.operationId());
                require(op != null && op.kind().equals("message") && op.status().equals("completed"));
                require(op.fingerprint().equals(SessionOperations.fingerprint("message",turn.userText(),turn.expectedVersion())));
                require(op.expectedVersion() == turn.expectedVersion() && op.committedVersion() == turn.version());
            }
        } catch (RuntimeException e) { throw unavailable(); }
    }
    private void canonicalUuid(String value) { require(UUID.fromString(value).toString().equals(value)); }
    private void require(boolean condition) { if (!condition) throw unavailable(); }
    static ApiFailure unavailable() { return new ApiFailure(503,"ASSISTANT_STORAGE_UNAVAILABLE"); }
}
