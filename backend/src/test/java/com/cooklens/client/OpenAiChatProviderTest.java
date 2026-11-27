package com.cooklens.client;

import com.cooklens.client.ChatProvider.*;
import com.cooklens.config.LlmSettings;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class OpenAiChatProviderTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final String key="test-"+UUID.randomUUID();
    private final AtomicInteger calls=new AtomicInteger();
    private HttpServer server;
    private ExecutorService executor;
    private String base;
    private volatile int status=200;
    private volatile String contentType="application/json", payload, received, authorization, receivedPath;
    private volatile boolean stall;

    @BeforeEach void start() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        executor=Executors.newVirtualThreadPerTaskExecutor(); server.setExecutor(executor);
        server.createContext("/",this::respond); server.start();
        base="http://127.0.0.1:"+server.getAddress().getPort()+"/v1";
        payload=good().toString();
    }
    @AfterEach void stop() { server.stop(0); executor.shutdownNow(); }
    private void respond(HttpExchange exchange) throws java.io.IOException {
        try (exchange) {
            calls.incrementAndGet(); received=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            authorization=exchange.getRequestHeaders().getFirst("Authorization"); receivedPath=exchange.getRequestURI().getPath();
            exchange.getResponseHeaders().set("Content-Type",contentType);
            exchange.getResponseHeaders().set("Location",base+"/redirect-target");
            exchange.sendResponseHeaders(status,0);
            if (stall) {
                exchange.getResponseBody().write(' '); exchange.getResponseBody().flush();
                try { Thread.sleep(3000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            }
            exchange.getResponseBody().write(payload.getBytes(StandardCharsets.UTF_8));
        } catch (java.io.IOException e) { /* Timeout/oversize tests deliberately close the connection. */ }
    }
    private ObjectNode good() {
        var root=mapper.createObjectNode(); root.put("model",LlmSettings.NVIDIA_MODEL);
        var choice=root.putArray("choices").addObject(); choice.put("index",0); choice.put("finish_reason","stop");
        choice.putObject("message").put("role","assistant").put("content","Theo công thức: thực hiện bước hiện tại.")
                .put("reasoning_content","private reasoning is ignored");
        root.putObject("usage").put("prompt_tokens",120).put("completion_tokens",30).put("total_tokens",150);
        return root;
    }
    private LlmSettings settings() { return new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,key,"20","512","6000"); }
    private OpenAiChatProvider provider() { return new OpenAiChatProvider(settings(),mapper); }
    private Prompt prompt() { return new Prompt(List.of(new Message(Role.system,"Chỉ dẫn"),new Message(Role.user,"Câu hỏi"))); }
    @Test void geminiUsesMinimalReasoningAndExactReportedModel() throws Exception {
        var response=good(); response.put("model",LlmSettings.GEMINI_MODEL); payload=response.toString();
        var settings=new LlmSettings("openai",base,LlmSettings.GEMINI_MODEL,key,"20","512","6000");
        var result=new OpenAiChatProvider(settings,mapper).complete(prompt());
        var body=mapper.readTree(received);
        assertEquals(LlmSettings.GEMINI_MODEL,result.model()); assertEquals(new Usage(120L,30L),result.usage());
        assertEquals("minimal",body.path("reasoning_effort").asText());
        assertEquals(512,body.path("max_tokens").asInt()); assertFalse(body.path("stream").asBoolean(true));
        assertFalse(body.has("chat_template_kwargs")); assertFalse(body.has("temperature"));
        assertEquals(1,calls.get());
        response.put("model","gemini-unverified-alias"); payload=response.toString();
        failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> new OpenAiChatProvider(settings,mapper).complete(prompt()));
    }
    @Test void onlyExactHttpsGoogleCompatibilityBaseIsAccepted() {
        var settings=new LlmSettings("openai",LlmSettings.GEMINI_BASE+"/",LlmSettings.GEMINI_MODEL,key,"20","512","6000");
        assertEquals(LlmSettings.GEMINI_BASE+"/chat/completions",settings.requireConfigured().endpoint().toString());
        for (String url:List.of("http://generativelanguage.googleapis.com/v1beta/openai",
                "https://example.com/v1beta/openai", "https://generativelanguage.googleapis.com:444/v1beta/openai",
                LlmSettings.GEMINI_BASE+"?query=x", LlmSettings.GEMINI_BASE+"#fragment"))
            assertThrows(ApiFailure.class,() -> new LlmSettings("openai",url,LlmSettings.GEMINI_MODEL,key,"20","512","6000").requireConfigured());
    }
    @Test void gemmaUsesSameBoundedTransportWithoutNemotronSpecificArguments() throws Exception {
        var response=good(); response.put("model",LlmSettings.NVIDIA_GEMMA_MODEL); payload=response.toString();
        var settings=new LlmSettings("openai",base,LlmSettings.NVIDIA_GEMMA_MODEL,key,"20","512","6000");
        var result=new OpenAiChatProvider(settings,mapper).complete(prompt());
        var body=mapper.readTree(received);
        assertEquals(LlmSettings.NVIDIA_GEMMA_MODEL,result.model());
        assertEquals(0.1,body.path("temperature").asDouble());
        assertFalse(body.has("chat_template_kwargs")); assertFalse(body.has("top_p"));
        assertFalse(body.path("stream").asBoolean(true)); assertEquals(512,body.path("max_tokens").asInt());
        assertEquals(new Usage(120L,30L),result.usage()); assertEquals(1,calls.get());
    }
    @Test void boltUsesExplicitNonThinkingModeAndVerifiedModel() throws Exception {
        var response=good(); response.put("model",LlmSettings.NVIDIA_BOLT_MODEL); payload=response.toString();
        var settings=new LlmSettings("openai",base,LlmSettings.NVIDIA_BOLT_ALIAS,key,"20","512","6000");
        var result=new OpenAiChatProvider(settings,mapper).complete(prompt());
        var body=mapper.readTree(received);
        assertEquals(LlmSettings.NVIDIA_BOLT_MODEL,result.model());
        assertEquals(LlmSettings.NVIDIA_BOLT_ALIAS,body.path("model").asText());
        assertFalse(body.path("chat_template_kwargs").path("enable_thinking").asBoolean(true));
        assertEquals(0.1,body.path("temperature").asDouble()); assertFalse(body.has("top_p"));
        assertEquals(1,calls.get());
    }
    @Test void lightningUsesBoundedNonThinkingRequest() throws Exception {
        var response=good(); response.put("model",LlmSettings.NVIDIA_LIGHTNING_MODEL); payload=response.toString();
        var settings=new LlmSettings("openai",base,LlmSettings.NVIDIA_LIGHTNING_MODEL,key,"20","512","6000");
        assertEquals(LlmSettings.NVIDIA_LIGHTNING_MODEL,new OpenAiChatProvider(settings,mapper).complete(prompt()).model());
        var body=mapper.readTree(received);
        assertFalse(body.path("chat_template_kwargs").path("enable_thinking").asBoolean(true));
        assertEquals(512,body.path("max_tokens").asInt()); assertEquals(1,calls.get());
    }
    @Test void superUsesTextOnlyBoundedNonThinkingRequest() throws Exception {
        var response=good(); response.put("model",LlmSettings.NVIDIA_SUPER_REPORTED_MODEL); payload=response.toString();
        var settings=new LlmSettings("openai",base,LlmSettings.NVIDIA_SUPER_MODEL,key,"20","512","6000");
        assertEquals(LlmSettings.NVIDIA_SUPER_REPORTED_MODEL,new OpenAiChatProvider(settings,mapper).complete(prompt()).model());
        var body=mapper.readTree(received);
        assertEquals("none",body.path("reasoning_effort").asText()); assertFalse(body.has("chat_template_kwargs"));
        assertTrue(body.path("messages").get(1).path("content").isTextual());
        assertEquals(512,body.path("max_tokens").asInt()); assertEquals(1,calls.get());
        response.put("model","private/nvidia/unverified-model"); payload=response.toString();
        failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> new OpenAiChatProvider(settings,mapper).complete(prompt()));
    }
    private ApiFailure failure(int code, String name, Runnable call) {
        var error=assertThrows(ApiFailure.class,call::run); assertEquals(code,error.status()); assertEquals(name,error.code());
        assertFalse(error.toString().contains(key)); assertNull(error.getCause()); return error;
    }

    @Test void mapsRequestAndReturnsOnlyFinalContentAndUsage() throws Exception {
        var request=new Prompt(List.of(new Message(Role.system,"Quy tắc"),new Message(Role.user,"Recipe JSON"),
                new Message(Role.user,"Câu trước"),new Message(Role.assistant,"Trả lời trước"),new Message(Role.user,"Câu mới")));
        Completion result=provider().complete(request);
        assertEquals("openai",result.provider()); assertEquals(LlmSettings.NVIDIA_MODEL,result.model());
        assertEquals(new Usage(120L,30L),result.usage()); assertEquals(good().path("choices").get(0).path("message").path("content").asText(),result.text());
        assertEquals("/v1/chat/completions",receivedPath); assertEquals("Bearer "+key,authorization);
        var body=mapper.readTree(received); assertEquals(LlmSettings.NVIDIA_MODEL,body.path("model").asText());
        assertFalse(body.path("stream").asBoolean(true)); assertEquals(512,body.path("max_tokens").asInt());
        assertEquals(0.1,body.path("temperature").asDouble()); assertFalse(body.has("top_p"));
        assertFalse(body.path("chat_template_kwargs").path("enable_thinking").asBoolean(true));
        assertFalse(body.has("tools")); assertFalse(received.contains(key));
        for (int i=0;i<request.messages().size();i++) {
            assertEquals(request.messages().get(i).role().name(),body.path("messages").get(i).path("role").asText());
            assertEquals(request.messages().get(i).text(),body.path("messages").get(i).path("content").asText());
        }
        assertEquals(1,calls.get()); assertFalse(settings().requireConfigured().toString().contains(key));
        assertFalse(request.toString().contains("Câu mới")); assertFalse(result.toString().contains(result.text()));
    }

    @Test void mapsHttpErrorsWithoutLeakingProviderBodyAndRetriesOnlyTransient502And503() {
        var provider=provider(); payload="provider body containing "+key;
        for (int code:List.of(401,403,429,402,500,404,422,202,302)) {
            status=code;
            String expected=switch (code) {
                case 401,403 -> "ASSISTANT_PROVIDER_AUTH_FAILED";
                case 429 -> "ASSISTANT_RATE_LIMITED";
                case 402 -> "ASSISTANT_BUDGET_EXCEEDED";
                default -> "ASSISTANT_PROVIDER_UNAVAILABLE";
            };
            int before=calls.get(); failure(code==429 ? 429 : 503,expected,() -> provider.complete(prompt()));
            assertEquals(before+1,calls.get());
        }
        for (int code:List.of(502,503)) {
            status=code;
            int before=calls.get(); failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
            assertEquals(before+2,calls.get());
        }
    }

    @Test void retriesTransient503OnceAndRecoversWithinDeadline() throws Exception {
        var transientServer=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var transientExecutor=Executors.newVirtualThreadPerTaskExecutor();
        transientServer.setExecutor(transientExecutor);
        var attempt=new AtomicInteger();
        transientServer.createContext("/",exchange -> {
            try (exchange) {
                exchange.getRequestBody().readAllBytes();
                int n=attempt.incrementAndGet();
                byte[] body=(n==1 ? "{\"error\":\"busy\"}" : good().toString()).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type","application/json");
                exchange.sendResponseHeaders(n==1 ? 503 : 200,body.length);
                exchange.getResponseBody().write(body);
            }
        });
        transientServer.start();
        try {
            var transientBase="http://127.0.0.1:"+transientServer.getAddress().getPort()+"/v1";
            var provider=new OpenAiChatProvider(new LlmSettings("openai",transientBase,LlmSettings.NVIDIA_MODEL,key,"5","512","6000"),mapper);
            Completion result=provider.complete(prompt());
            assertEquals(2,attempt.get());
            assertEquals(good().path("choices").get(0).path("message").path("content").asText(),result.text());
        } finally { transientServer.stop(0); transientExecutor.shutdownNow(); }
    }

    @Test void skipsRetryWhenRemainingDeadlineWindowIsTooShort() throws Exception {
        var slowServer=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var slowExecutor=Executors.newVirtualThreadPerTaskExecutor();
        slowServer.setExecutor(slowExecutor);
        var attempt=new AtomicInteger();
        slowServer.createContext("/",exchange -> {
            try (exchange) {
                exchange.getRequestBody().readAllBytes();
                attempt.incrementAndGet();
                try { Thread.sleep(350); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                byte[] body="{\"error\":\"busy\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type","application/json");
                exchange.sendResponseHeaders(503,body.length);
                exchange.getResponseBody().write(body);
            }
        });
        slowServer.start();
        try {
            var slowBase="http://127.0.0.1:"+slowServer.getAddress().getPort()+"/v1";
            var provider=new OpenAiChatProvider(new LlmSettings("openai",slowBase,LlmSettings.NVIDIA_MODEL,key,"1","512","6000"),mapper);
            failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
            assertEquals(1,attempt.get());
        } finally { slowServer.stop(0); slowExecutor.shutdownNow(); }
    }

    @Test void preservesUnknownAndPartialUsageWithoutInventingZero() {
        var provider=provider(); var missing=good(); missing.remove("usage"); payload=missing.toString();
        assertEquals(Usage.unknown(),provider.complete(prompt()).usage());
        var partial=good(); ((ObjectNode)partial.path("usage")).remove(List.of("completion_tokens","total_tokens")); payload=partial.toString();
        assertEquals(new Usage(120L,null),provider.complete(prompt()).usage());
    }

    @Test void acceptsLengthFinishReasonAndReasoningTokenTotalsWithinBounds() {
        var provider=provider();
        var truncated=good(); ((ObjectNode)truncated.path("choices").get(0)).put("finish_reason","length");
        payload=truncated.toString();
        assertEquals(good().path("choices").get(0).path("message").path("content").asText(),provider.complete(prompt()).text());

        var geminiReasoning=good();
        ((ObjectNode)geminiReasoning.path("usage")).put("prompt_tokens",15).put("completion_tokens",20).put("total_tokens",60);
        payload=geminiReasoning.toString();
        assertEquals(new Usage(15L,20L),provider.complete(prompt()).usage());

        var includedReasoning=good();
        var includedUsage=(ObjectNode)includedReasoning.path("usage");
        includedUsage.put("prompt_tokens",100).put("completion_tokens",520).put("total_tokens",620);
        includedUsage.putObject("completion_tokens_details").put("reasoning_tokens",20);
        payload=includedReasoning.toString();
        assertEquals(new Usage(100L,520L),provider.complete(prompt()).usage());
    }

    @Test void rejectsEmptyToolWrongModelOrExceededRepliesButRetainsUsage() {
        var provider=provider();
        for (String mode:List.of("blank","blank-length","tools","role","model","output-limit")) {
            var root=good(); var choice=(ObjectNode)root.path("choices").get(0); var message=(ObjectNode)choice.path("message");
            switch (mode) {
                case "blank" -> message.put("content"," ");
                case "blank-length" -> { choice.put("finish_reason","length"); message.put("content"," "); }
                case "tools" -> message.putArray("tool_calls").addObject().put("id","tool");
                case "role" -> message.put("role","system");
                case "model" -> root.put("model","different-model");
                case "output-limit" -> { ((ObjectNode)root.path("usage")).put("completion_tokens",513).put("total_tokens",633); }
            }
            payload=root.toString();
            var error=(Failure)failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
            assertEquals(120L,error.usage().inputTokens()); assertNotNull(error.usage().outputTokens());
        }
    }

    @Test void rejectsMalformedUsageJsonAndUnexpectedResponseTypes() {
        var provider=provider();
        for (String mode:List.of("negative","string","float","overflow","wrong-total","bad-reasoning-details","negative-reasoning","array","duplicate","trailing","bad-json")) {
            var root=good(); var usage=(ObjectNode)root.path("usage");
            switch (mode) {
                case "negative" -> usage.put("prompt_tokens",-1);
                case "string" -> usage.put("completion_tokens","30");
                case "float" -> usage.put("completion_tokens",1.5);
                case "overflow" -> usage.put("total_tokens",new java.math.BigInteger("18446744073709551616"));
                case "wrong-total" -> usage.put("total_tokens",100);
                case "bad-reasoning-details" -> usage.put("completion_tokens_details","bad");
                case "negative-reasoning" -> usage.putObject("completion_tokens_details").put("reasoning_tokens",-1);
                case "array" -> root.putArray("usage");
            }
            payload=switch (mode) {
                case "duplicate" -> root.toString().replace("\"model\":","\"model\":\"duplicate\",\"model\":");
                case "trailing" -> root+" {}";
                case "bad-json" -> "{broken";
                default -> root.toString();
            };
            failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
        }
        contentType="text/event-stream"; payload=good().toString();
        failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
    }

    @Test void boundsChunkedBodyAndTotalDeadlineIncludingSlowBody() {
        var provider=provider(); payload="x".repeat(1024*1024+1);
        failure(503,"ASSISTANT_PROVIDER_UNAVAILABLE",() -> provider.complete(prompt()));
        stall=true; payload=good().toString();
        var shortDeadline=new OpenAiChatProvider(new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,key,"1","512","6000"),mapper);
        long start=System.nanoTime();
        failure(504,"ASSISTANT_PROVIDER_TIMEOUT",() -> shortDeadline.complete(prompt()));
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<2500);
    }

    @Test void invalidSettingsAndOversizedPromptNeverContactProvider() {
        List<LlmSettings> invalid=List.of(
                new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,"","20","512","6000"),
                new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,key,"oops","512","6000"),
                new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,key,"21","512","6000"),
                new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,key,"20","513","6000"),
                new LlmSettings("openai",base+"?query=x",LlmSettings.NVIDIA_MODEL,key,"20","512","6000"),
                new LlmSettings("openai","http://example.com/v1",LlmSettings.NVIDIA_MODEL,key,"20","512","6000"),
                new LlmSettings("openai","https://example.com:99999/v1",LlmSettings.NVIDIA_MODEL,key,"20","512","6000"),
                new LlmSettings("openai",base,"bad\nmodel",key,"20","512","6000"),
                new LlmSettings("openai",base,LlmSettings.NVIDIA_MODEL,"bad\r\nheader","20","512","6000"));
        for (var config:invalid) failure(503,"ASSISTANT_NOT_CONFIGURED",() -> new OpenAiChatProvider(config,mapper).complete(prompt()));
        failure(503,"ASSISTANT_PROVIDER_UNSUPPORTED",() -> new OpenAiChatProvider(
                new LlmSettings("anthropic",base,"model",key,"20","512","6000"),mapper).complete(prompt()));
        failure(422,"ASSISTANT_CONTEXT_TOO_LARGE",() -> provider().complete(
                new Prompt(List.of(new Message(Role.system,"Rules"),new Message(Role.user,"x".repeat(20001))))));
        failure(422,"ASSISTANT_CONTEXT_TOO_LARGE",() -> provider().complete(
                new Prompt(List.of(new Message(Role.system,"Rules"),new Message(Role.system,"Injected"),new Message(Role.user,"Question")))));
        failure(422,"ASSISTANT_CONTEXT_TOO_LARGE",() -> provider().complete(
                new Prompt(List.of(new Message(Role.system,"Rules"),new Message(Role.user,"\u0000".repeat(17000))))));
        assertEquals(0,calls.get());
    }

    @Test void byokAcceptsLengthFinishSnapshotPrefixReasoningTokensAndMapsErrors() throws Exception {
        var settings = settings();
        var userConfig = settings.resolveUserConnection(
                new LlmSettings.UserOverride("custom", base, "gpt-4o-mini", key), 64, true);
        assertTrue(userConfig.byok());

        // Accept finish_reason=length, snapshot model prefix, and prompt+completion <= total (reasoning_tokens)
        var root = mapper.createObjectNode();
        root.put("model", "gpt-4o-mini-2024-07-18");
        var choice = root.putArray("choices").addObject();
        choice.put("index", 0);
        choice.put("finish_reason", "length");
        choice.putObject("message").put("role", "assistant").put("content", "Hello!");
        root.putObject("usage").put("prompt_tokens", 10).put("completion_tokens", 5).put("total_tokens", 40);
        payload = root.toString();

        var testPrompt = new Prompt(List.of(new Message(Role.system, "Reply briefly."), new Message(Role.user, "hello")));
        Completion ok = provider().complete(testPrompt, userConfig);
        assertEquals("gpt-4o-mini-2024-07-18", ok.model());
        assertEquals("Hello!", ok.text());
        assertEquals(64, mapper.readTree(received).path("max_tokens").asInt());

        // Gemini models/ prefix is also accepted
        root.put("model", "models/gpt-4o-mini-001");
        payload = root.toString();
        assertEquals("models/gpt-4o-mini-001", provider().complete(testPrompt, userConfig).model());

        // Reject when prompt + completion > total even in BYOK
        ((ObjectNode) root.path("usage")).put("total_tokens", 14);
        payload = root.toString();
        failure(503, "ASSISTANT_PROVIDER_UNAVAILABLE", () -> provider().complete(testPrompt, userConfig));

        // Error mappings for BYOK: 400/404 -> 422 ASSISTANT_MODEL_INVALID, 401/403 -> 503 ASSISTANT_PROVIDER_AUTH_FAILED, 429 -> 429
        payload = "{\"error\":\"bad " + key + "\"}";
        for (int code : List.of(400, 404)) {
            status = code;
            failure(422, "ASSISTANT_MODEL_INVALID", () -> provider().complete(testPrompt, userConfig));
        }
        for (int code : List.of(401, 403)) {
            status = code;
            failure(503, "ASSISTANT_PROVIDER_AUTH_FAILED", () -> provider().complete(testPrompt, userConfig));
        }
        status = 429;
        failure(429, "ASSISTANT_RATE_LIMITED", () -> provider().complete(testPrompt, userConfig));

        // Timeout -> 504 ASSISTANT_PROVIDER_TIMEOUT
        status = 200;
        stall = true;
        payload = good().toString();
        var shortByok = new LlmSettings("openai", base, LlmSettings.NVIDIA_MODEL, "", "1", "512", "6000")
                .resolveUserConnection(new LlmSettings.UserOverride("custom", base, "gpt-4o-mini", key), 64, true);
        failure(504, "ASSISTANT_PROVIDER_TIMEOUT", () -> provider().complete(testPrompt, shortByok));
    }

    @Test void byokPresetsAndCustomUrlValidationEnforceSecurityRules() {
        var unconfigured = new LlmSettings("openai", "", "", "", "20", "512", "6000");
        assertEquals("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                unconfigured.resolveUserConnection(new LlmSettings.UserOverride("gemini", null, "gemini-2.5-flash", key), 64, true).endpoint().toString());
        assertEquals("https://api.openai.com/v1/chat/completions",
                unconfigured.resolveUserConnection(new LlmSettings.UserOverride("openai", "https://api.openai.com/v1/", "gpt-4o-mini", key), 64, true).endpoint().toString());
        assertEquals("https://integrate.api.nvidia.com/v1/chat/completions",
                unconfigured.resolveUserConnection(new LlmSettings.UserOverride("nvidia", "", "meta/llama-3.1-8b-instruct", key), 64, true).endpoint().toString());
        for (String validCustom : List.of(
                "https://llm.example.com/v1",
                "https://llm.example.com/proxy/v1beta/openai",
                "https://my-azure.openai.azure.com/openai",
                "http://127.0.0.1:11434/v1",
                "http://localhost:8080/v1",
                "http://[::1]:8000/v1")) {
            assertTrue(unconfigured.resolveUserConnection(new LlmSettings.UserOverride("custom", validCustom, "my-model", key), 64, true).byok());
        }
        for (var bad : List.of(
                new LlmSettings.UserOverride("unknown", null, "gpt-4o", key),
                new LlmSettings.UserOverride("gemini", "https://evil.example/v1", "gemini-2.5-flash", key),
                new LlmSettings.UserOverride("custom", "http://example.com/v1", "m", key),
                new LlmSettings.UserOverride("custom", "https://user" + ":pass@example.com/v1", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/v1?x=1", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/v1#frag", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/../v1", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/a//v1", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/%761", "m", key),
                new LlmSettings.UserOverride("custom", "https://example.com/other", "m", key),
                new LlmSettings.UserOverride("openai", null, "bad model", key),
                new LlmSettings.UserOverride("openai", null, "gpt-4o", "bad key"),
                new LlmSettings.UserOverride("openai", null, "gpt-4o", ""))) {
            var err = assertThrows(ApiFailure.class, () -> unconfigured.resolveUserConnection(bad, 64, true));
            assertEquals(422, err.status());
            assertEquals("VALIDATION_ERROR", err.code());
        }
    }
}
