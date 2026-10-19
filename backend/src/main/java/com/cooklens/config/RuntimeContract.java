package com.cooklens.config;

import com.cooklens.dto.ApiModels.Dish;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class RuntimeContract {
    public final String apiVersion, modelVersion, taxonomyVersion, corpusVersion, embeddingVersion;
    public final List<Dish> dishes;
    public RuntimeContract(ObjectMapper mapper) throws IOException {
        try (var manifest = new ClassPathResource("contract/manifest.json").getInputStream();
             var taxonomy = new ClassPathResource("contract/30vnfoods-label-map.json").getInputStream()) {
            var m = mapper.readTree(manifest);
            apiVersion = m.required("public_api_version").asText();
            modelVersion = m.required("vision").required("model_version").asText();
            taxonomyVersion = m.required("taxonomy_version").asText();
            corpusVersion = m.required("corpus").required("corpus_version").asText();
            embeddingVersion = m.required("embedding").required("embedding_version").asText();
            var t = mapper.readTree(taxonomy);
            dishes = mapper.readerForListOf(Dish.class).readValue(t.required("labels"));
            if (dishes.size() != 30 || !taxonomyVersion.equals(t.required("taxonomy_version").asText())
                    || new HashSet<>(dishes.stream().map(Dish::normalizedDish).toList()).size() != 30)
                throw new IllegalStateException("Invalid bundled runtime contract");
            for (int i=0; i<30; i++) if (dishes.get(i).classId() != i)
                throw new IllegalStateException("Invalid bundled class order");
        }
    }
    public Dish requireDish(String canonical) {
        return dishes.stream().filter(d -> d.normalizedDish().equals(canonical)).findFirst()
                .orElseThrow(() -> new ApiFailure(422, "INVALID_DISH"));
    }
    public void require(boolean valid) { if (!valid) throw ApiFailure.unavailable(); }
}
