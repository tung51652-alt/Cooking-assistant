package com.cooklens;

import com.cooklens.config.RuntimeContract;
import com.cooklens.config.LlmSettings;
import com.cooklens.config.OutboundEndpointGuard;
import com.cooklens.client.ByokTransport;
import com.cooklens.client.ChatProvider;
import com.cooklens.client.ChatProvider.Prompt;
import com.cooklens.client.PinnedHttpsTransport;
import com.cooklens.repository.*;
import com.cooklens.service.ChatPricing;
import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.test.context.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(AssistantChatIntegrationTest.Pricing.class)
class AssistantChatIntegrationTest {
    static final ObjectMapper JSON=new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    static final String KEY="test-"+UUID.randomUUID();
    static final HttpServer UPSTREAM;
    static final ExecutorService EXECUTOR=Executors.newVirtualThreadPerTaskExecutor();
    static final Path DIRECTORY;
    static final RuntimeContract CONTRACT;
    static final JsonNode RECIPES;
    static final AtomicInteger CALLS=new AtomicInteger();
    static final Queue<JsonNode> PROMPTS=new ConcurrentLinkedQueue<>();
    static volatile String mode="normal", lastAuthorization=null;
    static volatile CountDownLatch entered=new CountDownLatch(1), release=new CountDownLatch(1);
    static {
        try {
            DIRECTORY=Files.createTempDirectory("cooklens-chat-http-"); CONTRACT=new RuntimeContract(JSON);
            try (var file=AssistantChatIntegrationTest.class.getResourceAsStream("/corpus.json")) { RECIPES=JSON.readTree(file); }
            UPSTREAM=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            UPSTREAM.setExecutor(EXECUTOR); UPSTREAM.createContext("/",AssistantChatIntegrationTest::respond); UPSTREAM.start();
        } catch (Exception error) { throw new ExceptionInInitializerError(error); }
    }
    static final String BYOK_TEST_HOST = "byok-upstream.example";
    static final String BYOK_REDIRECT_HOST = "redirect-byok.example";
    static final String BYOK_UNREACHABLE_HOST = "unreachable-byok.example";
    static final String BYOK_REBIND_HOST = "rebind-byok.example";

    @TestConfiguration(proxyBeanMethods=false)
    static class Pricing {
        @Bean @Primary ChatPricing testPricing() {
            return new ChatPricing() {
                @Override public Quote quote(LlmSettings.Connection config, Prompt prompt) {
                    if (config.byok()) return super.quote(config, prompt);
                    return new Quote(1000,1_000_000,1_000_000);
                }
            };
        }

