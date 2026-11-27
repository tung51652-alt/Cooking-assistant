package com.cooklens.config;

import com.cooklens.exception.ApiFailure;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class LlmSettings {
    public static final String GEMINI_MODEL = "gemini-3.1-flash-lite";
    public static final String GEMINI_BASE =
            "https://generativelanguage.googleapis.com/v1beta/openai";
    public static final String OPENAI_BASE = "https://api.openai.com/v1";
    public static final String NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
    public static final String NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
    public static final String NVIDIA_GEMMA_MODEL = "google/gemma-4-31b-it";
    public static final String NVIDIA_BOLT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
    public static final String NVIDIA_BOLT_ALIAS = "stg/" + NVIDIA_BOLT_MODEL;
    public static final String NVIDIA_LIGHTNING_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
    public static final String NVIDIA_SUPER_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
    public static final String NVIDIA_SUPER_REPORTED_MODEL =
            "private/nvidia/nemotron-3.5-super-120b-a12b";
    public static final Set<String> NVIDIA_TRIAL_MODELS =
            Set.of(
                    NVIDIA_MODEL,
                    NVIDIA_GEMMA_MODEL,
                    NVIDIA_BOLT_MODEL,
                    NVIDIA_BOLT_ALIAS,
                    NVIDIA_LIGHTNING_MODEL,
                    NVIDIA_SUPER_MODEL);
    private static final String KEY_REGEX = "[\\x21-\\x7E]{1,4096}";
    private static final String MODEL_REGEX = "[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}";
    private final String provider, baseUrl, model, key, timeout, output, input;

    public LlmSettings(
            @Value("${cooklens.llm.provider}") String provider,
            @Value("${cooklens.llm.base-url}") String baseUrl,
            @Value("${cooklens.llm.model}") String model,
            @Value("${cooklens.llm.api-key}") String key,
            @Value("${cooklens.llm.timeout-seconds}") String timeout,
            @Value("${cooklens.llm.max-output-tokens}") String output,
            @Value("${cooklens.llm.max-input-tokens}") String input) {
        this.provider = provider;
        this.baseUrl = baseUrl;
        this.model = model;
        this.key = key;
        this.timeout = timeout;
        this.output = output;
        this.input = input;
    }

    public record Connection(
            URI endpoint,
            String model,
            String key,
            Duration timeout,
            int maxOutputTokens,
            int maxInputTokens,
            boolean byok) {
        public Connection(
                URI endpoint,
                String model,
                String key,
                Duration timeout,
                int maxOutputTokens,
                int maxInputTokens) {
            this(endpoint, model, key, timeout, maxOutputTokens, maxInputTokens, false);
        }

        @Override
        public String toString() {
            return "LLM configuration (credentials omitted)";
        }
    }

    public record UserOverride(String provider, String baseUrl, String model, String apiKey) {
        public boolean hasApiKey() {
            return apiKey != null;
        }

        @Override
        public String toString() {
            return "LLM user override (credentials omitted)";
        }
    }

    public String normalizeUserProvider(UserOverride user, boolean requireProvider) {
        if (user == null) throw ApiFailure.invalid();
        String rawProvider = user.provider();
        if (rawProvider == null || rawProvider.isBlank()) {
            if (requireProvider || user.baseUrl() == null || user.baseUrl().isBlank())
                throw ApiFailure.invalid();
            return "custom";
        }
        String normalized = rawProvider.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("gemini", "openai", "nvidia", "custom").contains(normalized))
            throw ApiFailure.invalid();
        return normalized;
    }

    public Connection resolveUserConnection(
            UserOverride user, Integer maxOutputOverride, boolean requireProvider) {
        if (user == null
                || user.apiKey() == null
                || !user.apiKey().matches(KEY_REGEX)
                || user.model() == null
                || !user.model().matches(MODEL_REGEX)) {
            throw ApiFailure.invalid();
        }
        String normalizedProvider = normalizeUserProvider(user, requireProvider);
        String resolvedBase =
                switch (normalizedProvider) {
                    case "gemini" -> resolvePresetBase(GEMINI_BASE, user.baseUrl());
                    case "openai" -> resolvePresetBase(OPENAI_BASE, user.baseUrl());
                    case "nvidia" -> resolvePresetBase(NVIDIA_BASE, user.baseUrl());
                    case "custom" -> validateCustomBaseUrl(user.baseUrl());
                    default -> throw ApiFailure.invalid();
                };
        int seconds = safeBounded(timeout, 1, 20, 20);
        int maxOutput =
                maxOutputOverride != null ? maxOutputOverride : safeBounded(output, 1, 512, 512);
        int maxInput = safeBounded(input, 1, 6000, 6000);
        return new Connection(
                URI.create(resolvedBase + "/chat/completions"),
                user.model(),
                user.apiKey(),
                Duration.ofSeconds(seconds),
                maxOutput,
                maxInput,
                true);
    }

    private static String resolvePresetBase(String preset, String suppliedBase) {
        if (suppliedBase != null && !suppliedBase.isBlank()) {
            if (hasWhitespace(suppliedBase)
                    || !stripSingleTrailingSlash(suppliedBase).equals(preset)) {
                throw ApiFailure.invalid();
            }
        }
        return preset;
    }

    private static String validateCustomBaseUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank() || hasWhitespace(rawUrl)) throw ApiFailure.invalid();
        try {
            URI base = URI.create(rawUrl);
            String scheme =
                    base.getScheme() == null ? null : base.getScheme().toLowerCase(Locale.ROOT);
            String host = base.getHost();
            String authority = base.getRawAuthority();
            if (host == null
                    || host.isBlank()
                    || authority == null
                    || authority.contains("@")
                    || authority.contains("%")
                    || authority.endsWith(":")) {
                throw ApiFailure.invalid();
            }
            if (!"https".equals(scheme) && !"http".equals(scheme)) {
                throw ApiFailure.invalid();
            }
            if (base.getRawUserInfo() != null
                    || base.getUserInfo() != null
                    || base.getRawQuery() != null
                    || base.getQuery() != null
                    || base.getRawFragment() != null
                    || base.getFragment() != null
                    || base.getPort() == 0
                    || base.getPort() > 65535
                    || base.getRawPath() == null) {
                throw ApiFailure.invalid();
            }
            String path = stripSingleTrailingSlash(base.getRawPath());
            if (path.contains("%") || path.contains("..") || path.contains("//"))
                throw ApiFailure.invalid();
            if (!(path.endsWith("/v1")
                    || path.endsWith("/v1beta/openai")
                    || path.endsWith("/openai"))) {
                throw ApiFailure.invalid();
            }
            if (OutboundEndpointGuard.isBlockedHost(host)) {
                throw OutboundEndpointGuard.blockedEndpoint();
            }
            if (!"https".equals(scheme)) {
                throw ApiFailure.invalid();
            }
            return scheme + "://" + authority + path;
        } catch (IllegalArgumentException e) {
            throw ApiFailure.invalid();
        }
    }

    private static boolean hasWhitespace(String value) {
        return value.chars().anyMatch(Character::isWhitespace);
    }

    private static String stripSingleTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    // Validate on assistant use so missing or invalid chat settings do not break readiness.
    public Connection requireConfigured() {
        if (!"openai".equals(provider)) throw new ApiFailure(503, "ASSISTANT_PROVIDER_UNSUPPORTED");
        try {
            if (key == null
                    || !key.matches(KEY_REGEX)
                    || model == null
                    || !model.matches(MODEL_REGEX)) throw new IllegalArgumentException();
            URI base = URI.create(baseUrl);
            String path = base.getRawPath().replaceAll("/$", "");
            boolean local = List.of("127.0.0.1", "localhost", "[::1]").contains(base.getHost());
            boolean google =
                    "https".equals(base.getScheme())
                            && "generativelanguage.googleapis.com".equalsIgnoreCase(base.getHost())
                            && (base.getPort() == -1 || base.getPort() == 443)
                            && path.equals("/v1beta/openai");
            if (!("https".equals(base.getScheme()) || ("http".equals(base.getScheme()) && local))
                    || base.getHost() == null
                    || base.getUserInfo() != null
                    || base.getRawQuery() != null
                    || base.getRawFragment() != null
                    || base.getPort() == 0
                    || base.getPort() > 65535
                    || (!google && !path.endsWith("/v1"))
                    || path.contains("%")
                    || path.contains("..")
                    || path.contains("//")) throw new IllegalArgumentException();
            int seconds = bounded(timeout, 1, 20),
                    maxOutput = bounded(output, 1, 512),
                    maxInput = bounded(input, 1, 6000);
            return new Connection(
                    URI.create(baseUrl.replaceAll("/$", "") + "/chat/completions"),
                    model,
                    key,
                    Duration.ofSeconds(seconds),
                    maxOutput,
                    maxInput,
                    false);
        } catch (RuntimeException e) {
            throw new ApiFailure(503, "ASSISTANT_NOT_CONFIGURED");
        }
    }

    private int bounded(String value, int minimum, int maximum) {
        int number = Integer.parseInt(value);
        if (number < minimum || number > maximum) throw new IllegalArgumentException();
        return number;
    }

    private int safeBounded(String value, int minimum, int maximum, int fallback) {
        try {
            return bounded(value, minimum, maximum);
        } catch (RuntimeException e) {
            return fallback;
        }
    }
}
