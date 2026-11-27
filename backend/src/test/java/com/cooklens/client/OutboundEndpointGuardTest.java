package com.cooklens.client;

import com.cooklens.client.ChatProvider.Message;
import com.cooklens.client.ChatProvider.Prompt;
import com.cooklens.client.ChatProvider.Role;
import com.cooklens.config.LlmSettings;
import com.cooklens.config.OutboundEndpointGuard;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class OutboundEndpointGuardTest {
    private static final String TEST_KEY = "sk-test-" + UUID.randomUUID();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void blocksPrivateLoopbackLinkLocalCgnatReservedDocumentationIpv4MappedAndLocalHostnames() throws Exception {
        for (String host : List.of(
                "localhost",
                "LOCALHOST.",
                "api.localhost",
                "service.local",
                "metadata.google.internal",
                "db.internal",
                "vision",
                "recipes",
                "127.0.0.1",
                "127.255.255.254",
                "10.0.0.1",
                "10.255.255.1",
                "172.16.0.1",
                "172.31.255.254",
                "192.168.0.1",
                "192.168.1.10",
                "169.254.169.254",
                "169.254.0.1",
                "100.64.0.1",
                "100.127.255.254",
                "0.0.0.0",
                "0.1.2.3",
                "192.0.0.1",
                "192.0.2.1",
                "198.51.100.1",
                "203.0.113.1",
                "198.18.0.1",
                "198.19.255.254",
                "224.0.0.1",
                "240.0.0.1",
                "255.255.255.255",
                "0177.0.0.1",
                "0x7f.0.0.1",
                "127.1",
                "2130706433",
                "[::1]",
                "[::]",
                "[fc00::1]",
                "[fd12:3456::1]",
                "[fe80::1]",
                "[ff02::1]",
                "[2001:db8::1]",
                "[2002:7f00:1::1]",
                "[64:ff9b::127.0.0.1]",
                "[::ffff:127.0.0.1]",
                "[::ffff:10.0.0.1]",
                "[::ffff:169.254.169.254]",
                "[::ffff:100.64.0.1]",
                "[::ffff:7f00:1]")) {
            assertTrue(OutboundEndpointGuard.isBlockedHost(host), "Expected blocked host: " + host);
        }

        // Also validate raw 16-byte IPv4-mapped IPv6 Inet6Address directly
        byte[] mappedLoopback = new byte[]{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (byte) 0xFF, (byte) 0xFF, 127, 0, 0, 1};
        byte[] mappedPrivate = new byte[]{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (byte) 0xFF, (byte) 0xFF, 10, (byte) 255, (byte) 255, 1};
        byte[] mappedMetadata = new byte[]{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (byte) 0xFF, (byte) 0xFF, (byte) 169, (byte) 254, (byte) 169, (byte) 254};
        byte[] mappedPublic = new byte[]{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (byte) 0xFF, (byte) 0xFF, 93, (byte) 184, (byte) 216, 34};
        assertFalse(OutboundEndpointGuard.isPublicAddress(InetAddress.getByAddress(mappedLoopback)));
        assertFalse(OutboundEndpointGuard.isPublicAddress(InetAddress.getByAddress(mappedPrivate)));
        assertFalse(OutboundEndpointGuard.isPublicAddress(InetAddress.getByAddress(mappedMetadata)));
        assertTrue(OutboundEndpointGuard.isPublicAddress(InetAddress.getByAddress(mappedPublic)));

        for (String allowed : List.of(
                "api.openai.com",
                "llm.example.com",
                "93.184.216.34",
                "8.8.8.8",
                "1.1.1.1",
                "100.63.255.254",
                "100.128.0.1",
                "172.15.255.255",
                "172.32.0.1",
                "[2001:4860:4860::8888]",
                "[2606:4700:4700::1111]")) {
            assertFalse(OutboundEndpointGuard.isBlockedHost(allowed), "Expected allowed host: " + allowed);
        }
    }

    @Test
    void rejectsDnsFailureAndMixedPublicPrivateResolutionWithUniform503() throws Exception {
        InetAddress publicIp = InetAddress.getByAddress(new byte[]{93, (byte) 184, (byte) 216, 34});
        InetAddress loopback = InetAddress.getByAddress(new byte[]{127, 0, 0, 1});

        var mixedGuard = new OutboundEndpointGuard(host -> new InetAddress[]{publicIp, loopback});
        ApiFailure mixedErr = assertThrows(ApiFailure.class, () -> mixedGuard.resolvePinnedPublicAddress("dual.example.com"));
        assertEquals(503, mixedErr.status());
        assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", mixedErr.code());

        var nxGuard = new OutboundEndpointGuard(host -> { throw new UnknownHostException(host); });
        ApiFailure nxErr = assertThrows(ApiFailure.class, () -> nxGuard.resolvePinnedPublicAddress("missing.invalid"));
        assertEquals(503, nxErr.status());
        assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", nxErr.code());

        var publicGuard = new OutboundEndpointGuard(host -> new InetAddress[]{publicIp});
        assertEquals(publicIp, publicGuard.resolvePinnedPublicAddress("public.example.com"));
    }

    @Test
    void pinnedHttpsTransportPreservesSniVerifiesHostnameRefusesRedirectsAndBlocksDnsRebinding(@TempDir Path tempDir) throws Exception {
        Path keystorePath = tempDir.resolve("test-server.p12");
        char[] password = "changeit".toCharArray();
        Process keytool = new ProcessBuilder(
                "keytool", "-genkeypair",
                "-alias", "test",
                "-keyalg", "RSA",
                "-keysize", "2048",
                "-storetype", "PKCS12",
                "-keystore", keystorePath.toString(),
                "-storepass", new String(password),
                "-dname", "CN=byok-test.example",
                "-ext", "SAN=DNS:byok-test.example",
                "-validity", "1")
                .redirectErrorStream(true)
                .start();
        assertEquals(0, keytool.waitFor(), new String(keytool.getInputStream().readAllBytes(), StandardCharsets.UTF_8));

        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(keystorePath)) {
            ks.load(in, password);
        }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, password);
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);
        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);

        AtomicInteger serverCalls = new AtomicInteger();
        AtomicInteger responseStatus = new AtomicInteger(200);
        AtomicReference<String> receivedSni = new AtomicReference<>();

        HttpsServer server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(sslContext) {
            @Override
            public void configure(HttpsParameters params) {
                var engine = sslContext.createSSLEngine();
                var sslParams = sslContext.getDefaultSSLParameters();
                sslParams.setSNIMatchers(List.of(new javax.net.ssl.SNIMatcher(javax.net.ssl.StandardConstants.SNI_HOST_NAME) {
                    @Override
                    public boolean matches(javax.net.ssl.SNIServerName serverName) {
                        if (serverName instanceof SNIHostName hostName) {
                            receivedSni.set(hostName.getAsciiName());
                        }
                        return true;
                    }
                }));
                params.setNeedClientAuth(false);
                params.setCipherSuites(engine.getEnabledCipherSuites());
                params.setProtocols(engine.getEnabledProtocols());
                params.setSSLParameters(sslParams);
            }
        });
        var serverExecutor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(serverExecutor);
        server.createContext("/v1/chat/completions", exchange -> {
            try (exchange) {
                serverCalls.incrementAndGet();
                exchange.getRequestBody().readAllBytes();
                int st = responseStatus.get();
                if (st == 302) {
                    exchange.getResponseHeaders().set("Location", "https://169.254.169.254/latest/meta-data/");
                }
                byte[] body = """
                        {"model":"gpt-4o-mini","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Pinned OK"}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(st, body.length);
                exchange.getResponseBody().write(body);
            }
        });
        server.start();

        int port = server.getAddress().getPort();
        InetAddress publicIp = InetAddress.getByAddress(new byte[]{93, (byte) 184, (byte) 216, 34});
        InetAddress privateIp = InetAddress.getByAddress(new byte[]{127, 0, 0, 1});
        AtomicInteger dnsLookups = new AtomicInteger();
        AtomicReference<InetAddress> connectedIp = new AtomicReference<>();

        // DNS rebinding simulation: 1st lookup returns public IP, 2nd lookup returns loopback 127.0.0.1.
        OutboundEndpointGuard rebindGuard = new OutboundEndpointGuard(host -> {
            if (dnsLookups.incrementAndGet() == 1) {
                return new InetAddress[]{publicIp};
            }
            return new InetAddress[]{privateIp};
        });

        PinnedHttpsTransport transport = new PinnedHttpsTransport(
                rebindGuard,
                sslContext.getSocketFactory(),
                (pinned, targetPort, timeoutMs) -> {
                    connectedIp.set(pinned);
                    Socket s = new Socket(Proxy.NO_PROXY);
                    s.connect(new InetSocketAddress("127.0.0.1", port), timeoutMs);
                    return s;
                });

        try {
            LlmSettings settings = new LlmSettings("openai", "", "", "", "5", "512", "6000");
            OpenAiChatProvider provider = new OpenAiChatProvider(settings, mapper, transport);
            Prompt prompt = new Prompt(List.of(new Message(Role.system, "Rule"), new Message(Role.user, "hello")));

            // 1. Valid HTTPS request pins the validated public IP, sends TLS SNI, and verifies hostname.
            LlmSettings.Connection validConn = settings.resolveUserConnection(
                    new LlmSettings.UserOverride("custom", "https://byok-test.example:" + port + "/v1", "gpt-4o-mini", TEST_KEY), 64, true);
            var completion = provider.complete(prompt, validConn);
            assertEquals("Pinned OK", completion.text());
            assertEquals(publicIp, connectedIp.get());
            assertEquals("byok-test.example", receivedSni.get());
            assertEquals(1, serverCalls.get());

            // 2. Subsequent request after DNS rebinding to 127.0.0.1 is blocked BEFORE opening any socket!
            connectedIp.set(null);
            ApiFailure rebindError = assertThrows(ApiFailure.class, () -> provider.complete(prompt, validConn));
            assertEquals(503, rebindError.status());
            assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", rebindError.code());
            assertNull(connectedIp.get());
            assertEquals(1, serverCalls.get());

            // 3. Redirect (302 -> 169.254.169.254) is never followed and returns 503 ASSISTANT_PROVIDER_UNAVAILABLE.
            OutboundEndpointGuard staticPublicGuard = new OutboundEndpointGuard(host -> new InetAddress[]{publicIp});
            PinnedHttpsTransport redirectTransport = new PinnedHttpsTransport(
                    staticPublicGuard,
                    sslContext.getSocketFactory(),
                    (pinned, targetPort, timeoutMs) -> {
                        Socket s = new Socket(Proxy.NO_PROXY);
                        s.connect(new InetSocketAddress("127.0.0.1", port), timeoutMs);
                        return s;
                    });
            try {
                responseStatus.set(302);
                OpenAiChatProvider redirectProvider = new OpenAiChatProvider(settings, mapper, redirectTransport);
                ApiFailure redirectErr = assertThrows(ApiFailure.class, () -> redirectProvider.complete(prompt, validConn));
                assertEquals(503, redirectErr.status());
                assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", redirectErr.code());
                assertEquals(2, serverCalls.get());

                // 4. Hostname mismatch fails TLS HTTPS endpoint identification and returns 503.
                responseStatus.set(200);
                LlmSettings.Connection wrongHostConn = settings.resolveUserConnection(
                        new LlmSettings.UserOverride("custom", "https://wrong-host.example:" + port + "/v1", "gpt-4o-mini", TEST_KEY), 64, true);
                ApiFailure tlsErr = assertThrows(ApiFailure.class, () -> redirectProvider.complete(prompt, wrongHostConn));
                assertEquals(503, tlsErr.status());
                assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", tlsErr.code());
                assertEquals(2, serverCalls.get());
            } finally {
                redirectTransport.shutdown();
            }

            // 5. Connect timeout returns uniform 503 ASSISTANT_PROVIDER_UNAVAILABLE (not 504).
            PinnedHttpsTransport connectTimeoutTransport = new PinnedHttpsTransport(
                    staticPublicGuard,
                    sslContext.getSocketFactory(),
                    (pinned, targetPort, timeoutMs) -> { throw new SocketTimeoutException("connect timed out"); });
            try {
                OpenAiChatProvider timeoutProvider = new OpenAiChatProvider(settings, mapper, connectTimeoutTransport);
                LlmSettings.Connection conn = new LlmSettings.Connection(
                        URI.create("https://byok-test.example:" + port + "/v1/chat/completions"),
                        "gpt-4o-mini", TEST_KEY, Duration.ofSeconds(2), 64, 6000, true);
                ApiFailure connectErr = assertThrows(ApiFailure.class, () -> timeoutProvider.complete(prompt, conn));
                assertEquals(503, connectErr.status());
                assertEquals("ASSISTANT_PROVIDER_UNAVAILABLE", connectErr.code());
            } finally {
                connectTimeoutTransport.shutdown();
            }
        } finally {
            transport.shutdown();
            server.stop(0);
            serverExecutor.shutdownNow();
        }
    }
}
