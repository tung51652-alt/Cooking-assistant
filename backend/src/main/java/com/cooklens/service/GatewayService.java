package com.cooklens.service;

import com.cooklens.client.*;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.*;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.net.URI;
import java.text.Normalizer;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class GatewayService {
    private final RuntimeContract contract;
    private final VisionClient vision;
    private final RecipesClient recipes;
    private final Validator validator;
    private final ObjectMapper mapper;
    public GatewayService(RuntimeContract contract, VisionClient vision, RecipesClient recipes, Validator validator, ObjectMapper mapper) {
        this.contract = contract; this.vision = vision; this.recipes = recipes; this.validator = validator; this.mapper = mapper;
    }
    private <T> T valid(T result) {
        contract.require(result != null && validator.validate(result).isEmpty());
        return result;
    }
    public PredictionResponse predict(byte[] image, String mime, String id) {
        var result = valid(vision.predict(image, mime, id));
        contract.require(contract.modelVersion.equals(result.modelVersion()) && contract.taxonomyVersion.equals(result.taxonomyVersion()));
        var seen = new HashSet<Integer>();
        double sum = 0;
        Prediction previous = null;
        for (int i=0; i<3; i++) {
            var p = result.predictions().get(i);
            var dish = contract.dishes.get(p.classId());
            contract.require(p.rank() == i+1 && seen.add(p.classId()) && Double.isFinite(p.confidence())
                    && dish.normalizedDish().equals(p.normalizedDish()) && dish.displayName().equals(p.displayName()));
            if (previous != null) contract.require(previous.confidence() > p.confidence()
                    || (previous.confidence() == p.confidence() && previous.classId() < p.classId()));
            sum += p.confidence(); previous = p;
        }
        contract.require(sum <= 1.000001);
        return new PredictionResponse(contract.apiVersion, id, result.modelVersion(), result.taxonomyVersion(), result.predictions());
    }
    public DishesResponse dishes(String id) {
        var result = valid(recipes.dishes(id));
        contract.require(contract.taxonomyVersion.equals(result.taxonomyVersion()) && contract.dishes.equals(result.dishes()));
        return new DishesResponse(contract.apiVersion, id, result.taxonomyVersion(), result.dishes());
    }
    public SearchRequest parseSearch(byte[] bytes) {
        try {
            JsonNode value = mapper.readTree(bytes);
            if (value == null || !value.isObject()) throw ApiFailure.invalid();
            var fields = value.fieldNames();
            while (fields.hasNext()) if (!Set.of("confirmed_dish", "top_k", "query").contains(fields.next())) throw ApiFailure.invalid();
            if (!value.path("confirmed_dish").isTextual()) throw ApiFailure.invalid();
            String dish = value.path("confirmed_dish").textValue();
            contract.requireDish(dish);
            int top = 3;
            if (value.has("top_k")) {
                if (!value.get("top_k").isIntegralNumber() || !value.get("top_k").canConvertToInt()) throw ApiFailure.invalid();
                top = value.get("top_k").intValue();
            }
            if (top < 1 || top > 3) throw ApiFailure.invalid();
            String query = null;
            if (value.hasNonNull("query")) {
                if (!value.get("query").isTextual()) throw ApiFailure.invalid();
                query = Normalizer.normalize(stripWhitespace(value.get("query").textValue()), Normalizer.Form.NFC);
                if (query.codePointCount(0, query.length()) > 200) throw ApiFailure.invalid();
                if (query.isBlank()) query = null;
            }
            return new SearchRequest(dish, top, query);
        } catch (java.io.IOException e) { throw ApiFailure.invalid(); }
    }
    public SearchResponse search(SearchRequest search, String id) {
        var result = valid(recipes.search(search, id));
        contract.require(contract.corpusVersion.equals(result.corpusVersion()) && contract.embeddingVersion.equals(result.embeddingVersion())
                && contract.taxonomyVersion.equals(result.taxonomyVersion()) && search.confirmedDish().equals(result.confirmedDish())
                && result.recipes().size() <= search.topK());
        var seen = new HashSet<String>();
        RecipeSummary previous = null;
        for (int i=0; i<result.recipes().size(); i++) {
            var r = result.recipes().get(i);
            baseRecipe(r.id(), r.normalizedDish(), r.language(), r.cuisine(), r.source());
            contract.require(search.confirmedDish().equals(r.normalizedDish()) && r.rank() == i+1 && seen.add(r.id())
                    && Double.isFinite(r.retrievalScore()));
            if (previous != null) contract.require(previous.retrievalScore() > r.retrievalScore()
                    || (previous.retrievalScore() == r.retrievalScore() && previous.id().compareTo(r.id()) < 0));
            previous = r;
        }
        return new SearchResponse(contract.apiVersion, id, result.corpusVersion(), result.embeddingVersion(), result.taxonomyVersion(),
                result.confirmedDish(), result.recipes());
    }
    public DetailResponse detail(String recipeId, String id) {
        if (!recipeId.matches("[a-z0-9][a-z0-9_-]{0,79}")) throw ApiFailure.invalid();
        var result = valid(recipes.detail(recipeId, id));
        contract.require(contract.corpusVersion.equals(result.corpusVersion()) && recipeId.equals(result.recipe().id()));
        var r = result.recipe();
        baseRecipe(r.id(), r.normalizedDish(), r.language(), r.cuisine(), r.source());
        for (int i=0; i<r.instructions().size(); i++) contract.require(r.instructions().get(i).step() == i+1);
        return new DetailResponse(contract.apiVersion, id, result.corpusVersion(), r);
    }
    private void baseRecipe(String id, String dish, String language, String cuisine, Source source) {
        contract.require(id.matches("[a-z0-9][a-z0-9_-]{0,79}") && contract.dishes.stream().anyMatch(d -> d.normalizedDish().equals(dish))
                && "vi".equals(language) && "vietnamese".equals(cuisine));
        safeUrl(source.url());
        if (source.revisionUrl() != null) safeUrl(source.revisionUrl());
    }
    private void safeUrl(String value) {
        try {
            var uri = URI.create(value);
            contract.require(Set.of("http", "https").contains(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null);
        } catch (IllegalArgumentException e) { throw ApiFailure.unavailable(); }
    }
    private String stripWhitespace(String value) {
        int start=0, end=value.length();
        while (start < end && whitespace(value.codePointAt(start))) start += Character.charCount(value.codePointAt(start));
        while (end > start && whitespace(value.codePointBefore(end))) end -= Character.charCount(value.codePointBefore(end));
        return value.substring(start, end);
    }
    private boolean whitespace(int point) {
        // Match Python str.strip used by recipes, including non-breaking spaces and NEL.
        return Character.isWhitespace(point) || Character.isSpaceChar(point) || point == 0x85;
    }
}
