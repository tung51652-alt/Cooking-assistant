package com.cooklens.client;

import com.cooklens.config.LlmSettings;
import com.cooklens.config.LlmSettings.Connection;
import com.cooklens.config.OutboundEndpointGuard;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import java.net.ConnectException;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.slf4j.LoggerFactory;

@Component
public final class OpenAiChatProvider implements ChatProvider {
    private static final long RETRY_BACKOFF_MS = 300;
    private static final long MIN_RETRY_WINDOW_MS = 500;
    private static final Set<String> ALLOWED_FINISH_REASONS = Set.of("stop", "length");
    private final LlmSettings settings;
    private final ObjectMapper mapper;
    private final ByokTransport byokTransport;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public OpenAiChatProvider(LlmSettings settings, ObjectMapper mapper) {
        this(settings, mapper, new PinnedHttpsTransport(new OutboundEndpointGuard()));
    }
    @Autowired
    public OpenAiChatProvider(LlmSettings settings, ObjectMapper mapper, ByokTransport byokTransport) {
        this.settings=settings;
        this.byokTransport=byokTransport;
        this.mapper=mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    @Override public void requireConfigured() { settings.requireConfigured(); }
    @Override public void validate(Prompt prompt) { payload(prompt,settings.requireConfigured()); }
    @Override public void validate(Prompt prompt, Connection config) { payload(prompt,config); }
    private byte[] payload(Prompt prompt, Connection config) {
        ChatPromptLimits.validate(prompt,config.maxInputTokens());
        byte[] payload;
        try {
            var body=mapper.createObjectNode();
            body.put("model",config.model()); body.put("stream",false); body.put("max_tokens",config.maxOutputTokens());
            if (LlmSettings.NVIDIA_TRIAL_MODELS.contains(config.model())) body.put("temperature",0.1);
            if (config.model().equals(LlmSettings.NVIDIA_MODEL) || config.model().equals(LlmSettings.NVIDIA_BOLT_ALIAS)
                    || config.model().equals(LlmSettings.NVIDIA_BOLT_MODEL) || config.model().equals(LlmSettings.NVIDIA_LIGHTNING_MODEL)) {
                body.putObject("chat_template_kwargs").put("enable_thinking",false);
            }
            if (config.model().equals(LlmSettings.NVIDIA_SUPER_MODEL)) body.put("reasoning_effort","none");
            if (config.model().equals(LlmSettings.GEMINI_MODEL)) body.put("reasoning_effort","minimal");
            var messages=body.putArray("messages");
            for (var message:prompt.messages()) messages.addObject().put("role",message.role().name()).put("content",message.text());
            payload=mapper.writeValueAsBytes(body);
        } catch (java.io.IOException e) { throw unavailable(Usage.unknown()); }
        if (payload.length>65536) throw ChatPromptLimits.tooLarge();
        return payload;
    }
    @Override public Completion complete(Prompt prompt) {
        return complete(prompt, settings.requireConfigured());
    }
    @Override public Completion complete(Prompt prompt, Connection config) {
        byte[] payload=payload(prompt,config);
        long deadlineNanos=System.nanoTime()+config.timeout().toNanos();
        ByokTransport.Response received=null;
        for (int attempt=0; attempt<2; attempt++) {
            long remainingMs=TimeUnit.NANOSECONDS.toMillis(deadlineNanos-System.nanoTime());
            if (remainingMs<=0) throw timeout();
            try {
                received=sendAttempt(config,payload,remainingMs);
            } catch (ConnectException e) {
                if (attempt==0 && pauseForRetry(deadlineNanos)) continue;
                throw unavailable(Usage.unknown());
            }
            if (received.statusCode()==200) break;
            LoggerFactory.getLogger(OpenAiChatProvider.class).warn("Assistant provider HTTP status {}",received.statusCode());
            // Retry only transient 502/503 responses once within the remaining request deadline.
            if ((received.statusCode()==502 || received.statusCode()==503) && attempt==0 && pauseForRetry(deadlineNanos)) continue;
            switch (received.statusCode()) {
                case 401,403 -> throw new Failure(503,"ASSISTANT_PROVIDER_AUTH_FAILED",Usage.unknown());
                case 400,404 -> {
                    if (config.byok()) throw new Failure(422,"ASSISTANT_MODEL_INVALID",Usage.unknown());
                    throw unavailable(Usage.unknown());
                }
                case 429 -> throw new Failure(429,"ASSISTANT_RATE_LIMITED",Usage.unknown());
                case 402 -> throw new Failure(503,"ASSISTANT_BUDGET_EXCEEDED",Usage.unknown());
                default -> throw unavailable(Usage.unknown());
            }
        }
        Usage usage=Usage.unknown();
        try {
            if (!received.contentType().split(";")[0].trim().equalsIgnoreCase("application/json"))
                throw unavailable(usage);
            JsonNode root=mapper.readTree(received.body());
            if (root==null || !root.isObject()) throw unavailable(usage);
            ParsedUsage parsedUsage=usage(root.get("usage"));
            usage=parsedUsage.usage();
            var choices=root.path("choices");
            String reportedModel=root.path("model").textValue();
            boolean modelMatches=modelMatches(config, reportedModel);
            if (!modelMatches) LoggerFactory.getLogger(OpenAiChatProvider.class).warn("Assistant provider response model mismatch");
            if (!root.path("model").isTextual() || !modelMatches
                    || !choices.isArray() || choices.size()!=1) throw unavailable(usage);
            var choice=choices.get(0); var message=choice.path("message"); var content=message.path("content");
            String finishReason=choice.path("finish_reason").asText("");
            long outputLimit=config.maxOutputTokens();
            if (parsedUsage.reasoningIncludedInCompletion() && parsedUsage.reasoningTokens()!=null)
                outputLimit=outputLimit>Long.MAX_VALUE-parsedUsage.reasoningTokens() ? Long.MAX_VALUE : outputLimit+parsedUsage.reasoningTokens();
            if (!choice.path("index").isIntegralNumber() || !choice.path("index").canConvertToLong() || choice.path("index").longValue()!=0
                    || !ALLOWED_FINISH_REASONS.contains(finishReason) || !message.path("role").asText().equals("assistant")
                    || !content.isTextual() || content.textValue().isBlank() || content.textValue().length()>16384
                    || (message.hasNonNull("tool_calls") && (!message.path("tool_calls").isArray() || !message.path("tool_calls").isEmpty()))
                    || message.hasNonNull("function_call") || message.hasNonNull("refusal")
                    || (usage.outputTokens()!=null && usage.outputTokens()>outputLimit)) throw unavailable(usage);
            return new Completion(content.textValue(),"openai",reportedModel,usage);
        } catch (java.io.IOException | IllegalArgumentException e) { throw unavailable(usage); }
    }
    private boolean modelMatches(Connection config, String reportedModel) {
        if (reportedModel == null || reportedModel.isBlank()) return false;
        String requested = config.model();
        if (requested.equals(reportedModel)
                || (requested.equals(LlmSettings.NVIDIA_BOLT_ALIAS) && LlmSettings.NVIDIA_BOLT_MODEL.equals(reportedModel))
                || (requested.equals(LlmSettings.NVIDIA_SUPER_MODEL) && LlmSettings.NVIDIA_SUPER_REPORTED_MODEL.equals(reportedModel))) {
            return true;
        }
        if (!config.byok()) return false;
        String req = stripModelsPrefix(requested);
        String rep = stripModelsPrefix(reportedModel);
        return rep.equals(req)
                || rep.startsWith(req + "-")
                || rep.startsWith(req + ":")
                || rep.startsWith(req + "@");
    }
    private static String stripModelsPrefix(String model) {
        return model.startsWith("models/") ? model.substring("models/".length()) : model;
    }
    private ByokTransport.Response sendAttempt(Connection config, byte[] payload, long remainingMs) throws ConnectException {
        if (config.byok()) {
            return byokTransport.send(config, payload, remainingMs);
        }
        var request=HttpRequest.newBuilder(config.endpoint()).timeout(Duration.ofMillis(Math.max(1,remainingMs)))
                .header("Authorization","Bearer "+config.key()).header("Content-Type","application/json")
                .header("Accept","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(payload)).build();
        var response=http.sendAsync(request,info -> new UpstreamTransport.LimitedBody());
        try {
            var httpResponse = response.get(remainingMs,TimeUnit.MILLISECONDS);
            return new ByokTransport.Response(
                    httpResponse.statusCode(),
                    httpResponse.headers().firstValue("content-type").orElse(""),
                    httpResponse.body());
        }
        catch (TimeoutException e) { response.cancel(true); throw timeout(); }
        catch (InterruptedException e) { response.cancel(true); Thread.currentThread().interrupt(); throw unavailable(Usage.unknown()); }
        catch (ExecutionException e) {
            response.cancel(true);
            Throwable cause=e.getCause();
            while (cause instanceof CompletionException) cause=cause.getCause();
            if (cause instanceof HttpConnectTimeoutException) throw unavailable(Usage.unknown());
            if (cause instanceof HttpTimeoutException) throw timeout();
            if (cause instanceof ConnectException connect) throw connect;
            throw unavailable(Usage.unknown());
        }
    }
    private boolean pauseForRetry(long deadlineNanos) {
        long remainingMs=TimeUnit.NANOSECONDS.toMillis(deadlineNanos-System.nanoTime());
        if (remainingMs<=RETRY_BACKOFF_MS+MIN_RETRY_WINDOW_MS) return false;
        try { Thread.sleep(RETRY_BACKOFF_MS); return true; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(Usage.unknown()); }
    }
    private record ParsedUsage(Usage usage, Long reasoningTokens, boolean reasoningIncludedInCompletion) {}
    private ParsedUsage usage(JsonNode value) {
        if (value==null || value.isNull()) return new ParsedUsage(Usage.unknown(),null,false);
        if (!value.isObject()) throw unavailable(Usage.unknown());
        Long input=null, output=null;
        try {
            input=tokenCount(value.get("prompt_tokens")); output=tokenCount(value.get("completion_tokens"));
            Long total=tokenCount(value.get("total_tokens"));
            Long reasoning=null;
            JsonNode details=value.get("completion_tokens_details");
            if (details!=null && !details.isNull()) {
                if (!details.isObject()) throw unavailable(new Usage(input,output));
                reasoning=tokenCount(details.get("reasoning_tokens"));
            }
            if (input!=null && output!=null && total!=null && (input>Long.MAX_VALUE-output || input+output>total))
                throw unavailable(new Usage(input,output));
            boolean reasoningIncluded=reasoning!=null && input!=null && output!=null && total!=null
                    && input<=Long.MAX_VALUE-output && input+output==total;
            return new ParsedUsage(new Usage(input,output),reasoning,reasoningIncluded);
        } catch (Failure failure) { throw unavailable(new Usage(input,output)); }
    }
    private Long tokenCount(JsonNode value) {
        if (value==null || value.isNull()) return null;
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue()<0) throw unavailable(Usage.unknown());
        return value.longValue();
    }
    private Failure unavailable(Usage usage) { return new Failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",usage); }
    private Failure timeout() { return new Failure(504,"ASSISTANT_PROVIDER_TIMEOUT",Usage.unknown()); }
}
