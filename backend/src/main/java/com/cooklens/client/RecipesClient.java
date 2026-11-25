package com.cooklens.client;

import com.cooklens.dto.ApiModels.*;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RecipesClient {
    private final UpstreamTransport transport;
    private final ObjectMapper mapper;
    private final String base;
    public RecipesClient(UpstreamTransport transport, ObjectMapper mapper, @Value("${cooklens.recipes-url}") String base) {
        this.transport = transport; this.mapper = mapper; this.base = base;
        transport.endpoint(base, "/health/ready");
    }
    private HttpRequest.Builder request(String path, String requestId) {
        return HttpRequest.newBuilder(transport.endpoint(base, path)).header("X-Request-ID", requestId).timeout(Duration.ofSeconds(5));
    }
    public DishesResult dishes(String requestId) {
        return transport.call(request("/dishes", requestId).GET().build(), DishesResult.class, Duration.ofSeconds(5));
    }
    public SearchResult search(SearchRequest search, String requestId) {
        try {
            return transport.call(request("/search", requestId).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(search))).build(),
                    SearchResult.class, Duration.ofSeconds(5));
        } catch (java.io.IOException e) { throw new ApiFailure(500, "INTERNAL_ERROR"); }
    }
    public DetailResult detail(String id, String requestId) {
        return transport.call(request("/recipes/" + id, requestId).GET().build(), DetailResult.class, Duration.ofSeconds(5));
    }
    public CompletableFuture<DependencyState> health(String requestId) {
        return transport.async(request("/health/ready", requestId).timeout(Duration.ofMillis(1400)).GET().build(), DependencyState.class);
    }
}
