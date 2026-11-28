package com.cooklens.service;

import static org.junit.jupiter.api.Assertions.*;

import com.cooklens.config.LlmSettings;
import com.cooklens.exception.ApiFailure;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class ChatPricingTest {
    @Test
    void geminiReservesHardContextCapAndUsesStandardPaidCeilingEvenOnFreeTier() {
        var pricing = new ChatPricing();
        var quote =
                pricing.quote(
                        config(
                                LlmSettings.GEMINI_BASE + "/chat/completions",
                                LlmSettings.GEMINI_MODEL),
                        null);
        assertEquals(new ChatPricing.Quote(631706, 300000, 2500000), quote);
        assertEquals(
                new ChatPricing.Quote(525824, 250000, 1500000),
                pricing.quote(
                        config(
                                LlmSettings.GEMINI_BASE + "/chat/completions",
                                LlmSettings.GEMINI_LEGACY_MODEL),
                        null));
        assertTrue(quote.reservedMicros() > 6000L * 250000 / 1000000 + 512L * 1500000 / 1000000);
        assertThrows(
                ApiFailure.class,
                () ->
                        pricing.quote(
                                config(
                                        LlmSettings.GEMINI_BASE + "/chat/completions",
                                        "gemini-unverified"),
                                null));
        for (String url :
                new String[] {
                    "https://example.com/v1beta/openai/chat/completions",
                    "http://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                    "https://generativelanguage.googleapis.com:444/v1beta/openai/chat/completions",
                    LlmSettings.GEMINI_BASE + "/other"
                })
            assertThrows(
                    ApiFailure.class,
                    () -> pricing.quote(config(url, LlmSettings.GEMINI_MODEL), null));
    }

    private LlmSettings.Connection config(String url, String model) {
        return new LlmSettings.Connection(
                URI.create(url), model, "test", Duration.ofSeconds(20), 512, 6000);
    }

    @Test
    void trialIsLimitedToVerifiedModelsAndExactNvidiaEndpoint() {
        var pricing = new ChatPricing();
        String endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
        for (String model : LlmSettings.NVIDIA_TRIAL_MODELS)
            assertEquals(
                    new ChatPricing.Quote(0, 0, 0), pricing.quote(config(endpoint, model), null));
        assertThrows(
                ApiFailure.class, () -> pricing.quote(config(endpoint, "unverified-model"), null));
        for (String url :
                new String[] {
                    "https://example.com/v1/chat/completions",
                    "http://integrate.api.nvidia.com/v1/chat/completions",
                    "https://integrate.api.nvidia.com:444/v1/chat/completions",
                    "https://integrate.api.nvidia.com/other"
                })
            assertThrows(
                    ApiFailure.class,
                    () -> pricing.quote(config(url, LlmSettings.NVIDIA_GEMMA_MODEL), null));
    }

    @Test
    void byokAllowsArbitraryModelsAndCustomEndpointsWithZeroServerReservation() {
        var pricing = new ChatPricing();
        var byok =
                new LlmSettings.Connection(
                        URI.create("https://api.openai.com/v1/chat/completions"),
                        "gpt-4o-mini",
                        "user-key",
                        Duration.ofSeconds(20),
                        512,
                        6000,
                        true);
        assertEquals(new ChatPricing.Quote(0, 0, 0), pricing.quote(byok, null));
    }
}