        @Bean @Primary ByokTransport testByokTransport() {
            var publicIp = new byte[]{93, (byte) 184, (byte) 216, 34};
            var guard = new OutboundEndpointGuard(host -> {
                if (BYOK_TEST_HOST.equals(host) || BYOK_REDIRECT_HOST.equals(host) || BYOK_UNREACHABLE_HOST.equals(host)) {
                    return new InetAddress[]{InetAddress.getByAddress(publicIp)};
                }
                if (BYOK_REBIND_HOST.equals(host)) {
                    return new InetAddress[]{InetAddress.getByAddress(new byte[]{127, 0, 0, 1})};
                }
                if (host.endsWith(".invalid")) {
                    throw new UnknownHostException(host);
                }
                return InetAddress.getAllByName(host);
            });
            var realTransport = new PinnedHttpsTransport(guard);
            var localHttp = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
                    .followRedirects(HttpClient.Redirect.NEVER).build();
            return (config, payload, remainingMs) -> {
                String host = config.endpoint().getHost();
                // Always enforce the real OutboundEndpointGuard (host, IP, DNS validation) first.
                guard.resolvePinnedPublicAddress(host);
                if (BYOK_UNREACHABLE_HOST.equals(host)) {
                    throw new ConnectException("Simulated unreachable public custom host");
                }
                if (BYOK_TEST_HOST.equals(host) || BYOK_REDIRECT_HOST.equals(host)) {
                    URI localTarget = URI.create("http://127.0.0.1:" + UPSTREAM.getAddress().getPort()
                            + (BYOK_REDIRECT_HOST.equals(host) ? "/v1/redirect-chat" : "/v1/chat/completions"));
                    var req = HttpRequest.newBuilder(localTarget).timeout(Duration.ofMillis(Math.max(1, remainingMs)))
                            .header("Authorization", "Bearer " + config.key())
                            .header("Content-Type", "application/json")
                            .header("Accept", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
                            .build();
                    var fut = localHttp.sendAsync(req, HttpResponse.BodyHandlers.ofByteArray());
                    try {
                        var resp = fut.get(remainingMs, TimeUnit.MILLISECONDS);
                        return new ByokTransport.Response(resp.statusCode(),
                                resp.headers().firstValue("content-type").orElse(""), resp.body());
                    } catch (TimeoutException e) {
                        fut.cancel(true);
                        throw new ChatProvider.Failure(504, "ASSISTANT_PROVIDER_TIMEOUT", ChatProvider.Usage.unknown());
                    } catch (InterruptedException e) {
                        fut.cancel(true);
                        Thread.currentThread().interrupt();
                        throw new ChatProvider.Failure(503, "ASSISTANT_PROVIDER_UNAVAILABLE", ChatProvider.Usage.unknown());
                    } catch (ExecutionException e) {
                        fut.cancel(true);
                        Throwable cause = e.getCause();
                        while (cause instanceof CompletionException) cause = cause.getCause();
                        if (cause instanceof HttpTimeoutException)
                            throw new ChatProvider.Failure(504, "ASSISTANT_PROVIDER_TIMEOUT", ChatProvider.Usage.unknown());
                        if (cause instanceof ConnectException connect) throw connect;
                        throw new ChatProvider.Failure(503, "ASSISTANT_PROVIDER_UNAVAILABLE", ChatProvider.Usage.unknown());
                    }
                }
                return realTransport.send(config, payload, remainingMs);
            };
        }
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
        String base="http://127.0.0.1:"+UPSTREAM.getAddress().getPort();
        properties.add("cooklens.vision-url",() -> base); properties.add("cooklens.recipes-url",() -> base);
        properties.add("cooklens.assistant-db-path",() -> DIRECTORY.resolve("assistant.sqlite").toString());
        properties.add("cooklens.llm.base-url",() -> base+"/v1"); properties.add("cooklens.llm.api-key",() -> KEY);
        properties.add("cooklens.llm.model",() -> LlmSettings.NVIDIA_MODEL);
        properties.add("cooklens.llm.timeout-seconds",() -> "2");
        properties.add("cooklens.cors-origins",() -> "http://localhost:5173");
    }
    @Autowired SessionStore store;
    @LocalServerPort int port;
    final HttpClient client=HttpClient.newHttpClient();
    @BeforeEach void reset() {
        mode="normal"; lastAuthorization=null; CALLS.set(0); PROMPTS.clear(); entered=new CountDownLatch(1); release=new CountDownLatch(1);
        store.transact(c -> { try (var st=c.createStatement()) {
            st.executeUpdate("DELETE FROM sessions"); st.executeUpdate("DELETE FROM llm_calls"); st.executeUpdate("DELETE FROM llm_budget_warnings");
        } return null; });
    }
    @AfterEach void unblock() { release.countDown(); }
    @AfterAll static void stop() throws Exception {
        release.countDown(); UPSTREAM.stop(0); EXECUTOR.shutdownNow();
        for (String file:List.of("assistant.sqlite-journal","assistant.sqlite-wal","assistant.sqlite-shm","assistant.sqlite")) Files.deleteIfExists(DIRECTORY.resolve(file));
        Files.deleteIfExists(DIRECTORY);
    }
    private static void respond(HttpExchange exchange) throws java.io.IOException {
        try (exchange) {
            String path=exchange.getRequestURI().getPath();
            JsonNode body;
            int status=200;
            if (path.equals("/v1/redirect-chat")) {
                CALLS.incrementAndGet();
                exchange.getRequestBody().readAllBytes();
                exchange.getResponseHeaders().set("Location", "http://127.0.0.1:" + UPSTREAM.getAddress().getPort() + "/v1/chat/completions");
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                byte[] redirectBody = "{}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(302, redirectBody.length);
                exchange.getResponseBody().write(redirectBody);
                return;
            } else if (path.equals("/v1/chat/completions")) {
                CALLS.incrementAndGet();
                lastAuthorization=exchange.getRequestHeaders().getFirst("Authorization");
                JsonNode reqBody=JSON.readTree(exchange.getRequestBody().readAllBytes());
                PROMPTS.add(reqBody);
                String selected=mode;
                if (selected.equals("hold") || selected.equals("stall")) {
                    entered.countDown();
                    try { release.await(4,TimeUnit.SECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); return; }
                }
                var result=JSON.createObjectNode();
                if (selected.equals("byok-snapshot")) {
                    result.put("model",reqBody.path("model").asText()+"-2026-01-01");
                    var choice=result.putArray("choices").addObject().put("index",0).put("finish_reason","length");
                    choice.putObject("message").put("role","assistant").put("content","Hello from BYOK!");
                    result.putObject("usage").put("prompt_tokens",12).put("completion_tokens",8).put("total_tokens",35);
                } else {
                    result.put("model",selected.equals("byok-echo") ? reqBody.path("model").asText() : LlmSettings.NVIDIA_MODEL);
                    var choice=result.putArray("choices").addObject().put("index",0).put("finish_reason","stop");
                    choice.putObject("message").put("role","assistant").put("content",selected.equals("blank") ? " " : "Theo công thức: giải thích bước tiếp, không tự chuyển bước.");
                    if (!selected.equals("no-usage")) result.putObject("usage").put("prompt_tokens",120).put("completion_tokens",30).put("total_tokens",150);
                }
                if (selected.equals("fail")) { status=500; result.put("error",KEY); }
                else if (selected.equals("auth-fail")) { status=401; result.put("error","invalid key "+KEY); }
                else if (selected.equals("model-invalid")) { status=404; result.put("error","unknown model"); }
                else if (selected.equals("rate-limit")) { status=429; result.put("error","too many requests"); }
                body=result;
            } else if (path.startsWith("/recipes/")) {
                var result=JSON.createObjectNode().put("corpus_version",CONTRACT.corpusVersion);
                JsonNode recipe=null;
                for (var value:RECIPES) if (value.path("id").asText().equals(path.substring("/recipes/".length()))) recipe=value;
                result.set("recipe",recipe); body=result;
            } else if (path.equals("/health/ready")) {
                body=JSON.valueToTree(Map.of("status","ready","model_version",CONTRACT.modelVersion,"taxonomy_version",CONTRACT.taxonomyVersion,
                        "corpus_version",CONTRACT.corpusVersion,"embedding_version",CONTRACT.embeddingVersion));
            } else { status=404; body=JSON.createObjectNode(); }
            byte[] bytes=JSON.writeValueAsBytes(body); exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(status,bytes.length); exchange.getResponseBody().write(bytes);
        } catch (java.io.IOException error) { /* Timeout tests deliberately cancel the provider transport. */ }
    }
    private String id() { return UUID.randomUUID().toString(); }
    private HttpRequest request(String path, Object body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(10)).header("X-Request-ID",id());
        return body==null ? builder.GET().build() : builder.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))).build();
    }
    private HttpResponse<String> send(String path, Object body) throws Exception { return client.send(request(path,body),HttpResponse.BodyHandlers.ofString()); }
    private JsonNode ok(HttpResponse<String> response) throws Exception {
        assertEquals(200,response.statusCode()); JsonNode body=JSON.readTree(response.body());
        assertEquals(body.path("request_id").asText(),response.headers().firstValue("X-Request-ID").orElseThrow());
        assertFalse(response.body().contains(KEY)); return body.path("session");
    }
    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertEquals(status,response.statusCode()); assertEquals(code,JSON.readTree(response.body()).path("code").asText()); assertFalse(response.body().contains(KEY));
    }
    private JsonNode create(int recipe) throws Exception {
        return ok(send("/api/assistant/sessions",Map.of("recipe_id",RECIPES.get(recipe).path("id").asText(),"corpus_version",CONTRACT.corpusVersion,"operation_id",id())));
    }
    private String route(JsonNode session) { return "/api/assistant/sessions/"+session.path("id").asText(); }
    private Map<String,Object> message(String text, long version, String operation) { return Map.of("text",text,"expected_version",version,"operation_id",operation); }
    private long scalar(String sql) {
        return store.transact(c -> { try (var st=c.createStatement(); var rows=st.executeQuery(sql)) { rows.next(); return rows.getLong(1); } });
    }

    @Test void chatCommandsAndRepliesShareStateAndReplayWithoutAnotherCall() throws Exception {
        JsonNode session=create(0); String operation=id();
        var start=message("  BẮT ĐẦU  ",0,operation);
        JsonNode started=ok(send(route(session)+"/messages",start));
        assertEquals(1,started.path("current_step").asInt()); assertEquals(0,CALLS.get());
        error(send(route(session)+"/actions",Map.of("action","start","expected_version",0,"operation_id",operation)),409,"OPERATION_CONFLICT");
        error(send(route(session)+"/messages",message("bắt đầu",0,operation)),409,"OPERATION_CONFLICT");
        var question=message("Giải thích bước tiếp trong công thức",1,id());
        var timed=send(route(session)+"/messages",question);
        String timing=timed.headers().firstValue("Server-Timing").orElseThrow();
        assertTrue(timing.matches("assistant_prepare;dur=[0-9.]+, assistant_provider;dur=[0-9.]+, assistant_persist;dur=[0-9.]+, assistant_total;dur=[0-9.]+"));
        JsonNode answered=ok(timed); assertEquals(2,answered.path("version").asInt());
        assertEquals(1,answered.path("current_step").asInt());
        assertEquals(2,answered.path("messages").size()); assertEquals(1,CALLS.get());
        JsonNode next=ok(send(route(session)+"/messages",message("bước tiếp",2,id())));
        assertEquals(3,next.path("version").asInt()); assertEquals(2,next.path("current_step").asInt());
        assertEquals(3,next.path("history").get(1).path("version").asInt());
        var replay=send(route(session)+"/messages",question);
        assertTrue(replay.headers().firstValue("Server-Timing").orElseThrow().contains("assistant_provider;dur=0.000"));
        assertEquals(next,ok(replay)); assertEquals(next,ok(send(route(session)+"/messages",start)));
        assertEquals(1,CALLS.get()); assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls")); assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
        var prompt=PROMPTS.peek(); String context=prompt.path("messages").get(1).path("content").asText();
        assertTrue(context.contains(session.path("recipe").path("id").asText())); assertFalse(context.contains(session.path("id").asText()));
        assertEquals(1,ok(send(route(session)+"/messages",message("bước trước",3,id()))).path("current_step").asInt());
        assertEquals(1,ok(send(route(session)+"/messages",message("nhắc lại",4,id()))).path("current_step").asInt());
        JsonNode finished=ok(send(route(session)+"/messages",message("kết thúc",5,id())));
        assertEquals("finished",finished.path("status").asText()); assertEquals(finished,ok(send(route(session)+"/messages",question)));
    }

    @Test void pendingReplyAllowsActionsAndLateReplyKeepsUsageButCannotChangeState() throws Exception {
        JsonNode session=create(0); var question=message("Giải thích bước hiện tại",0,id()); mode="hold";
        var pending=client.sendAsync(request(route(session)+"/messages",question),HttpResponse.BodyHandlers.ofString());
        try {
            assertTrue(entered.await(1,TimeUnit.SECONDS));
            error(send(route(session)+"/messages",question),409,"ASSISTANT_REQUEST_IN_PROGRESS");
            error(send(route(session)+"/messages",message("Câu khác",0,id())),409,"ASSISTANT_REQUEST_IN_PROGRESS");
            ok(send(route(session)+"/messages",message("bắt đầu",0,id())));
        } finally { release.countDown(); }
        error(pending.get(5,TimeUnit.SECONDS),409,"SESSION_VERSION_CONFLICT");
        JsonNode state=ok(send(route(session),null)); assertEquals(1,state.path("version").asInt()); assertEquals(0,state.path("messages").size());
        error(send(route(session)+"/messages",question),409,"SESSION_VERSION_CONFLICT");
        assertEquals(1,CALLS.get()); assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
    }

    @Test void failuresConsumeRateWindowAndReplaysAndCommandsRemainAvailable() throws Exception {
        JsonNode session=create(0); var original=message("Câu hỏi",0,id()); mode="fail";
        error(send(route(session)+"/messages",original),503,"ASSISTANT_PROVIDER_UNAVAILABLE");
        error(send(route(session)+"/messages",original),503,"ASSISTANT_PROVIDER_UNAVAILABLE");
        for (int i=1;i<12;i++) error(send(route(session)+"/messages",message("Câu hỏi "+i,0,id())),503,"ASSISTANT_PROVIDER_UNAVAILABLE");
        error(send(route(session)+"/messages",message("Vượt rate",0,id())),429,"ASSISTANT_RATE_LIMITED");
        assertEquals(12,CALLS.get()); assertEquals(12000,scalar("SELECT SUM(COALESCE(charged_micros,reserved_micros)) FROM llm_calls"));
        assertEquals(12,scalar("SELECT COUNT(*) FROM session_operations"));
        assertEquals(1,ok(send(route(session)+"/messages",message("bắt đầu",0,id()))).path("version").asInt());
        assertEquals(200,send("/api/health",null).statusCode());
    }

    @Test void rejectedAndUnknownUsageRepliesCannotEraseReservations() throws Exception {
        JsonNode session=create(0); mode="blank";
        error(send(route(session)+"/messages",message("Câu hỏi",0,id())),503,"ASSISTANT_PROVIDER_UNAVAILABLE");
        assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
        mode="no-usage"; JsonNode result=ok(send(route(session)+"/messages",message("Câu mới",0,id())));
        assertEquals(1,result.path("version").asInt());
        assertEquals(1150,scalar("SELECT SUM(COALESCE(charged_micros,reserved_micros)) FROM llm_calls"));
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls WHERE status='unknown' AND input_tokens IS NULL AND output_tokens IS NULL"));
    }

    @Test void budgetDenialDoesNotClaimOperationAndCleanupCannotEraseAccounting() throws Exception {
        JsonNode session=create(0); var question=message("Câu hỏi",0,id());
        store.transact(c -> { new ChatAdmission().reserve(c,id(),id(),"mock-model",new ChatPricing.Quote(9_999_001,0,0),System.currentTimeMillis()); return null; });
        error(send(route(session)+"/messages",question),503,"ASSISTANT_BUDGET_EXCEEDED");
        assertEquals(0,CALLS.get()); assertEquals(0,scalar("SELECT COUNT(*) FROM session_operations"));
        store.transact(c -> { try (var st=c.createStatement()) { st.executeUpdate("DELETE FROM llm_calls"); } return null; });
        ok(send(route(session)+"/messages",question)); assertEquals(1,CALLS.get());
        store.transact(c -> { try (var update=c.prepareStatement("UPDATE sessions SET expires_at=? WHERE id=?")) {
            update.setLong(1,System.currentTimeMillis()-Duration.ofDays(8).toMillis()); update.setString(2,session.path("id").asText()); update.executeUpdate();
        } return null; });
        create(1); error(send(route(session),null),404,"SESSION_NOT_FOUND");
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls")); assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
    }

    @Test void retainedExpiredPendingReturnsUnknownWithoutCallingProviderAgain() throws Exception {
        JsonNode session=create(0); String operation=id(), sessionId=session.path("id").asText();
        String text="Câu hỏi cũ"; long admitted=System.currentTimeMillis()-30000;
        store.transact(c -> {
            try (var insert=c.prepareStatement("""
                    INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,deadline,status)
                    VALUES (?,?,'message',?,0,?,?,'pending')
                    """)) {
                insert.setString(1,sessionId); insert.setString(2,operation); insert.setString(3,SessionOperations.fingerprint("message",text,0));
                insert.setLong(4,admitted); insert.setLong(5,admitted+25000); insert.executeUpdate();
            }
            new ChatAdmission().reserve(c,sessionId,operation,LlmSettings.NVIDIA_MODEL,new ChatPricing.Quote(1000,1_000_000,1_000_000),admitted);
            return null;
        });
        new SessionStore(DIRECTORY.resolve("assistant.sqlite").toString()).transact(c -> null);
        error(send(route(session)+"/messages",message(text,0,operation)),503,"ASSISTANT_OUTCOME_UNKNOWN");
        assertEquals(0,CALLS.get()); assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls WHERE status='unknown' AND charged_micros IS NULL"));
        assertEquals(0,ok(send(route(session),null)).path("version").asInt());
        ok(send(route(session)+"/messages",message("Câu mới",0,id()))); assertEquals(1,CALLS.get());
    }

    @Test void timeoutIsTerminalAndDoesNotAppendHalfConversation() throws Exception {
        JsonNode session=create(0); var question=message("Câu hỏi",0,id()); mode="stall";
        var failed=send(route(session)+"/messages",question);
        error(failed,504,"ASSISTANT_PROVIDER_TIMEOUT");
        String timing=failed.headers().firstValue("Server-Timing").orElseThrow();
        assertTrue(timing.contains("assistant_provider;dur="));
        assertFalse(timing.contains("assistant_provider;dur=0.000"));
        release.countDown();
        error(send(route(session)+"/messages",question),504,"ASSISTANT_PROVIDER_TIMEOUT"); assertEquals(1,CALLS.get());
        assertEquals(0,ok(send(route(session),null)).path("messages").size());
        assertEquals(1000,scalar("SELECT COALESCE(charged_micros,reserved_micros) FROM llm_calls"));
    }

    @Test void parallelSessionsKeepTheirOwnRecipeAndConversation() throws Exception {
        JsonNode first=create(0), second=create(1); mode="hold"; entered=new CountDownLatch(2);
        var one=client.sendAsync(request(route(first)+"/messages",message("Câu hỏi phiên một",0,id())),HttpResponse.BodyHandlers.ofString());
        var two=client.sendAsync(request(route(second)+"/messages",message("Câu hỏi phiên hai",0,id())),HttpResponse.BodyHandlers.ofString());
        try { assertTrue(entered.await(1,TimeUnit.SECONDS)); } finally { release.countDown(); }
        JsonNode firstReply=ok(one.get(5,TimeUnit.SECONDS)), secondReply=ok(two.get(5,TimeUnit.SECONDS));
        assertEquals(first.path("recipe"),firstReply.path("recipe")); assertEquals(second.path("recipe"),secondReply.path("recipe"));
        assertEquals("Câu hỏi phiên một",firstReply.path("messages").get(0).path("text").asText());
        assertEquals("Câu hỏi phiên hai",secondReply.path("messages").get(0).path("text").asText());
        var recipeIds=new HashSet<String>();
        for (var prompt:PROMPTS) {
            String context=prompt.path("messages").get(1).path("content").asText();
            recipeIds.add(JSON.readTree(context.substring(context.indexOf('{'))).path("recipe_id").asText());
        }
        assertEquals(Set.of(first.path("recipe").path("id").asText(),second.path("recipe").path("id").asText()),recipeIds);
        assertEquals(2,CALLS.get()); assertEquals(300,scalar("SELECT SUM(charged_micros) FROM llm_calls"));
    }

    @Test void sessionExpiryDuringProviderCallDiscardsReplyButKeepsUsage() throws Exception {
        JsonNode session=create(0); mode="hold";
        var pending=client.sendAsync(request(route(session)+"/messages",message("Câu hỏi",0,id())),HttpResponse.BodyHandlers.ofString());
        try {
            assertTrue(entered.await(1,TimeUnit.SECONDS));
            long created=System.currentTimeMillis()-Duration.ofHours(25).toMillis();
            store.transact(c -> { try (var update=c.prepareStatement("UPDATE sessions SET created_at=?,updated_at=?,expires_at=? WHERE id=?")) {
                update.setLong(1,created); update.setLong(2,created); update.setLong(3,created+Duration.ofHours(24).toMillis());
                update.setString(4,session.path("id").asText()); update.executeUpdate();
            } return null; });
        } finally { release.countDown(); }
        error(pending.get(5,TimeUnit.SECONDS),410,"SESSION_EXPIRED");
        assertEquals(0,scalar("SELECT COUNT(*) FROM session_chat_turns")); assertEquals(0,scalar("SELECT version FROM sessions"));
        assertEquals(150,scalar("SELECT charged_micros FROM llm_calls"));
    }

    @Test void openApiExposesChatRateLimitWithoutChangingExistingRoutes() throws Exception {
        var response=send("/v3/api-docs",null); assertEquals(200,response.statusCode());
        var schema=JSON.readTree(response.body()); assertEquals(10,schema.path("paths").size());
        assertTrue(schema.path("paths").path("/api/assistant/sessions/{id}/messages").path("post").path("responses").has("429"));
        assertTrue(schema.path("paths").path("/api/assistant/llm/test").path("post").path("responses").has("200"));
        Files.writeString(Path.of("target","phase10-openapi.json"),response.body(),StandardCharsets.UTF_8);
    }

    @Test void llmTestHelloValidatesInputsMapsUpstreamErrorsAndNeverPersistsKey() throws Exception {
        String byokKey="sk-test-"+UUID.randomUUID();
        String base="https://"+BYOK_TEST_HOST+"/v1";

        mode="byok-snapshot";
        var okResp=send("/api/assistant/llm/test",Map.of(
                "provider","custom","base_url",base,"model","gpt-4o-mini","api_key",byokKey));
        assertEquals(200,okResp.statusCode(),okResp.body());
        assertFalse(okResp.body().contains(byokKey));
        JsonNode okJson=JSON.readTree(okResp.body());
        assertEquals("1.0.0",okJson.path("api_version").asText());
        assertTrue(okJson.path("ok").asBoolean());
        assertEquals("custom",okJson.path("provider").asText());
        assertEquals("gpt-4o-mini-2026-01-01",okJson.path("model").asText());
        assertEquals("Hello from BYOK!",okJson.path("reply").asText());
        assertTrue(okJson.path("latency_ms").asLong()>=0);
        assertEquals("Bearer "+byokKey,lastAuthorization);
        JsonNode sentPrompt=PROMPTS.peek();
        assertEquals("hello",sentPrompt.path("messages").get(1).path("content").asText());
        assertTrue(sentPrompt.path("max_tokens").asInt()<=64);

        mode="auth-fail";
        var authResp=send("/api/assistant/llm/test",Map.of("provider","custom","base_url",base,"model","gpt-4o-mini","api_key",byokKey));
        error(authResp,503,"ASSISTANT_PROVIDER_AUTH_FAILED");
        assertFalse(authResp.body().contains(byokKey));

        mode="model-invalid";
        var modelResp=send("/api/assistant/llm/test",Map.of("provider","custom","base_url",base,"model","bad-model","api_key",byokKey));
        error(modelResp,422,"ASSISTANT_MODEL_INVALID");
        assertFalse(modelResp.body().contains(byokKey));

        mode="rate-limit";
        error(send("/api/assistant/llm/test",Map.of("provider","custom","base_url",base,"model","gpt-4o-mini","api_key",byokKey)),
                429,"ASSISTANT_RATE_LIMITED");

        mode="stall";
        error(send("/api/assistant/llm/test",Map.of("provider","custom","base_url",base,"model","gpt-4o-mini","api_key",byokKey)),
                504,"ASSISTANT_PROVIDER_TIMEOUT");
        release.countDown();

        int callsBeforeInvalid=CALLS.get();
        for (var badBody:List.of(
                Map.of("provider","unknown","base_url",base,"model","gpt-4o","api_key",byokKey),
                Map.of("provider","custom","base_url","http://example.com/v1","model","gpt-4o","api_key",byokKey),
                Map.of("provider","custom","base_url",base+"?q=1","model","gpt-4o","api_key",byokKey),
                Map.of("provider","custom","base_url",base,"model","bad model","api_key",byokKey),
                Map.of("provider","custom","base_url",base,"model","gpt-4o","api_key","bad key"))) {
            var badResp=send("/api/assistant/llm/test",badBody);
            error(badResp,422,"VALIDATION_ERROR");
            assertFalse(badResp.body().contains(byokKey));
        }
        assertEquals(callsBeforeInvalid,CALLS.get());
        assertEquals(0,scalar("SELECT COUNT(*) FROM sessions"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM session_operations"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM session_chat_turns"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM llm_calls"));
    }

    @Test void byokHeadersOverrideEnvFallbackAndNeverStoreApiKeyInSqliteOrResponse() throws Exception {
        String byokKey="sk-byok-"+UUID.randomUUID();
        String base="https://"+BYOK_TEST_HOST+"/v1";
        JsonNode session=create(0);

        // Exhaust server monthly budget to verify BYOK calls still work
        store.transact(c -> {
            new ChatAdmission().reserve(c,id(),id(),"server-model",new ChatPricing.Quote(10_000_000,0,0),System.currentTimeMillis());
            return null;
        });

        mode="byok-echo";
        var msgReq=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+route(session)+"/messages"))
                .timeout(Duration.ofSeconds(10))
                .header("X-Request-ID",id())
                .header("Content-Type","application/json")
                .header("X-LLM-Provider","custom")
                .header("X-LLM-Base-Url",base)
                .header("X-LLM-Model","custom-byok-model")
                .header("X-LLM-Api-Key",byokKey)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(message("Giải thích bước này",0,id()))))
                .build();
        var msgResp=client.send(msgReq,HttpResponse.BodyHandlers.ofString());
        JsonNode answered=ok(msgResp);
        assertEquals(1,answered.path("version").asInt());
        assertFalse(msgResp.body().contains(byokKey));
        assertEquals("Bearer "+byokKey,lastAuthorization);

        // Verify SQLite never contains the BYOK api key
        String dbDump=store.transact(c -> {
            var sb=new StringBuilder();
            for (String table:List.of("sessions","session_operations","session_chat_turns","llm_calls")) {
                try (var st=c.createStatement(); var rs=st.executeQuery("SELECT * FROM "+table)) {
                    int cols=rs.getMetaData().getColumnCount();
                    while (rs.next()) for (int i=1;i<=cols;i++) sb.append(rs.getObject(i)).append('|');
                }
            }
            return sb.toString();
        });
        assertFalse(dbDump.contains(byokKey));
        assertFalse(dbDump.contains(KEY));
        assertEquals(1,scalar("SELECT COUNT(*) FROM llm_calls WHERE model='custom-byok-model' AND reserved_micros=0 AND charged_micros=0"));

        // Invalid X-LLM-Api-Key header returns 422 VALIDATION_ERROR without mutating session
        var invalidKeyReq=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+route(session)+"/messages"))
                .timeout(Duration.ofSeconds(10))
                .header("X-Request-ID",id())
                .header("Content-Type","application/json")
                .header("X-LLM-Provider","openai")
                .header("X-LLM-Model","gpt-4o-mini")
                .header("X-LLM-Api-Key","invalid key with space")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(message("Câu hỏi lỗi",1,id()))))
                .build();
        error(client.send(invalidKeyReq,HttpResponse.BodyHandlers.ofString()),422,"VALIDATION_ERROR");
        assertEquals(1,ok(send(route(session),null)).path("version").asInt());

        // Without X-LLM-Api-Key, falls back to .env (and hits server budget cap)
        error(send(route(session)+"/messages",message("Fallback env",1,id())),503,"ASSISTANT_BUDGET_EXCEEDED");

        // Clear budget and verify fallback uses .env KEY
        store.transact(c -> { try (var st=c.createStatement()) { st.executeUpdate("DELETE FROM llm_calls"); } return null; });
        mode="normal";
        ok(send(route(session)+"/messages",message("Fallback env ok",1,id())));
        assertEquals("Bearer "+KEY,lastAuthorization);

        // Verify CORS allows X-LLM-* headers
        var corsReq=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/assistant/llm/test"))
                .header("Origin","http://localhost:5173")
                .header("Access-Control-Request-Method","POST")
                .header("Access-Control-Request-Headers","Content-Type,X-Request-ID,X-LLM-Provider,X-LLM-Base-Url,X-LLM-Model,X-LLM-Api-Key")
                .method("OPTIONS",HttpRequest.BodyPublishers.noBody())
                .build();
        var corsResp=client.send(corsReq,HttpResponse.BodyHandlers.ofString());
        assertEquals(200,corsResp.statusCode());
        String allowed=corsResp.headers().firstValue("Access-Control-Allow-Headers").orElse("").toLowerCase(Locale.ROOT);
        for (String h:List.of("x-llm-provider","x-llm-base-url","x-llm-model","x-llm-api-key")) {
            assertTrue(allowed.contains(h),"Missing allowed CORS header "+h+" in "+allowed);
        }
    }

    @Test void ssrfBlockedAndUnreachableCustomEndpointsReturnIdenticalErrorAcrossTestAndMessageRoutes() throws Exception {
        String byokKey = "sk-ssrf-" + UUID.randomUUID();
        JsonNode session = create(0);
        List<String> blockedOrUnreachableUrls = List.of(
                "https://10.255.255.1/v1",
                "https://169.254.169.254/v1",
                "http://localhost:8080/v1",
                "http://127.0.0.1:" + UPSTREAM.getAddress().getPort() + "/v1",
                "https://127.0.0.1/v1",
                "https://[::1]/v1",
                "https://[::ffff:127.0.0.1]/v1",
                "https://100.64.0.1/v1",
                "https://service.local/v1",
                "https://metadata.google.internal/v1",
                "https://" + BYOK_REBIND_HOST + "/v1",
                "https://nonexistent.invalid/v1",
                "https://" + BYOK_UNREACHABLE_HOST + "/v1");

        Set<String> observedMessages = new HashSet<>();
        for (String url : blockedOrUnreachableUrls) {
            var testResp = send("/api/assistant/llm/test", Map.of(
                    "provider", "custom", "base_url", url, "model", "gpt-4o-mini", "api_key", byokKey));
            error(testResp, 503, "ASSISTANT_PROVIDER_UNAVAILABLE");
            assertFalse(testResp.body().contains(byokKey));
            observedMessages.add(JSON.readTree(testResp.body()).path("message").asText());

            var msgReq = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + route(session) + "/messages"))
                    .timeout(Duration.ofSeconds(10))
                    .header("X-Request-ID", id())
                    .header("Content-Type", "application/json")
                    .header("X-LLM-Provider", "custom")
                    .header("X-LLM-Base-Url", url)
                    .header("X-LLM-Model", "gpt-4o-mini")
                    .header("X-LLM-Api-Key", byokKey)
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(message("Hỏi thử SSRF", 0, id()))))
                    .build();
            var msgResp = client.send(msgReq, HttpResponse.BodyHandlers.ofString());
            error(msgResp, 503, "ASSISTANT_PROVIDER_UNAVAILABLE");
            assertFalse(msgResp.body().contains(byokKey));
            observedMessages.add(JSON.readTree(msgResp.body()).path("message").asText());
        }
        // None of the blocked/DNS-failing/unreachable URLs may contact local UPSTREAM.
        assertEquals(0, CALLS.get());

        // A public custom host that returns 302 redirect to localhost must never be followed and returns the exact same 503.
        var redirectTestResp = send("/api/assistant/llm/test", Map.of(
                "provider", "custom", "base_url", "https://" + BYOK_REDIRECT_HOST + "/v1", "model", "gpt-4o-mini", "api_key", byokKey));
        error(redirectTestResp, 503, "ASSISTANT_PROVIDER_UNAVAILABLE");
        observedMessages.add(JSON.readTree(redirectTestResp.body()).path("message").asText());
        assertEquals(1, CALLS.get());

        // Every blocked, DNS-failing, unreachable, and redirecting response shares the exact same generic error message.
        assertEquals(1, observedMessages.size(), "Expected uniform error message, got: " + observedMessages);
        assertEquals(0, ok(send(route(session), null)).path("version").asInt());
    }
}
