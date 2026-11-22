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
        throw new ApiFailure(503,"ASSISTANT_NOT_CONFIGURED");
    }
}
