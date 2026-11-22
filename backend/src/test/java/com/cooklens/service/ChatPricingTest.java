package com.cooklens.service;

import com.cooklens.config.LlmSettings;
import com.cooklens.exception.ApiFailure;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ChatPricingTest {
    private LlmSettings.Connection config(String url, String model) {
        return new LlmSettings.Connection(URI.create(url),model,"test",Duration.ofSeconds(20),512,6000);
    }
    @Test void trialIsLimitedToVerifiedModelsAndExactNvidiaEndpoint() {
        var pricing=new ChatPricing();
        String endpoint="https://integrate.api.nvidia.com/v1/chat/completions";
        for (String model:LlmSettings.NVIDIA_TRIAL_MODELS)
            assertEquals(new ChatPricing.Quote(0,0,0),pricing.quote(config(endpoint,model),null));
        assertThrows(ApiFailure.class,() -> pricing.quote(config(endpoint,"unverified-model"),null));
        for (String url:new String[]{"https://example.com/v1/chat/completions", "http://integrate.api.nvidia.com/v1/chat/completions",
                "https://integrate.api.nvidia.com:444/v1/chat/completions", "https://integrate.api.nvidia.com/other"})
            assertThrows(ApiFailure.class,() -> pricing.quote(config(url,LlmSettings.NVIDIA_GEMMA_MODEL),null));
    }
}
