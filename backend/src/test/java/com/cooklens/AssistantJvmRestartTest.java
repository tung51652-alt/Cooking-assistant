package com.cooklens;

import static org.junit.jupiter.api.Assertions.*;

import com.cooklens.config.*;
import com.cooklens.repository.*;
import com.cooklens.service.ChatPricing.Quote;
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
import org.junit.jupiter.api.io.TempDir;

class AssistantJvmRestartTest {
    @TempDir Path directory;
    private final ObjectMapper mapper =
            new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private final String key = "test-" + UUID.randomUUID();
    private final AtomicInteger calls = new AtomicInteger();
    private final List<Path> logs = new ArrayList<>();
    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    private RuntimeContract contract;
    private JsonNode recipe;
    private HttpServer upstream;
    private ExecutorService executor;
    private Process process;
    private int port;
    private volatile boolean fail;

    @BeforeEach
    void initialize() throws Exception {
        contract = new RuntimeContract(mapper);
        try (var file = getClass().getResourceAsStream("/corpus.json")) {
            recipe = mapper.readTree(file).get(0);
        }
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        upstream.setExecutor(executor);
        upstream.createContext("/", this::respond);
        upstream.start();
        try (var socket = new java.net.ServerSocket(0)) {
            port = socket.getLocalPort();
        }
    }

    @AfterEach
    void cleanup() throws Exception {
        stop();
        upstream.stop(0);
        executor.shutdownNow();
    }

    private void respond(HttpExchange exchange) throws java.io.IOException {
        try (exchange) {
            int status = 200;
            JsonNode result;
            if (exchange.getRequestURI().getPath().equals("/v1/chat/completions")) {
                exchange.getRequestBody().readAllBytes();
                calls.incrementAndGet();
                var body = mapper.createObjectNode().put("model", LlmSettings.NVIDIA_MODEL);
                body.putArray("choices")
                        .addObject()
                        .put("index", 0)
                        .put("finish_reason", "stop")
                        .putObject("message")
                        .put("role", "assistant")
                        .put("content", "Theo công thức: làm bước hiện tại.");
                body.putObject("usage")
                        .put("prompt_tokens", 120)
                        .put("completion_tokens", 30)
                        .put("total_tokens", 150);
                result = body;
                if (fail) status = 503;
            } else if (exchange.getRequestURI().getPath().startsWith("/recipes/")) {
                var body = mapper.createObjectNode().put("corpus_version", contract.corpusVersion);
                body.set("recipe", recipe);
                result = body;
            } else
                result =
                        mapper.valueToTree(
                                Map.of(
                                        "status",
                                        "ready",
                                        "model_version",
                                        contract.modelVersion,
                                        "taxonomy_version",
                                        contract.taxonomyVersion,
                                        "corpus_version",
                                        contract.corpusVersion,
                                        "embedding_version",
                                        contract.embeddingVersion));
            byte[] bytes = mapper.writeValueAsBytes(result);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        }
    }

    private void start() throws Exception {
        String java =
                Path.of(
                                System.getProperty("java.home"),
                                "bin",
                                System.getProperty("os.name").startsWith("Windows")
                                        ? "java.exe"
                                        : "java")
                        .toString();
        String classpath =
                System.getProperty(
                                "surefire.test.class.path", System.getProperty("java.class.path"))
                        .replace('\\', '/');
        Path arguments = directory.resolve("child.args");
        Files.writeString(
                arguments,
                "-Xmx256m\n-cp\n\""
                        + classpath
                        + "\"\ncom.cooklens.AssistantJvmFixture\n--server.port="
                        + port
                        + "\n"
                        + "--server.address=127.0.0.1\n"
                        + "--logging.level.root=WARN\n"
                        + "--spring.main.banner-mode=off\n",
                StandardCharsets.UTF_8);
        Path log = directory.resolve("child-" + logs.size() + ".log");
        logs.add(log);
        var builder =
                new ProcessBuilder(java, "@" + arguments)
                        .redirectErrorStream(true)
                        .redirectOutput(log.toFile());
        String base = "http://127.0.0.1:" + upstream.getAddress().getPort();
        builder.environment()
                .putAll(
                        Map.of(
                                "VISION_URL",
                                base,
                                "RECIPES_URL",
                                base,
                                "ASSISTANT_DB_PATH",
                                directory.resolve("assistant.sqlite").toString(),
                                "LLM_PROVIDER",
                                "openai",
                                "LLM_BASE_URL",
                                base + "/v1",
                                "LLM_MODEL",
                                LlmSettings.NVIDIA_MODEL,
                                "LLM_API_KEY",
                                key,
                                "LLM_TIMEOUT_SECONDS",
                                "2",
                                "LLM_MAX_OUTPUT_TOKENS",
                                "512",
                                "LLM_MAX_INPUT_TOKENS",
                                "6000"));
        builder.environment().remove("JAVA_TOOL_OPTIONS");
        builder.environment().remove("JDK_JAVA_OPTIONS");
        process = builder.start();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        while (System.nanoTime() < deadline && process.isAlive()) {
            try {
                if (send("/api/health", null).statusCode() == 200) return;
            } catch (java.io.IOException ignored) {
                /* Wait for startup. */
            }
            Thread.sleep(100);
        }
        fail("Child JVM did not become ready: " + Files.readString(log).replace(key, "[redacted]"));
    }

