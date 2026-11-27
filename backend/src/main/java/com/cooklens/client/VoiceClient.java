package com.cooklens.client;

import com.cooklens.exception.ApiFailure;
import com.cooklens.service.SingleFileUpload.Media;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class VoiceClient {
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final Map<String, Integer> ERRORS = Map.of(
            "INVALID_AUDIO", 400, "AUDIO_TOO_LONG", 413, "NO_SPEECH_DETECTED", 422);
    private final Semaphore slot = new Semaphore(1);
    private final URI endpoint;
    private final UpstreamTransport transport;

    public VoiceClient(@Value("${cooklens.voice-url}") String baseUrl, UpstreamTransport transport) {
        this.transport = transport;
        endpoint = transport.endpoint(baseUrl, "/transcribe");
    }

    public record Result(@JsonProperty(value = "text", required = true) String text) {}

    public String transcribe(Media audio, String requestId) {
        if (audio.bytes().length == 0) throw new ApiFailure(400, "INVALID_AUDIO");
        if (!slot.tryAcquire()) throw new ApiFailure(503, "SERVICE_BUSY");
        try {
            var request = HttpRequest.newBuilder(endpoint).timeout(TIMEOUT)
                    .header("Content-Type", audio.mime()).header("X-Request-ID", requestId)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(audio.bytes())).build();
            Result result = transport.call(request, Result.class, TIMEOUT, ERRORS);
            if (result == null || result.text() == null || result.text().isBlank() || result.text().length() > 2000)
                throw ApiFailure.unavailable();
            return result.text().strip();
        } finally { slot.release(); }
    }
}
