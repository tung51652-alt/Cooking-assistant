package com.cooklens.service;

import com.cooklens.dto.ApiModels.Recipe;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.exception.ApiFailure;
import java.util.*;

final class PersistedSessionValidator {
    record State(String id, String createOperation, String recipeId, String corpusVersion, Recipe recipe,
                 Status status, int currentStep, long version, long createdAt, long updatedAt, long expiresAt) {}
    record Event(String operationId, Action action, long expectedVersion, long version, int currentStep, long createdAt) {}
    private final GatewayService gateway;
    private final long lifetime;
    private final int maxActions;
    PersistedSessionValidator(GatewayService gateway, long lifetime, int maxActions) {
        this.gateway=gateway; this.lifetime=lifetime; this.maxActions=maxActions;
    }
    void validate(State state, List<Event> events) {
        try {
            canonicalUuid(state.id()); canonicalUuid(state.createOperation());
            require(state.corpusVersion() != null && !state.corpusVersion().isBlank() && state.corpusVersion().length() <= 100);
            // Validate the pinned snapshot, without comparing its corpus version to today's manifest.
            gateway.validateRecipeSnapshot(state.recipeId(),state.recipe());
            require(state.expiresAt() == Math.addExact(state.createdAt(),lifetime));
            require(events.size() <= maxActions && state.version() == events.size());
            int step=0, total=state.recipe().instructions().size();
            Status status=Status.ready;
            long updated=state.createdAt();
            var operations=new HashSet<String>();
            for (int i=0; i<events.size(); i++) {
                var event=events.get(i);
                canonicalUuid(event.operationId());
                require(operations.add(event.operationId()) && event.version() == i+1 && event.expectedVersion() == i);
                require(status != Status.finished && (i < maxActions-1 || event.action() == Action.finish));
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
    private void canonicalUuid(String value) { require(UUID.fromString(value).toString().equals(value)); }
    private void require(boolean condition) { if (!condition) throw unavailable(); }
    static ApiFailure unavailable() { return new ApiFailure(503,"ASSISTANT_STORAGE_UNAVAILABLE"); }
}
