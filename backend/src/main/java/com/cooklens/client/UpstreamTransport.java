package com.cooklens.client;

import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
import org.springframework.stereotype.Component;

@Component
public class UpstreamTransport {
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public UpstreamTransport(ObjectMapper mapper) { this.mapper = mapper; }
    public URI endpoint(String base, String path) {
        URI uri = URI.create(base);
        if (!List.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
            throw new IllegalArgumentException("Invalid internal service address");
        return URI.create(base.replaceAll("/$", "") + path);
    }
    public <T> CompletableFuture<T> async(HttpRequest request, Class<T> type) {
        var response = http.sendAsync(request, info -> new LimitedBody());
        var result = response.thenApply(r -> decode(r, type));
        result.whenComplete((value, error) -> { if (result.isCancelled()) response.cancel(true); });
        return result;
    }
    public <T> T call(HttpRequest request, Class<T> type, Duration budget) {
        var future = async(request, type);
        try { return future.get(budget.toMillis(), TimeUnit.MILLISECONDS); }
        catch (TimeoutException e) { future.cancel(true); throw ApiFailure.timeout(); }
        catch (InterruptedException e) { future.cancel(true); Thread.currentThread().interrupt(); throw ApiFailure.unavailable(); }
        catch (ExecutionException e) {
            Throwable cause = e.getCause();
            while (cause instanceof CompletionException) cause = cause.getCause();
            if (cause instanceof ApiFailure failure) throw failure;
            if (cause instanceof HttpConnectTimeoutException) throw ApiFailure.unavailable();
            if (cause instanceof HttpTimeoutException) throw ApiFailure.timeout();
            throw ApiFailure.unavailable();
        }
    }
    private <T> T decode(HttpResponse<byte[]> response, Class<T> type) {
        try {
            if (!response.headers().firstValue("content-type").orElse("").split(";")[0].equalsIgnoreCase("application/json"))
                throw ApiFailure.unavailable();
            if (response.statusCode() != 200) {
                var code = mapper.readTree(response.body()).path("code").asText();
                int expected = switch (code) {
                    case "INVALID_IMAGE" -> 400;
                    case "UPLOAD_TOO_LARGE" -> 413;
                    case "UNSUPPORTED_MEDIA_TYPE" -> 415;
                    case "VALIDATION_ERROR", "INVALID_DISH" -> 422;
                    case "RECIPE_NOT_FOUND" -> 404;
                    case "DEPENDENCY_NOT_READY", "SERVICE_BUSY" -> 503;
                    case "DEPENDENCY_TIMEOUT" -> 504;
                    default -> -1;
                };
                if (expected == response.statusCode()) throw new ApiFailure(expected, code);
                throw ApiFailure.unavailable();
            }
            var reader = mapper.readerFor(type);
            if (type != com.cooklens.dto.ApiModels.DependencyState.class)
                reader = reader.with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES);
            T value = reader.readValue(response.body());
            if (value == null) throw ApiFailure.unavailable();
            return value;
        } catch (java.io.IOException | IllegalArgumentException e) { throw ApiFailure.unavailable(); }
    }
    // Bound provider responses before JSON parsing, including chunked responses.
    static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody() { return body; }
        public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        public void onNext(List<ByteBuffer> chunks) {
            for (var chunk : chunks) {
                if (bytes.size() + chunk.remaining() > 1024 * 1024) {
                    subscription.cancel(); body.completeExceptionally(ApiFailure.unavailable()); return;
                }
                byte[] part = new byte[chunk.remaining()]; chunk.get(part); bytes.writeBytes(part);
            }
            subscription.request(1);
        }
        public void onError(Throwable error) { body.completeExceptionally(error); }
        public void onComplete() { body.complete(bytes.toByteArray()); }
    }
}
