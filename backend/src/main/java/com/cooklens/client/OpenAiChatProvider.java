package com.cooklens.client;

import com.cooklens.config.LlmSettings;
import com.cooklens.config.LlmSettings.Connection;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
import org.slf4j.LoggerFactory;

@Component
public final class OpenAiChatProvider implements ChatProvider {
    private final LlmSettings settings;
    private final ObjectMapper mapper;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public OpenAiChatProvider(LlmSettings settings, ObjectMapper mapper) {
        this.settings=settings;
        this.mapper=mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }
    @Override public void requireConfigured() { settings.requireConfigured(); }
    @Override public void validate(Prompt prompt) { payload(prompt,settings.requireConfigured()); }
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
            var messages=body.putArray("messages");
            for (var message:prompt.messages()) messages.addObject().put("role",message.role().name()).put("content",message.text());
            payload=mapper.writeValueAsBytes(body);
        } catch (java.io.IOException e) { throw unavailable(Usage.unknown()); }
        if (payload.length>65536) throw ChatPromptLimits.tooLarge();
        return payload;
    }
    @Override public Completion complete(Prompt prompt) {
        Connection config=settings.requireConfigured();
        byte[] payload=payload(prompt,config);
        var request=HttpRequest.newBuilder(config.endpoint()).timeout(config.timeout())
                .header("Authorization","Bearer "+config.key()).header("Content-Type","application/json")
                .header("Accept","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(payload)).build();
        var response=http.sendAsync(request,info -> new UpstreamTransport.LimitedBody());
        HttpResponse<byte[]> received;
        try { received=response.get(config.timeout().toMillis(),TimeUnit.MILLISECONDS); }
        catch (TimeoutException e) { response.cancel(true); throw timeout(); }
        catch (InterruptedException e) { response.cancel(true); Thread.currentThread().interrupt(); throw unavailable(Usage.unknown()); }
        catch (ExecutionException e) {
            response.cancel(true);
            Throwable cause=e.getCause();
            while (cause instanceof CompletionException) cause=cause.getCause();
            if (cause instanceof HttpTimeoutException) throw timeout();
            throw unavailable(Usage.unknown());
        }
        if (received.statusCode()!=200) {
            LoggerFactory.getLogger(OpenAiChatProvider.class).warn("Assistant provider HTTP status {}",received.statusCode());
            switch (received.statusCode()) {
                case 401,403 -> throw new Failure(503,"ASSISTANT_PROVIDER_AUTH_FAILED",Usage.unknown());
                case 429 -> throw new Failure(429,"ASSISTANT_RATE_LIMITED",Usage.unknown());
                case 402 -> throw new Failure(503,"ASSISTANT_BUDGET_EXCEEDED",Usage.unknown());
                default -> throw unavailable(Usage.unknown());
            }
        }
        Usage usage=Usage.unknown();
        try {
            if (!received.headers().firstValue("content-type").orElse("").split(";")[0].trim().equalsIgnoreCase("application/json"))
                throw unavailable(usage);
            JsonNode root=mapper.readTree(received.body());
            if (root==null || !root.isObject()) throw unavailable(usage);
            usage=usage(root.get("usage"));
            var choices=root.path("choices");
            boolean modelMatches=config.model().equals(root.path("model").textValue())
                    || (config.model().equals(LlmSettings.NVIDIA_BOLT_ALIAS) && LlmSettings.NVIDIA_BOLT_MODEL.equals(root.path("model").textValue()))
                    || (config.model().equals(LlmSettings.NVIDIA_SUPER_MODEL) && LlmSettings.NVIDIA_SUPER_REPORTED_MODEL.equals(root.path("model").textValue()));
            if (!modelMatches) LoggerFactory.getLogger(OpenAiChatProvider.class).warn("Assistant provider response model mismatch");
            if (!root.path("model").isTextual() || !modelMatches
                    || !choices.isArray() || choices.size()!=1) throw unavailable(usage);
            var choice=choices.get(0); var message=choice.path("message"); var content=message.path("content");
            if (!choice.path("index").isIntegralNumber() || !choice.path("index").canConvertToLong() || choice.path("index").longValue()!=0
                    || !choice.path("finish_reason").asText().equals("stop") || !message.path("role").asText().equals("assistant")
                    || !content.isTextual() || content.textValue().isBlank() || content.textValue().length()>16384
                    || (message.hasNonNull("tool_calls") && (!message.path("tool_calls").isArray() || !message.path("tool_calls").isEmpty()))
                    || message.hasNonNull("function_call") || message.hasNonNull("refusal")
                    || (usage.outputTokens()!=null && usage.outputTokens()>config.maxOutputTokens())) throw unavailable(usage);
            return new Completion(content.textValue(),"openai",root.path("model").textValue(),usage);
        } catch (java.io.IOException | IllegalArgumentException e) { throw unavailable(usage); }
    }
    private Usage usage(JsonNode value) {
        if (value==null || value.isNull()) return Usage.unknown();
        if (!value.isObject()) throw unavailable(Usage.unknown());
        Long input=null, output=null;
        try {
            input=tokenCount(value.get("prompt_tokens")); output=tokenCount(value.get("completion_tokens"));
            Long total=tokenCount(value.get("total_tokens"));
            if (input!=null && output!=null && total!=null && (input>Long.MAX_VALUE-output || input+output!=total))
                throw unavailable(new Usage(input,output));
            return new Usage(input,output);
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
