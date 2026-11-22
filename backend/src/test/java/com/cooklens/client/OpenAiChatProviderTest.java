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

    @Test void mapsHttpErrorsWithoutRetryOrLeakingProviderBody() {
        var provider=provider(); payload="provider body containing "+key;
        for (int code:List.of(401,403,429,402,500,503,404,422,202,302)) {
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
    }

    @Test void preservesUnknownAndPartialUsageWithoutInventingZero() {
        var provider=provider(); var missing=good(); missing.remove("usage"); payload=missing.toString();
        assertEquals(Usage.unknown(),provider.complete(prompt()).usage());
        var partial=good(); ((ObjectNode)partial.path("usage")).remove(List.of("completion_tokens","total_tokens")); payload=partial.toString();
        assertEquals(new Usage(120L,null),provider.complete(prompt()).usage());
    }

    @Test void rejectsEmptyTruncatedToolOrWrongModelRepliesButRetainsUsage() {
        var provider=provider();
        for (String mode:List.of("blank","length","tools","role","model","output-limit")) {
            var root=good(); var choice=(ObjectNode)root.path("choices").get(0); var message=(ObjectNode)choice.path("message");
            switch (mode) {
                case "blank" -> message.put("content"," ");
                case "length" -> choice.put("finish_reason","length");
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
        for (String mode:List.of("negative","string","float","overflow","wrong-total","array","duplicate","trailing","bad-json")) {
            var root=good(); var usage=(ObjectNode)root.path("usage");
            switch (mode) {
                case "negative" -> usage.put("prompt_tokens",-1);
                case "string" -> usage.put("completion_tokens","30");
                case "float" -> usage.put("completion_tokens",1.5);
                case "overflow" -> usage.put("total_tokens",new java.math.BigInteger("18446744073709551616"));
                case "wrong-total" -> usage.put("total_tokens",999);
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
}
