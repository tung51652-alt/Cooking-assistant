package com.cooklens.config;

import io.swagger.v3.oas.models.*;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.web.servlet.config.annotation.*;
import org.springdoc.core.customizers.OpenApiCustomizer;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.headers.Header;

@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    private final String origins;
    public WebConfiguration(@Value("${cooklens.cors-origins}") String origins) { this.origins=origins; }
    @Override public void addCorsMappings(CorsRegistry registry) {
        if (!origins.isBlank()) {
            String[] allowlist = Arrays.stream(origins.split(",")).map(String::strip).toArray(String[]::new);
            for (String origin : allowlist) if (origin.contains("*") || !origin.matches("https?://[^/]+"))
                throw new IllegalArgumentException("CORS requires explicit HTTP origins");
            registry.addMapping("/api/**").allowedOrigins(allowlist).allowedMethods("GET", "POST", "OPTIONS")
                    .allowedHeaders("Content-Type", "X-Request-ID").exposedHeaders("X-Request-ID").allowCredentials(false).maxAge(600);
        }
    }
    @Bean OpenAPI publicOpenApi(RuntimeContract contract) {
        return new OpenAPI().info(new Info().title("CookLens public API").version(contract.apiVersion))
                .servers(List.of(new Server().url("/")));
    }
    @Bean OpenApiCustomizer requestIdContract() {
        return api -> api.getPaths().values().forEach(path -> path.readOperations().forEach(operation -> {
            operation.addParametersItem(new Parameter().in("header").name("X-Request-ID").required(false)
                    .description("UUID hợp lệ được truyền xuyên dịch vụ; giá trị khác được thay mới.")
                    .schema(new StringSchema().format("uuid")));
            operation.getResponses().values().forEach(response -> response.addHeaderObject("X-Request-ID",
                    new Header().schema(new StringSchema().format("uuid"))));
        }));
    }
}
