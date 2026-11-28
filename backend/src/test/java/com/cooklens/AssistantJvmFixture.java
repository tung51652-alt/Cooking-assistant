package com.cooklens;

import com.cooklens.client.ChatProvider.Prompt;
import com.cooklens.config.LlmSettings;
import com.cooklens.service.ChatPricing;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;

// Test-only bootstrap: production components plus mock-endpoint pricing, never shipped in images.
@TestConfiguration(proxyBeanMethods = false)
@EnableAutoConfiguration
@ComponentScan(
        basePackages = "com.cooklens",
        excludeFilters = {
            @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = TestComponent.class),
            @ComponentScan.Filter(
                    type = FilterType.ASSIGNABLE_TYPE,
                    classes = {CookLensApplication.class, ChatPricing.class})
        })
public class AssistantJvmFixture {
    public static void main(String[] args) {
        SpringApplication.run(AssistantJvmFixture.class, args);
    }

    @Bean
    ChatPricing fixturePricing() {
        return new ChatPricing() {
            @Override
            public Quote quote(LlmSettings.Connection config, Prompt prompt) {
                return new Quote(1000, 1_000_000, 1_000_000);
            }
        };
    }
}
