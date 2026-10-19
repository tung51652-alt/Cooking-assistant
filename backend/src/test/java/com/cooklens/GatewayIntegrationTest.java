package com.cooklens;

import com.cooklens.config.RuntimeContract;
import com.cooklens.config.RequestGuard;
import com.cooklens.dto.ApiModels.*;
import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayIntegrationTest {
    static final HttpServer upstream;
    static volatile String mode = "normal";
    static volatile String receivedId, receivedSearch;
    static final AtomicInteger searches = new AtomicInteger(), healthCalls = new AtomicInteger();
    static volatile RuntimeContract contract;
    static volatile ObjectMapper json;
    static volatile JsonNode recipe, prediction;
    static {
        try {
            upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            upstream.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
            upstream.createContext("/", GatewayIntegrationTest::respond);
            upstream.start();
        } catch (IOException e) { throw new ExceptionInInitializerError(e); }
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        String base="http://127.0.0.1:"+upstream.getAddress().getPort();
        p.add("cooklens.vision-url", () -> base+"/"); p.add("cooklens.recipes-url", () -> base);
        p.add("cooklens.cors-origins", () -> "http://localhost:5173");
    }
    @Autowired ObjectMapper mapper;
    @Autowired RuntimeContract runtime;
    @LocalServerPort int port;
    final HttpClient client = HttpClient.newHttpClient();
    @BeforeEach void prepare() throws Exception {
        mode="normal"; json=mapper; contract=runtime; searches.set(0);
        try (var file=getClass().getResourceAsStream("/corpus.json")) {
            for (var r : mapper.readTree(file)) if (r.path("normalized_dish").asText().equals("pho")) { recipe=r; break; }
        }
        try (var file=getClass().getResourceAsStream("/vision-predict.json")) { prediction=mapper.readTree(file); }
    }
    @AfterAll static void stop() { upstream.stop(0); }
    HttpRequest.Builder request(String path) { return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(10)); }
    HttpResponse<String> send(HttpRequest request) throws Exception { return client.send(request, HttpResponse.BodyHandlers.ofString()); }
    HttpResponse<String> get(String path) throws Exception { return send(request(path).GET().build()); }
    HttpResponse<String> search(String body) throws Exception {
        return send(request("/api/recipes/search").header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build());
    }
    HttpResponse<String> image(byte[] file, String mime, String extra) throws Exception {
        var out=new ByteArrayOutputStream();
        out.write(("--testboundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.png\"\r\nContent-Type: "+mime+"\r\n\r\n").getBytes());
        out.write(file); out.write(("\r\n"+extra+"--testboundary--\r\n").getBytes());
        return send(request("/api/vision/predict").header("Content-Type","multipart/form-data; boundary=testboundary")
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build());
    }
    JsonNode body(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertEquals(status,response.statusCode(),response.body()); var b=body(response);
        assertEquals(code,b.path("code").asText()); assertEquals("1.0.0",b.path("api_version").asText());
        assertEquals(response.headers().firstValue("X-Request-ID").orElseThrow(),b.path("request_id").asText());
        assertDoesNotThrow(() -> UUID.fromString(b.path("request_id").asText()));
        assertFalse(response.body().contains("provider-private-detail"));
    }
    @Test void catalogAndRequestIdAreCheckedAndForwarded() throws Exception {
        String id=UUID.randomUUID().toString();
        var r=send(request("/api/dishes").header("X-Request-ID",id).GET().build());
        assertEquals(200,r.statusCode()); assertEquals(30,body(r).path("dishes").size());
        assertEquals(id,receivedId); assertEquals(id,body(r).path("request_id").asText());
        r=send(request("/api/dishes").header("X-Request-ID","invalid-header").GET().build());
        assertNotEquals("invalid-header",r.headers().firstValue("X-Request-ID").orElseThrow());
    }
    @Test void predictionPreservesFullTopThreeAndVersions() throws Exception {
        var r=image(new byte[]{1,2,3},"image/png",""); assertEquals(200,r.statusCode(),r.body());
        assertEquals(prediction.path("predictions"),body(r).path("predictions"));
        assertEquals(body(r).path("request_id").asText(),receivedId);
    }
    @Test void searchKeepsConfirmedDishAndNormalizesQuery() throws Exception {
        var r=search("{\"confirmed_dish\":\"pho\",\"query\":\"  phở  \"}");
        assertEquals(200,r.statusCode(),r.body());
        assertEquals("pho",body(r).path("confirmed_dish").asText());
        var sent=mapper.readTree(receivedSearch); assertEquals(3,sent.path("top_k").asInt());
        assertEquals("phở",sent.path("query").asText());
        assertEquals("pho",body(r).path("recipes").get(0).path("normalized_dish").asText());
    }
    @Test void strictSearchValidationRejectsCoercionAndUnknownDish() throws Exception {
        error(search("{\"confirmed_dish\":\"pizza\"}"),422,"INVALID_DISH");
        for (String top:List.of("true","1.0","\"2\"","null","0","4","999999999999"))
            error(search("{\"confirmed_dish\":\"pho\",\"top_k\":"+top+"}"),422,"VALIDATION_ERROR");
        for (String invalid:List.of("[]","null","{", "{\"confirmed_dish\":3}","{\"confirmed_dish\":\"pho\",\"query\":false}",
                "{\"confirmed_dish\":\"pho\",\"query\":\""+"a".repeat(201)+"\"}")) error(search(invalid),422,"VALIDATION_ERROR");
        assertEquals(0,searches.get());
        assertEquals(200,search("{\"confirmed_dish\":\"pho\",\"query\":\"   \"}").statusCode());
    }
    @Test void multipartIsSingleFileBoundedAndMemoryOnly() throws Exception {
        error(image(new byte[]{1},"image/webp",""),415,"UNSUPPORTED_MEDIA_TYPE");
        error(image(new byte[]{1},"image/png","--testboundary\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nextra\r\n"),422,"VALIDATION_ERROR");
        error(image(new byte[RequestGuard.MAX_FILE+1],"image/png",""),413,"UPLOAD_TOO_LARGE");
    }
    @Test void chunkedBodiesAndWrongMediaAreRejected() throws Exception {
        var publisher=HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(new byte[9000]));
        error(send(request("/api/recipes/search").header("Content-Type","application/json").POST(publisher).build()),413,"UPLOAD_TOO_LARGE");
        error(send(request("/api/vision/predict").header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build()),415,"UNSUPPORTED_MEDIA_TYPE");
    }
    @Test void rejectsIncompatibleVersionsMalformedAndCrossDishResults() throws Exception {
        for (String failure:List.of("version","malformed","oversized","crossdish","unsafe-url")) {
            mode=failure; error(search("{\"confirmed_dish\":\"pho\"}"),503,"DEPENDENCY_NOT_READY");
        }
        mode="version"; error(image(new byte[]{1},"image/png",""),503,"DEPENDENCY_NOT_READY");
    }
    @Test void dependencyErrorsAreSanitizedAndTyped() throws Exception {
        mode="unavailable"; error(search("{\"confirmed_dish\":\"pho\"}"),503,"DEPENDENCY_NOT_READY");
        mode="invalid-image"; error(image(new byte[]{1},"image/png",""),400,"INVALID_IMAGE");
        mode="busy"; error(image(new byte[]{1},"image/png",""),503,"SERVICE_BUSY");
        mode="empty"; var r=search("{\"confirmed_dish\":\"pho\"}"); assertEquals(200,r.statusCode()); assertTrue(body(r).path("recipes").isEmpty());
    }
    @Test void timeoutsAreBoundedAndNeverRetried() throws Exception {
        mode="slow"; long start=System.nanoTime();
        error(search("{\"confirmed_dish\":\"pho\"}"),504,"DEPENDENCY_TIMEOUT");
        assertTrue(Duration.ofNanos(System.nanoTime()-start).toMillis()<6500); assertEquals(1,searches.get());
    }
    @Test void healthChecksBothVersionsWithinDeadlineAndLivenessSurvives() throws Exception {
        Thread.sleep(1100); mode="normal"; var r=get("/api/health"); assertEquals(200,r.statusCode(),r.body());
        int before=healthCalls.get(); r=get("/api/health"); assertEquals(before,healthCalls.get());
        assertEquals(r.headers().firstValue("X-Request-ID").orElseThrow(),body(r).path("request_id").asText());
        Thread.sleep(1100); mode="version"; assertEquals(503,get("/api/health").statusCode());
        assertEquals(200,get("/actuator/health/liveness").statusCode()); assertEquals(503,get("/actuator/health/readiness").statusCode());
        Thread.sleep(1100); mode="slow-health"; long start=System.nanoTime();
        assertEquals(503,get("/api/health").statusCode()); assertTrue(Duration.ofNanos(System.nanoTime()-start).toMillis()<2000);
    }
    @Test void overloadDuringSlowUploadDoesNotBlockHealthAndSlotsRecover() throws Exception {
        var sockets=new ArrayList<Socket>();
        try {
            for (int i=0;i<4;i++) {
                var socket=new Socket("127.0.0.1",port); sockets.add(socket);
                socket.getOutputStream().write(("POST /api/vision/predict HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\nContent-Type: multipart/form-data; boundary=b\r\n\r\n1\r\nx\r\n").getBytes());
                socket.getOutputStream().flush();
            }
            Thread.sleep(150);
            error(search("{\"confirmed_dish\":\"pho\"}"),503,"SERVICE_BUSY");
            assertEquals(200,get("/actuator/health/liveness").statusCode());
        } finally { for (var socket:sockets) socket.close(); }
        for(int i=0;i<30;i++) { if(get("/api/dishes").statusCode()==200) return; Thread.sleep(50); }
        fail("Disconnected uploads did not release work slots");
    }
    @Test void stalledChunkedBodyHasTotalReceiveDeadline() throws Exception {
        try (var socket=new Socket("127.0.0.1",port)) {
            socket.setSoTimeout(6500);
            socket.getOutputStream().write(("POST /api/recipes/search HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n1\r\n{\r\n").getBytes());
            socket.getOutputStream().flush();
            String status=new BufferedReader(new InputStreamReader(socket.getInputStream())).readLine();
            assertNotNull(status); assertTrue(status.contains("504"),status);
        }
        assertEquals(200,search("{\"confirmed_dish\":\"pho\"}").statusCode());
    }
    @Test void detailsOpenApiAndCorsFollowPublicContract() throws Exception {
        var r=get("/api/recipes/"+recipe.path("id").asText()); assertEquals(200,r.statusCode(),r.body());
        assertEquals(recipe,body(r).path("recipe"));
        error(get("/api/recipes/INVALID"),422,"VALIDATION_ERROR");
        mode="missing"; error(get("/api/recipes/missing"),404,"RECIPE_NOT_FOUND"); mode="normal";
        var spec=body(get("/v3/api-docs")); assertEquals("1.0.0",spec.path("info").path("version").asText());
        assertEquals(5,spec.path("paths").size());
        r=send(request("/api/dishes").header("Origin","http://localhost:5173").GET().build());
        assertEquals("http://localhost:5173",r.headers().firstValue("Access-Control-Allow-Origin").orElseThrow());
        r=send(request("/api/dishes").header("Origin","https://untrusted.example").GET().build());
        assertTrue(r.headers().firstValue("Access-Control-Allow-Origin").isEmpty());
    }
    static void respond(HttpExchange exchange) throws IOException {
        try {
            String path=exchange.getRequestURI().getPath(); String current=mode;
            receivedId=exchange.getRequestHeaders().getFirst("X-Request-ID");
            String payload=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            if(path.equals("/search")) { receivedSearch=payload; searches.incrementAndGet(); }
            if(path.equals("/health/ready")) healthCalls.incrementAndGet();
            if(current.equals("slow") && path.equals("/search")) Thread.sleep(5600);
            if(current.equals("slow-health") && path.equals("/health/ready")) Thread.sleep(2400);
            Object result; int status=200;
            if(current.equals("unavailable")) { status=500; result=Map.of("detail","provider-private-detail"); }
            else if(current.equals("invalid-image")) { status=400; result=Map.of("code","INVALID_IMAGE","message","provider-private-detail"); }
            else if(current.equals("busy")) { status=503; result=Map.of("code","SERVICE_BUSY"); }
            else if(current.equals("missing")) { status=404; result=Map.of("code","RECIPE_NOT_FOUND"); }
            else if(path.equals("/health/ready")) result=Map.of("status","ready","model_version",current.equals("version")?"wrong":contract.modelVersion,
                    "taxonomy_version",contract.taxonomyVersion,"embedding_version",contract.embeddingVersion,
                    "corpus_version",current.equals("version")?"wrong":contract.corpusVersion);
            else if(path.equals("/predict")) {
                var p=prediction.deepCopy(); if(current.equals("version")) ((com.fasterxml.jackson.databind.node.ObjectNode)p).put("model_version","wrong"); result=p;
            } else if(path.equals("/dishes")) result=new DishesResult(contract.taxonomyVersion,contract.dishes);
            else if(path.startsWith("/recipes/")) result=Map.of("corpus_version",contract.corpusVersion,"recipe",recipe);
            else {
                var r=(com.fasterxml.jackson.databind.node.ObjectNode)recipe.deepCopy(); r.remove(List.of("ingredients","instructions","tags","created_at","updated_at"));
                r.put("preview","Nấu nước dùng"); r.put("rank",1); r.put("retrieval_score",.8);
                if(current.equals("crossdish")) r.put("normalized_dish","banh_mi");
                if(current.equals("unsafe-url")) ((com.fasterxml.jackson.databind.node.ObjectNode)r.path("source")).put("url","javascript:alert(1)");
                result=Map.of("corpus_version",current.equals("version")?"wrong":contract.corpusVersion,"taxonomy_version",contract.taxonomyVersion,
                        "embedding_version",contract.embeddingVersion,"confirmed_dish","pho","recipes",current.equals("empty")?List.of():List.of(r));
            }
            byte[] output=current.equals("malformed")?"{broken".getBytes():current.equals("oversized")?new byte[1024*1024+1]:json.writeValueAsBytes(result);
            exchange.getResponseHeaders().set("Content-Type","application/json"); exchange.sendResponseHeaders(status,output.length);
            exchange.getResponseBody().write(output);
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        finally { exchange.close(); }
    }
}
