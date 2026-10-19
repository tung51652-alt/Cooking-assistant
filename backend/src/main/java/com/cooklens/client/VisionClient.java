package com.cooklens.client;

import com.cooklens.dto.ApiModels.*;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class VisionClient {
    private final UpstreamTransport transport;
    private final URI predict, health;
    public VisionClient(UpstreamTransport transport, @Value("${cooklens.vision-url}") String base) {
        this.transport = transport; predict = transport.endpoint(base, "/predict"); health = transport.endpoint(base, "/health/ready");
    }
    public VisionResult predict(byte[] image, String mime, String requestId) {
        String boundary = "CookLens" + UUID.randomUUID();
        byte[] head = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"upload\"\r\nContent-Type: "
                + mime + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
        byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII);
        var request = HttpRequest.newBuilder(predict).header("X-Request-ID", requestId)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .timeout(Duration.ofSeconds(15)).POST(HttpRequest.BodyPublishers.ofByteArrays(List.of(head, image, tail))).build();
        return transport.call(request, VisionResult.class, Duration.ofSeconds(15));
    }
    public CompletableFuture<DependencyState> health(String requestId) {
        return transport.async(HttpRequest.newBuilder(health).header("X-Request-ID", requestId)
                .timeout(Duration.ofMillis(1400)).GET().build(), DependencyState.class);
    }
}
