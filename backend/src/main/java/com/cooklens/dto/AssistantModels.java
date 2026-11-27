package com.cooklens.dto;

import com.cooklens.dto.ApiModels.Recipe;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.util.List;

public final class AssistantModels {
    private AssistantModels() {}

    public enum Action {
        start,
        next,
        previous,
        repeat,
        finish
    }

    public enum Status {
        ready,
        cooking,
        finished
    }

    public record CreateSession(
            @NotBlank
                    @Pattern(regexp = "[a-z0-9][a-z0-9_-]{0,79}")
                    @JsonProperty(value = "recipe_id", required = true)
                    String recipeId,
            @NotBlank @Size(max = 100) @JsonProperty(value = "corpus_version", required = true)
                    String corpusVersion,
            @NotNull @Schema(format = "uuid") @JsonProperty(value = "operation_id", required = true)
                    String operationId) {}

    public record SessionAction(
            @NotNull @JsonProperty(value = "action", required = true) Action action,
            @NotNull @Min(0) @JsonProperty(value = "expected_version", required = true)
                    Long expectedVersion,
            @NotNull @Schema(format = "uuid") @JsonProperty(value = "operation_id", required = true)
                    String operationId) {}

    public record SessionMessage(
            @NotBlank @Size(max = 2000) @JsonProperty(value = "text", required = true) String text,
            @NotNull @Min(0) @JsonProperty(value = "expected_version", required = true)
                    Long expectedVersion,
            @NotNull @Schema(format = "uuid") @JsonProperty(value = "operation_id", required = true)
                    String operationId) {}

    public record ActionEvent(
            @JsonProperty(value = "operation_id", required = true) String operationId,
            @JsonProperty(value = "action", required = true) Action action,
            @JsonProperty(value = "version", required = true) long version,
            @JsonProperty(value = "current_step", required = true) int currentStep,
            @JsonProperty(value = "created_at", required = true) String createdAt) {}

    public record Message(
            @JsonProperty(value = "role", required = true) String role,
            @JsonProperty(value = "text", required = true) String text) {}

    public record Session(
            @Schema(format = "uuid") @JsonProperty(value = "id", required = true) String id,
            @JsonProperty(value = "corpus_version", required = true) String corpusVersion,
            @JsonProperty(value = "recipe_version", required = true) String recipeVersion,
            @JsonProperty(value = "recipe", required = true) Recipe recipe,
            @JsonProperty(value = "status", required = true) Status status,
            @JsonProperty(value = "current_step", required = true) int currentStep,
            @JsonProperty(value = "total_steps", required = true) int totalSteps,
            @JsonProperty(value = "version", required = true) long version,
            @JsonProperty(value = "created_at", required = true) String createdAt,
            @JsonProperty(value = "updated_at", required = true) String updatedAt,
            @JsonProperty(value = "expires_at", required = true) String expiresAt,
            @JsonProperty(value = "history", required = true) List<ActionEvent> history,
            @JsonProperty(value = "messages", required = true) List<Message> messages) {}

    public record SessionResponse(
            @JsonProperty(value = "api_version", required = true) String apiVersion,
            @JsonProperty(value = "request_id", required = true) String requestId,
            @JsonProperty(value = "session", required = true) Session session) {}

    public record LlmTestRequest(
            @NotBlank @JsonProperty(value = "provider", required = true) String provider,
            @JsonProperty("base_url") String baseUrl,
            @NotBlank @JsonProperty(value = "model", required = true) String model,
            @NotBlank @JsonProperty(value = "api_key", required = true) String apiKey) {
        @Override
        public String toString() {
            return "LlmTestRequest(provider="
                    + provider
                    + ", model="
                    + model
                    + ", api_key=[redacted])";
        }
    }

    public record LlmTestResponse(
            @JsonProperty(value = "api_version", required = true) String apiVersion,
            @JsonProperty(value = "request_id", required = true) String requestId,
            @JsonProperty(value = "ok", required = true) boolean ok,
            @JsonProperty(value = "provider", required = true) String provider,
            @JsonProperty(value = "model", required = true) String model,
            @JsonProperty(value = "reply", required = true) String reply,
            @JsonProperty(value = "latency_ms", required = true) long latencyMs) {}
}
