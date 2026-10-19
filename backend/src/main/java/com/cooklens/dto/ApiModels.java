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
    public record Dish(@Min(0) @Max(29) @JsonProperty(required = true) int classId, @NotBlank @JsonProperty(required = true) String normalizedDish,
                       @NotBlank @JsonProperty(required = true) String displayName) {}
    public record Prediction(@Min(1) @Max(3) @JsonProperty(required = true) int rank, @Min(0) @Max(29) @JsonProperty(required = true) int classId,
                             @NotBlank @JsonProperty(required = true) String normalizedDish, @NotBlank @JsonProperty(required = true) String displayName,
                             @DecimalMin("0") @DecimalMax("1") @JsonProperty(required = true) double confidence) {}
    public record Source(@NotBlank @JsonProperty(required = true) String name, @NotBlank @JsonProperty(required = true) String url, @NotBlank @JsonProperty(required = true) String license,
                         @NotBlank @JsonProperty(required = true) String retrievedAt, @NotBlank @JsonProperty(required = true) String attribution,
                         @Schema(nullable = true) @JsonProperty(required = true) String revisionUrl, @NotNull @JsonProperty(required = true) String modifications) {}
    public record Ingredient(@NotBlank @JsonProperty(required = true) String name, @NotBlank @JsonProperty(required = true) String normalizedName, @JsonProperty(required = true) boolean optional, @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal quantity,
                             @Schema(nullable = true) @JsonProperty(required = true) String unit, @Schema(nullable = true) @JsonProperty(required = true) String note) {}
    public record Instruction(@Positive @JsonProperty(required = true) int step, @NotBlank @JsonProperty(required = true) String text,
                              @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal durationMinutes) {}
    public record RecipeSummary(@NotBlank @JsonProperty(required = true) String id, @NotBlank @JsonProperty(required = true) String title, @NotBlank @JsonProperty(required = true) String normalizedDish,
                                @NotBlank @JsonProperty(required = true) String language, @NotBlank @JsonProperty(required = true) String cuisine,
                                @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal servings,
                                @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal prepTimeMinutes,
                                @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal cookTimeMinutes,
                                @NotNull @Size(max = 240) @JsonProperty(required = true) String preview, @Positive @JsonProperty(required = true) int rank,
                                @DecimalMin("-1") @DecimalMax("1") @JsonProperty(required = true) double retrievalScore,
                                @NotNull @Valid @JsonProperty(required = true) Source source) {}
    public record Recipe(@NotBlank @JsonProperty(required = true) String id, @NotBlank @JsonProperty(required = true) String title, @NotBlank @JsonProperty(required = true) String normalizedDish,
                         @NotBlank @JsonProperty(required = true) String language, @NotBlank @JsonProperty(required = true) String cuisine,
                         @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal servings,
                         @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal prepTimeMinutes,
                         @Positive @Schema(nullable = true) @JsonProperty(required = true) BigDecimal cookTimeMinutes,
                         @NotEmpty @Valid @JsonProperty(required = true) List<@NotNull Ingredient> ingredients,
                         @NotEmpty @Valid @JsonProperty(required = true) List<@NotNull Instruction> instructions,
                         @NotNull @JsonProperty(required = true) List<String> tags, @NotBlank @JsonProperty(required = true) String createdAt,
                         @NotBlank @JsonProperty(required = true) String updatedAt, @NotNull @Valid @JsonProperty(required = true) Source source) {}
    public record SearchRequest(@NotBlank @JsonProperty(required = true) String confirmedDish,
                                @Schema(defaultValue = "3", minimum = "1", maximum = "3") Integer topK,
                                @Schema(maxLength = 200, nullable = true) String query) {}
    public record ImageRequest(@Schema(type = "string", format = "binary", requiredMode = Schema.RequiredMode.REQUIRED) @JsonProperty(required = true) String file) {}

    public record VisionResult(@JsonProperty(required = true) String modelVersion, @JsonProperty(required = true) String taxonomyVersion, @NotNull @Size(min=3,max=3) @Valid @JsonProperty(required = true) List<@NotNull Prediction> predictions) {}
    public record DishesResult(@JsonProperty(required = true) String taxonomyVersion, @NotNull @Size(min=30,max=30) @Valid @JsonProperty(required = true) List<@NotNull Dish> dishes) {}
    public record SearchResult(@JsonProperty(required = true) String corpusVersion, @JsonProperty(required = true) String embeddingVersion, @JsonProperty(required = true) String taxonomyVersion,
                               @JsonProperty(required = true) String confirmedDish, @NotNull @Size(max=3) @Valid @JsonProperty(required = true) List<@NotNull RecipeSummary> recipes) {}
    public record DetailResult(@JsonProperty(required = true) String corpusVersion, @NotNull @Valid @JsonProperty(required = true) Recipe recipe) {}
    public record DependencyState(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
                                  @Schema(nullable = true) String code, @Schema(nullable = true) String modelVersion,
                                  @Schema(nullable = true) String taxonomyVersion, @Schema(nullable = true) String corpusVersion,
                                  @Schema(nullable = true) String embeddingVersion) {}
    public record PredictionResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String modelVersion,
                                     @JsonProperty(required = true) String taxonomyVersion, @JsonProperty(required = true) List<@NotNull Prediction> predictions) {}
    public record DishesResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String taxonomyVersion, @JsonProperty(required = true) List<@NotNull Dish> dishes) {}
    public record SearchResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String corpusVersion,
                                 @JsonProperty(required = true) String embeddingVersion, @JsonProperty(required = true) String taxonomyVersion, @JsonProperty(required = true) String confirmedDish,
                                 @JsonProperty(required = true) List<@NotNull RecipeSummary> recipes) {}
    public record DetailResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String corpusVersion, @JsonProperty(required = true) Recipe recipe) {}
    public record HealthResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String status, @JsonProperty(required = true) Map<String, DependencyState> dependencies) {}
    public record ErrorResponse(@JsonProperty(required = true) String apiVersion, @JsonProperty(required = true) String requestId, @JsonProperty(required = true) String code, @JsonProperty(required = true) String message) {}
}
