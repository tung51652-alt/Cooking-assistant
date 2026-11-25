package com.cooklens.service;

import com.cooklens.client.*;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.*;
import java.util.Map;
import java.util.concurrent.*;
import org.springframework.boot.actuate.health.*;
import org.springframework.stereotype.Component;

@Component("dependencies")
public class DependencyHealth implements HealthIndicator {
    private final RuntimeContract contract;
    private final VisionClient vision;
    private final RecipesClient recipes;
    private Snapshot cached;
    private long expires;
    public record Snapshot(String status, Map<String, DependencyState> dependencies) {}
    public DependencyHealth(RuntimeContract contract, VisionClient vision, RecipesClient recipes) {
        this.contract = contract; this.vision = vision; this.recipes = recipes;
    }
    // A single refresh serves concurrent callers; only dependency state is cached, never request IDs.
    public synchronized Snapshot snapshot(String id) {
        if (cached != null && System.nanoTime() < expires) return cached;
        var v = vision.health(id);
        var r = recipes.health(id);
        try { CompletableFuture.allOf(v, r).get(1600, TimeUnit.MILLISECONDS); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        catch (ExecutionException | TimeoutException e) { /* Return sanitized readiness below. */ }
        DependencyState vs = state(v, true), rs = state(r, false);
        v.cancel(true); r.cancel(true);
        cached = new Snapshot(vs.status().equals("ready") && rs.status().equals("ready") ? "ready" : "not_ready",
                Map.of("vision", vs, "recipes", rs));
        expires = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        return cached;
    }
    private DependencyState state(CompletableFuture<DependencyState> result, boolean isVision) {
        DependencyState value = null;
        if (result.isDone() && !result.isCompletedExceptionally() && !result.isCancelled()) value = result.getNow(null);
        if (value != null && "ready".equals(value.status()) && contract.taxonomyVersion.equals(value.taxonomyVersion())
                && (isVision ? contract.modelVersion.equals(value.modelVersion())
                : contract.corpusVersion.equals(value.corpusVersion()) && contract.embeddingVersion.equals(value.embeddingVersion())))
            return isVision ? new DependencyState("ready", null, value.modelVersion(), value.taxonomyVersion(), null, null)
                    : new DependencyState("ready", null, null, value.taxonomyVersion(), value.corpusVersion(), value.embeddingVersion());
        return new DependencyState("not_ready", "DEPENDENCY_NOT_READY", null, null, null, null);
    }
    @Override public Health health() {
        return snapshot(java.util.UUID.randomUUID().toString()).status().equals("ready") ? Health.up().build() : Health.down().build();
    }
}
