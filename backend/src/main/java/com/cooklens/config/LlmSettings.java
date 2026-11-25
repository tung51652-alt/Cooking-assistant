package com.cooklens.config;

import com.cooklens.exception.ApiFailure;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class LlmSettings {
    public static final String GEMINI_MODEL="gemini-3.1-flash-lite";
    public static final String GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta/openai";
    public static final String NVIDIA_MODEL="nvidia/nemotron-3-ultra-550b-a55b";
    public static final String NVIDIA_GEMMA_MODEL="google/gemma-4-31b-it";
    public static final String NVIDIA_BOLT_MODEL="nvidia/nemotron-3.5-bolt-e4b";
    public static final String NVIDIA_BOLT_ALIAS="stg/"+NVIDIA_BOLT_MODEL;
    public static final String NVIDIA_LIGHTNING_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b";
    public static final String NVIDIA_SUPER_MODEL="nvidia/nemotron-3.5-super-vl-120b-a12b";
    public static final String NVIDIA_SUPER_REPORTED_MODEL="private/nvidia/nemotron-3.5-super-120b-a12b";
    public static final Set<String> NVIDIA_TRIAL_MODELS=Set.of(NVIDIA_MODEL,NVIDIA_GEMMA_MODEL,NVIDIA_BOLT_MODEL,NVIDIA_BOLT_ALIAS,NVIDIA_LIGHTNING_MODEL,NVIDIA_SUPER_MODEL);
    private final String provider, baseUrl, model, key, timeout, output, input;
    public LlmSettings(@Value("${cooklens.llm.provider}") String provider,
                       @Value("${cooklens.llm.base-url}") String baseUrl,
                       @Value("${cooklens.llm.model}") String model,
                       @Value("${cooklens.llm.api-key}") String key,
                       @Value("${cooklens.llm.timeout-seconds}") String timeout,
                       @Value("${cooklens.llm.max-output-tokens}") String output,
                       @Value("${cooklens.llm.max-input-tokens}") String input) {
        this.provider=provider; this.baseUrl=baseUrl; this.model=model; this.key=key;
        this.timeout=timeout; this.output=output; this.input=input;
    }
    public record Connection(URI endpoint, String model, String key, Duration timeout, int maxOutputTokens, int maxInputTokens) {
        @Override public String toString() { return "LLM configuration (credentials omitted)"; }
    }
    // Validate on assistant use so missing or invalid chat settings do not break readiness.
    public Connection requireConfigured() {
        if (!"openai".equals(provider)) throw new ApiFailure(503,"ASSISTANT_PROVIDER_UNSUPPORTED");
        try {
            if (key == null || !key.matches("[\\x21-\\x7E]{1,4096}") || model == null
                    || !model.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}")) throw new IllegalArgumentException();
            URI base=URI.create(baseUrl);
            String path=base.getRawPath().replaceAll("/$","");
            boolean local=List.of("127.0.0.1","localhost","[::1]").contains(base.getHost());
            boolean google="https".equals(base.getScheme()) && "generativelanguage.googleapis.com".equalsIgnoreCase(base.getHost())
                    && (base.getPort()==-1 || base.getPort()==443) && path.equals("/v1beta/openai");
            if (!("https".equals(base.getScheme()) || ("http".equals(base.getScheme()) && local))
                    || base.getHost()==null || base.getUserInfo()!=null || base.getRawQuery()!=null || base.getRawFragment()!=null
                    || base.getPort()==0 || base.getPort()>65535
                    || (!google && !path.endsWith("/v1")) || path.contains("%") || path.contains("..") || path.contains("//"))
                throw new IllegalArgumentException();
            int seconds=bounded(timeout,1,20), maxOutput=bounded(output,1,512), maxInput=bounded(input,1,6000);
            return new Connection(URI.create(baseUrl.replaceAll("/$","")+"/chat/completions"),model,key,
                    Duration.ofSeconds(seconds),maxOutput,maxInput);
        } catch (RuntimeException e) { throw new ApiFailure(503,"ASSISTANT_NOT_CONFIGURED"); }
    }
    private int bounded(String value, int minimum, int maximum) {
        int number=Integer.parseInt(value);
        if (number<minimum || number>maximum) throw new IllegalArgumentException();
        return number;
    }
}
