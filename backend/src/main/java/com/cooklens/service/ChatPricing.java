package com.cooklens.service;

import com.cooklens.client.ChatProvider.Prompt;
import com.cooklens.config.LlmSettings;
import com.cooklens.config.LlmSettings.Connection;
import com.cooklens.exception.ApiFailure;
import org.springframework.stereotype.Component;

@Component
public class ChatPricing {
    public record Quote(long reservedMicros, long inputRateMicrosPerMillion, long outputRateMicrosPerMillion) {
        public Quote {
            if (reservedMicros<0 || inputRateMicrosPerMillion<0 || outputRateMicrosPerMillion<0) throw new IllegalArgumentException();
        }
    }
    // Paid endpoints require a verified pricing/token-bound policy before they can be enabled.
    public Quote quote(Connection config, Prompt prompt) {
        var uri=config.endpoint();
        if ("https".equals(uri.getScheme()) && "integrate.api.nvidia.com".equalsIgnoreCase(uri.getHost())
                && (uri.getPort()==-1 || uri.getPort()==443) && uri.getPath().equals("/v1/chat/completions")
                && LlmSettings.NVIDIA_TRIAL_MODELS.contains(config.model())) return new Quote(0,0,0);
        if ("https".equals(uri.getScheme()) && "generativelanguage.googleapis.com".equalsIgnoreCase(uri.getHost())
                && (uri.getPort()==-1 || uri.getPort()==443) && uri.getPath().equals("/v1beta/openai/chat/completions")
                && LlmSettings.GEMINI_MODEL.equals(config.model())) {
            // Reserve the model's hard text-input limit, not the admission estimate; settle from actual usage.
            // Standard paid ceiling verified 2026-11-25: $0.25 input / $1.50 output per million tokens.
            long reserved=(1_048_576L*250_000L+config.maxOutputTokens()*1_500_000L+999_999L)/1_000_000L;
            return new Quote(reserved,250_000L,1_500_000L);
        }
        throw new ApiFailure(503,"ASSISTANT_NOT_CONFIGURED");
    }
}