    private void stop() throws Exception {
        if (process != null && process.isAlive()) {
            process.destroy();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                assertTrue(process.waitFor(5, TimeUnit.SECONDS));
            }
        }
    }

    private HttpResponse<String> send(String path, Object body) throws Exception {
        var builder =
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                        .timeout(Duration.ofSeconds(5));
        var request =
                body == null
                        ? builder.GET().build()
                        : builder.header("Content-Type", "application/json")
                                .POST(
                                        HttpRequest.BodyPublishers.ofString(
                                                mapper.writeValueAsString(body)))
                                .build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode session(HttpResponse<String> response) throws Exception {
        assertEquals(200, response.statusCode());
        return mapper.readTree(response.body()).path("session");
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertEquals(status, response.statusCode());
        assertEquals(code, mapper.readTree(response.body()).path("code").asText());
    }

    private String id() {
        return UUID.randomUUID().toString();
    }

    private Map<String, Object> question(String text, long version, String operation) {
        return Map.of("text", text, "expected_version", version, "operation_id", operation);
    }

    private JsonNode create() throws Exception {
        return session(
                send(
                        "/api/assistant/sessions",
                        Map.of(
                                "recipe_id",
                                recipe.path("id").asText(),
                                "corpus_version",
                                contract.corpusVersion,
                                "operation_id",
                                id())));
    }

    private SessionStore store() {
        return new SessionStore(directory.resolve("assistant.sqlite").toString());
    }

    private long scalar(String sql) {
        return store().transact(
                        c -> {
                            try (var statement = c.createStatement();
                                    var row = statement.executeQuery(sql)) {
                                row.next();
                                return row.getLong(1);
                            }
                        });
    }

    @Test
    void realJvmRestartsKeepConversationDedupUnknownOutcomeRateAndBudget() throws Exception {
        start();
        long firstPid = process.pid();
        JsonNode created = create();
        String sessionId = created.path("id").asText(),
                route = "/api/assistant/sessions/" + sessionId;
        var original = question("Giải thích bước hiện tại", 0, id());
        JsonNode answered = session(send(route + "/messages", original));
        assertEquals(1, answered.path("version").asInt());
        String orphan = id(), text = "Câu hỏi đang chờ";
        long admitted = System.currentTimeMillis() - 30000;
        store().transact(
                        c -> {
                            try (var insert =
                                    c.prepareStatement(
                                            """
INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,deadline,status)
VALUES (?,?,'message',?,1,?,?,'pending')
""")) {
                                insert.setString(1, sessionId);
                                insert.setString(2, orphan);
                                insert.setString(
                                        3, SessionOperations.fingerprint("message", text, 1));
                                insert.setLong(4, admitted);
                                insert.setLong(5, admitted + 25000);
                                insert.executeUpdate();
                            }
                            new ChatAdmission()
                                    .reserve(
                                            c,
                                            sessionId,
                                            orphan,
                                            LlmSettings.NVIDIA_MODEL,
                                            new Quote(1000, 1_000_000, 1_000_000),
                                            admitted);
                            return null;
                        });
        stop();
        start();
        assertNotEquals(firstPid, process.pid());
        assertEquals(answered, session(send(route, null)));
        assertEquals(answered, session(send(route + "/messages", original)));
        error(
                send(route + "/messages", question(text, 1, orphan)),
                503,
                "ASSISTANT_OUTCOME_UNKNOWN");
        assertEquals(1, calls.get());
        assertEquals(
                1150,
                scalar("SELECT SUM(COALESCE(charged_micros,reserved_micros)) FROM llm_calls"));
        JsonNode twice = session(send(route + "/messages", question("Câu hỏi mới", 1, id())));
        assertEquals(2, twice.path("version").asInt());
        fail = true;
        for (int i = 0; i < 9; i++)
            error(
                    send(route + "/messages", question("Câu hỏi lỗi " + i, 2, id())),
                    503,
                    "ASSISTANT_PROVIDER_UNAVAILABLE");
        assertEquals(200, send("/api/health", null).statusCode());
        assertEquals(twice, session(send(route, null)));
        // Put the persisted rate fixture wholly inside the next JVM's 60-second window.
        store().transact(
                        c -> {
                            try (var update =
                                    c.prepareStatement("UPDATE llm_calls SET admitted_at=?")) {
                                update.setLong(1, System.currentTimeMillis());
                                update.executeUpdate();
                            }
                            return null;
                        });
        stop();
        start();
        error(
                send(route + "/messages", question("Vượt rate sau restart", 2, id())),
                429,
                "ASSISTANT_RATE_LIMITED");
        // Each of the 9 HTTP 503 turns retries once upstream (20 calls total) without adding extra
        // ledger/rate entries (12 rows).
        assertEquals(20, calls.get());
        assertEquals(12, scalar("SELECT COUNT(*) FROM llm_calls"));
        assertEquals(
                "finished",
                session(send(route + "/messages", question("kết thúc", 2, id())))
                        .path("status")
                        .asText());
        long remaining =
                10_000_000
                        - scalar(
                                "SELECT SUM(COALESCE(charged_micros,reserved_micros)) FROM"
                                        + " llm_calls");
        store().transact(
                        c -> {
                            new ChatAdmission()
                                    .reserve(
                                            c,
                                            id(),
                                            id(),
                                            "mock-budget",
                                            new Quote(remaining, 0, 0),
                                            System.currentTimeMillis());
                            return null;
                        });
        stop();
        start();
        JsonNode fresh = create();
        error(
                send(
                        "/api/assistant/sessions/" + fresh.path("id").asText() + "/messages",
                        question("Hết ngân sách", 0, id())),
                503,
                "ASSISTANT_BUDGET_EXCEEDED");
        assertEquals(1, scalar("SELECT COUNT(*) FROM llm_budget_warnings"));
        assertEquals(20, calls.get());
        assertEquals(200, send("/api/health", null).statusCode());
        stop();
        for (var log : logs) assertFalse(Files.readString(log).contains(key));
    }
}
