package com.cooklens.service;

import com.cooklens.client.ChatProvider.Prompt;
import com.cooklens.config.LlmSettings;
import com.cooklens.config.LlmSettings.Connection;
import com.cooklens.exception.ApiFailure;
import org.springframework.stereotype.Component;

@Component
public class ChatPricing {
    public record Quote(
            long reservedMicros, long inputRateMicrosPerMillion, long outputRateMicrosPerMillion) {
        public Quote {
            if (reservedMicros < 0
                    || inputRateMicrosPerMillion < 0
                    || outputRateMicrosPerMillion < 0) throw new IllegalArgumentException();
        }
    }

    // Paid endpoints require a verified pricing/token-bound policy before they can be enabled.
    public Quote quote(Connection config, Prompt prompt) {
        if (config.byok()) return new Quote(0, 0, 0);
        var uri = config.endpoint();
        if ("https".equals(uri.getScheme())
                && "integrate.api.nvidia.com".equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getPath().equals("/v1/chat/completions")
                && LlmSettings.NVIDIA_TRIAL_MODELS.contains(config.model()))
            return new Quote(0, 0, 0);
        if ("https".equals(uri.getScheme())
                && "generativelanguage.googleapis.com".equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getPath().equals("/v1beta/openai/chat/completions")
                && LlmSettings.GEMINI_MODELS.contains(config.model())) {
            // Reserve two attempts at the model's hard text-input limit. A cancelled timeout can
            // still be billed; the adapter keeps usage unknown when it retries that timeout.
            // Standard text paid ceiling for 3.5 verified 2026-11-27: $0.30 input / $2.50 output.
            // Retain the 2026-11-25 legacy 3.1 policy: $0.25 / $1.50 per million.
            long inputRate = config.model().equals(LlmSettings.GEMINI_MODEL) ? 300_000L : 250_000L;
            long outputRate =
                    config.model().equals(LlmSettings.GEMINI_MODEL) ? 2_500_000L : 1_500_000L;
            long reserved =
                    (1_048_576L * inputRate + config.maxOutputTokens() * outputRate + 999_999L)
                            / 1_000_000L;
            return new Quote(2 * reserved, inputRate, outputRate);
        }
        throw new ApiFailure(503, "ASSISTANT_NOT_CONFIGURED");
    }
}
