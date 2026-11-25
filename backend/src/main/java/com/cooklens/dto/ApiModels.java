package com.cooklens.dto;

import java.util.List;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public final class ApiModels {
    private ApiModels() {}
    public record Dish(@Min(0) @Max(29) @JsonProperty(value = "class_id", required = true) int classId, @NotBlank @JsonProperty(value = "normalized_dish", required = true) String normalizedDish,
                       @NotBlank @JsonProperty(value = "display_name", required = true) String displayName) {}
    public record Prediction(@Min(1) @Max(3) @JsonProperty(value = "rank", required = true) int rank, @Min(0) @Max(29) @JsonProperty(value = "class_id", required = true) int classId,
                             @NotBlank @JsonProperty(value = "normalized_dish", required = true) String normalizedDish, @NotBlank @JsonProperty(value = "display_name", required = true) String displayName,
                             @DecimalMin("0") @DecimalMax("1") @JsonProperty(value = "confidence", required = true) double confidence) {}
    public record Source(@NotBlank @JsonProperty(value = "name", required = true) String name, @NotBlank @JsonProperty(value = "url", required = true) String url, @NotBlank @JsonProperty(value = "license", required = true) String license,
                         @NotBlank @JsonProperty(value = "retrieved_at", required = true) String retrievedAt, @NotBlank @JsonProperty(value = "attribution", required = true) String attribution,
                         @Schema(nullable = true) @JsonProperty(value = "revision_url", required = true) String revisionUrl, @NotNull @JsonProperty(value = "modifications", required = true) String modifications) {}
    public record Ingredient(@NotBlank @JsonProperty(value = "name", required = true) String name, @NotBlank @JsonProperty(value = "normalized_name", required = true) String normalizedName, @JsonProperty(value = "optional", required = true) boolean optional, @Positive @Schema(nullable = true) @JsonProperty(value = "quantity", required = true) BigDecimal quantity,
                             @Schema(nullable = true) @JsonProperty(value = "unit", required = true) String unit, @Schema(nullable = true) @JsonProperty(value = "note", required = true) String note) {}
    public record Instruction(@Positive @JsonProperty(value = "step", required = true) int step, @NotBlank @JsonProperty(value = "text", required = true) String text,
                              @Positive @Schema(nullable = true) @JsonProperty(value = "duration_minutes", required = true) BigDecimal durationMinutes) {}
    public record RecipeSummary(@NotBlank @JsonProperty(value = "id", required = true) String id, @NotBlank @JsonProperty(value = "title", required = true) String title, @NotBlank @JsonProperty(value = "normalized_dish", required = true) String normalizedDish,
                                @NotBlank @JsonProperty(value = "language", required = true) String language, @NotBlank @JsonProperty(value = "cuisine", required = true) String cuisine,
                                @Positive @Schema(nullable = true) @JsonProperty(value = "servings", required = true) BigDecimal servings,
                                @Positive @Schema(nullable = true) @JsonProperty(value = "prep_time_minutes", required = true) BigDecimal prepTimeMinutes,
                                @Positive @Schema(nullable = true) @JsonProperty(value = "cook_time_minutes", required = true) BigDecimal cookTimeMinutes,
                                @NotNull @Size(max = 240) @JsonProperty(value = "preview", required = true) String preview, @Positive @JsonProperty(value = "rank", required = true) int rank,
                                @DecimalMin("-1") @DecimalMax("1") @JsonProperty(value = "retrieval_score", required = true) double retrievalScore,
                                @NotNull @Valid @JsonProperty(value = "source", required = true) Source source) {}
    public record Recipe(@NotBlank @JsonProperty(value = "id", required = true) String id, @NotBlank @JsonProperty(value = "title", required = true) String title, @NotBlank @JsonProperty(value = "normalized_dish", required = true) String normalizedDish,
                         @NotBlank @JsonProperty(value = "language", required = true) String language, @NotBlank @JsonProperty(value = "cuisine", required = true) String cuisine,
                         @Positive @Schema(nullable = true) @JsonProperty(value = "servings", required = true) BigDecimal servings,
                         @Positive @Schema(nullable = true) @JsonProperty(value = "prep_time_minutes", required = true) BigDecimal prepTimeMinutes,
                         @Positive @Schema(nullable = true) @JsonProperty(value = "cook_time_minutes", required = true) BigDecimal cookTimeMinutes,
                         @NotEmpty @Valid @JsonProperty(value = "ingredients", required = true) List<@NotNull Ingredient> ingredients,
                         @NotEmpty @Valid @JsonProperty(value = "instructions", required = true) List<@NotNull Instruction> instructions,
                         @NotNull @JsonProperty(value = "tags", required = true) List<String> tags, @NotBlank @JsonProperty(value = "created_at", required = true) String createdAt,
                         @NotBlank @JsonProperty(value = "updated_at", required = true) String updatedAt, @NotNull @Valid @JsonProperty(value = "source", required = true) Source source) {}
    public record SearchRequest(@NotBlank @JsonProperty(value = "confirmed_dish", required = true) String confirmedDish,
                                @Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, defaultValue = "3", minimum = "1", maximum = "3") @JsonProperty("top_k") Integer topK,
                                @Schema(maxLength = 200, nullable = true) String query) {}
    public record ImageRequest(@Schema(type = "string", format = "binary", requiredMode = Schema.RequiredMode.REQUIRED) @JsonProperty(value = "file", required = true) String file) {}

    public record VisionResult(@JsonProperty(value = "model_version", required = true) String modelVersion, @JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion, @NotNull @Size(min=3,max=3) @Valid @JsonProperty(value = "predictions", required = true) List<@NotNull Prediction> predictions) {}
    public record DishesResult(@JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion, @NotNull @Size(min=30,max=30) @Valid @JsonProperty(value = "dishes", required = true) List<@NotNull Dish> dishes) {}
    public record SearchResult(@JsonProperty(value = "corpus_version", required = true) String corpusVersion, @JsonProperty(value = "embedding_version", required = true) String embeddingVersion, @JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion,
                               @JsonProperty(value = "confirmed_dish", required = true) String confirmedDish, @NotNull @Size(max=3) @Valid @JsonProperty(value = "recipes", required = true) List<@NotNull RecipeSummary> recipes) {}
    public record DetailResult(@JsonProperty(value = "corpus_version", required = true) String corpusVersion, @NotNull @Valid @JsonProperty(value = "recipe", required = true) Recipe recipe) {}
    public record DependencyState(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
                                  @Schema(nullable = true) String code, @Schema(nullable = true) @JsonProperty("model_version") String modelVersion,
                                  @Schema(nullable = true) @JsonProperty("taxonomy_version") String taxonomyVersion, @Schema(nullable = true) @JsonProperty("corpus_version") String corpusVersion,
                                  @Schema(nullable = true) @JsonProperty("embedding_version") String embeddingVersion) {}
    public record PredictionResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "model_version", required = true) String modelVersion,
                                     @JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion, @JsonProperty(value = "predictions", required = true) List<@NotNull Prediction> predictions) {}
    public record DishesResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion, @JsonProperty(value = "dishes", required = true) List<@NotNull Dish> dishes) {}
    public record SearchResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "corpus_version", required = true) String corpusVersion,
                                 @JsonProperty(value = "embedding_version", required = true) String embeddingVersion, @JsonProperty(value = "taxonomy_version", required = true) String taxonomyVersion, @JsonProperty(value = "confirmed_dish", required = true) String confirmedDish,
                                 @JsonProperty(value = "recipes", required = true) List<@NotNull RecipeSummary> recipes) {}
    public record DetailResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "corpus_version", required = true) String corpusVersion, @JsonProperty(value = "recipe", required = true) Recipe recipe) {}
    public record HealthResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "status", required = true) String status, @JsonProperty(value = "dependencies", required = true) Map<String, DependencyState> dependencies) {}
    public record ErrorResponse(@JsonProperty(value = "api_version", required = true) String apiVersion, @JsonProperty(value = "request_id", required = true) String requestId, @JsonProperty(value = "code", required = true) String code, @JsonProperty(value = "message", required = true) String message) {}
}
