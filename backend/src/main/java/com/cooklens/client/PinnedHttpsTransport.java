package com.cooklens.client;

import com.cooklens.config.LlmSettings;
import com.cooklens.config.OutboundEndpointGuard;
import jakarta.annotation.PreDestroy;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.channels.SocketChannel;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.HandshakeCompletedListener;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class PinnedHttpsTransport implements ByokTransport {
    private static final int MAX_BODY_BYTES = 1024 * 1024;
    private static final long CONNECT_TIMEOUT_MS = 2_000;

    @FunctionalInterface
    interface TcpConnector {
        Socket connect(InetAddress pinnedAddress, int port, int timeoutMs) throws IOException;
    }

    private final OutboundEndpointGuard guard;
    private final SSLSocketFactory baseSslSocketFactory;
    private final TcpConnector tcpConnector;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    @Autowired
    public PinnedHttpsTransport(OutboundEndpointGuard guard) {
        this(guard, defaultSslSocketFactory(), PinnedHttpsTransport::openTcpSocket);
    }

    PinnedHttpsTransport(
            OutboundEndpointGuard guard,
            SSLSocketFactory baseSslSocketFactory,
            TcpConnector tcpConnector) {
        this.guard = guard;
        this.baseSslSocketFactory = baseSslSocketFactory;
        this.tcpConnector = tcpConnector;
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private static SSLSocketFactory defaultSslSocketFactory() {
        try {
            return SSLContext.getDefault().getSocketFactory();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Default SSLContext unavailable", e);
        }
    }

    private static Socket openTcpSocket(InetAddress pinnedAddress, int port, int timeoutMs)
            throws IOException {
        Socket socket = new Socket(Proxy.NO_PROXY);
        try {
            socket.connect(new InetSocketAddress(pinnedAddress, port), timeoutMs);
            return socket;
        } catch (IOException e) {
            try {
                socket.close();
            } catch (IOException ignored) {
                /* Best-effort close on failed connect. */
            }
            throw e;
        }
    }

    @Override
    public Response send(LlmSettings.Connection config, byte[] payload, long remainingMs)
            throws ConnectException {
        URI endpoint = config.endpoint();
        if (endpoint == null || !"https".equalsIgnoreCase(endpoint.getScheme())) {
            throw unavailable();
        }
        String host = endpoint.getHost();
        int port = endpoint.getPort() == -1 ? 443 : endpoint.getPort();
        // Resolve and validate all DNS records immediately before connecting so DNS rebinding
        // cannot redirect to private IPs.
        InetAddress pinnedAddress = guard.resolvePinnedPublicAddress(host);
        int connectTimeoutMs = (int) Math.max(1L, Math.min(CONNECT_TIMEOUT_MS, remainingMs));
        int readTimeoutMs = (int) Math.max(1L, Math.min(Integer.MAX_VALUE, remainingMs));

        AtomicReference<HttpsURLConnection> activeConnection = new AtomicReference<>();
        AtomicReference<Socket> activeSocket = new AtomicReference<>();
        AtomicBoolean requestSent = new AtomicBoolean(false);

        Future<Response> future =
                executor.submit(
                        () -> {
                            HttpsURLConnection connection =
                                    (HttpsURLConnection)
                                            endpoint.toURL().openConnection(Proxy.NO_PROXY);
                            activeConnection.set(connection);
                            try {
                                connection.setInstanceFollowRedirects(false);
                                connection.setUseCaches(false);
                                connection.setRequestMethod("POST");
                                connection.setDoOutput(true);
                                connection.setConnectTimeout(connectTimeoutMs);
                                connection.setReadTimeout(readTimeoutMs);
                                connection.setRequestProperty(
                                        "Authorization", "Bearer " + config.key());
                                connection.setRequestProperty("Content-Type", "application/json");
                                connection.setRequestProperty("Accept", "application/json");
                                connection.setRequestProperty("Connection", "close");
                                connection.setSSLSocketFactory(
                                        new PinnedSSLSocketFactory(
                                                baseSslSocketFactory,
                                                tcpConnector,
                                                host,
                                                port,
                                                pinnedAddress,
                                                connectTimeoutMs,
                                                readTimeoutMs,
                                                activeSocket));

                                try (OutputStream out = connection.getOutputStream()) {
                                    out.write(payload);
                                    out.flush();
                                }
                                requestSent.set(true);

                                int status = connection.getResponseCode();
                                String contentType = connection.getHeaderField("Content-Type");
                                InputStream stream =
                                        status >= 400
                                                ? connection.getErrorStream()
                                                : connection.getInputStream();
                                byte[] body = stream == null ? new byte[0] : readLimited(stream);
                                return new Response(
                                        status, contentType == null ? "" : contentType, body);
                            } finally {
                                connection.disconnect();
                                closeQuietly(activeSocket.get());
                            }
                        });

        try {
            return future.get(Math.max(1L, remainingMs), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            disconnectQuietly(activeConnection.get());
            closeQuietly(activeSocket.get());
            throw requestSent.get() ? timeout() : unavailable();
        } catch (InterruptedException e) {
            future.cancel(true);
            disconnectQuietly(activeConnection.get());
            closeQuietly(activeSocket.get());
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (ExecutionException e) {
            future.cancel(true);
            disconnectQuietly(activeConnection.get());
            closeQuietly(activeSocket.get());
            Throwable cause = e.getCause();
            if (cause instanceof ChatProvider.Failure failure) throw failure;
            if (cause instanceof ConnectException connect) throw connect;
            if (cause instanceof SocketTimeoutException) {
                throw requestSent.get() ? timeout() : unavailable();
            }
            if (cause instanceof SSLException || cause instanceof IOException) {
                throw unavailable();
            }
            throw unavailable();
        }
    }

    private static void closeQuietly(Socket socket) {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
                /* Best-effort close on cancellation/timeout. */
            }
        }
    }

    private static void disconnectQuietly(HttpsURLConnection connection) {
        if (connection != null) {
            try {
                connection.disconnect();
            } catch (RuntimeException ignored) {
                /* Best-effort disconnect on cancellation/timeout. */
            }
        }
    }

    private static byte[] readLimited(InputStream stream) throws IOException {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                if (out.size() + read > MAX_BODY_BYTES) {
                    throw unavailable();
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    private static ChatProvider.Failure unavailable() {
        return new ChatProvider.Failure(
                503, "ASSISTANT_PROVIDER_UNAVAILABLE", ChatProvider.Usage.unknown());
    }

    private static ChatProvider.Failure timeout() {
        return new ChatProvider.Failure(
                504, "ASSISTANT_PROVIDER_TIMEOUT", ChatProvider.Usage.unknown());
    }

    static final class PinnedSSLSocketFactory extends SSLSocketFactory {
        private final SSLSocketFactory delegate;
        private final TcpConnector tcpConnector;
        private final String originalHost;
        private final int targetPort;
        private final InetAddress pinnedAddress;
        private final int connectTimeoutMs;
        private final int readTimeoutMs;
        private final AtomicReference<Socket> activeSocket;

        PinnedSSLSocketFactory(
                SSLSocketFactory delegate,
                TcpConnector tcpConnector,
                String originalHost,
                int targetPort,
                InetAddress pinnedAddress,
                int connectTimeoutMs,
                int readTimeoutMs,
                AtomicReference<Socket> activeSocket) {
            this.delegate = delegate;
            this.tcpConnector = tcpConnector;
            this.originalHost = originalHost;
            this.targetPort = targetPort;
            this.pinnedAddress = pinnedAddress;
            this.connectTimeoutMs = connectTimeoutMs;
            this.readTimeoutMs = readTimeoutMs;
            this.activeSocket = activeSocket;
        }

        private SSLSocket createPinnedSocket() throws IOException {
            Socket tcp = tcpConnector.connect(pinnedAddress, targetPort, connectTimeoutMs);
            activeSocket.set(tcp);
            try {
                tcp.setSoTimeout(readTimeoutMs);
                SSLSocket ssl =
                        (SSLSocket) delegate.createSocket(tcp, originalHost, targetPort, true);
                applyTlsVerification(ssl, originalHost);
                return new PreConnectedSSLSocket(ssl, originalHost);
            } catch (IOException | RuntimeException e) {
                try {
                    tcp.close();
                } catch (IOException ignored) {
                    /* Best-effort close. */
                }
                throw e;
            }
        }

        static void applyTlsVerification(SSLSocket socket, String originalHost) {
            SSLParameters params = socket.getSSLParameters();
            params.setEndpointIdentificationAlgorithm("HTTPS");
            if (!OutboundEndpointGuard.isIpLiteral(originalHost)) {
                String sniHost =
                        originalHost.endsWith(".")
                                ? originalHost.substring(0, originalHost.length() - 1)
                                : originalHost;
                params.setServerNames(List.of(new SNIHostName(sniHost)));
            }
            socket.setSSLParameters(params);
        }

        @Override
        public String[] getDefaultCipherSuites() {
            return delegate.getDefaultCipherSuites();
        }

        @Override
        public String[] getSupportedCipherSuites() {
            return delegate.getSupportedCipherSuites();
        }

        @Override
        public Socket createSocket() throws IOException {
            return createPinnedSocket();
        }

        @Override
        public Socket createSocket(Socket s, String host, int port, boolean autoClose)
                throws IOException {
            if (autoClose && s != null) {
                try {
                    s.close();
                } catch (IOException ignored) {
                }
            }
            return createPinnedSocket();
        }

        @Override
        public Socket createSocket(String host, int port) throws IOException {
            return createPinnedSocket();
        }

        @Override
        public Socket createSocket(String host, int port, InetAddress localHost, int localPort)
                throws IOException {
            return createPinnedSocket();
        }

        @Override
        public Socket createSocket(InetAddress host, int port) throws IOException {
            return createPinnedSocket();
        }

        @Override
        public Socket createSocket(
                InetAddress address, int port, InetAddress localAddress, int localPort)
                throws IOException {
            return createPinnedSocket();
        }
    }

    static final class PreConnectedSSLSocket extends SSLSocket {
        private final SSLSocket delegate;
        private final String originalHost;

        PreConnectedSSLSocket(SSLSocket delegate, String originalHost) {
            this.delegate = delegate;
            this.originalHost = originalHost;
        }

        @Override
        public void connect(SocketAddress endpoint) {
            // Already connected directly to the validated pinned IP; ignore any re-resolved
            // address.
        }

        @Override
        public void connect(SocketAddress endpoint, int timeout) {
            // Already connected directly to the validated pinned IP; ignore any re-resolved
            // address.
        }

        @Override
        public void setSSLParameters(SSLParameters params) {
            if (params != null) {
                params.setEndpointIdentificationAlgorithm("HTTPS");
                if (!OutboundEndpointGuard.isIpLiteral(originalHost)) {
                    String sniHost =
                            originalHost.endsWith(".")
                                    ? originalHost.substring(0, originalHost.length() - 1)
                                    : originalHost;
                    params.setServerNames(List.of(new SNIHostName(sniHost)));
                }
            }
            delegate.setSSLParameters(params);
        }

        @Override
        public SSLParameters getSSLParameters() {
            return delegate.getSSLParameters();
        }

        @Override
        public String[] getSupportedCipherSuites() {
            return delegate.getSupportedCipherSuites();
        }

        @Override
        public String[] getEnabledCipherSuites() {
            return delegate.getEnabledCipherSuites();
        }

        @Override
        public void setEnabledCipherSuites(String[] suites) {
            delegate.setEnabledCipherSuites(suites);
        }

        @Override
        public String[] getSupportedProtocols() {
            return delegate.getSupportedProtocols();
        }

        @Override
        public String[] getEnabledProtocols() {
            return delegate.getEnabledProtocols();
        }

        @Override
        public void setEnabledProtocols(String[] protocols) {
            delegate.setEnabledProtocols(protocols);
        }

        @Override
        public SSLSession getSession() {
            return delegate.getSession();
        }

        @Override
        public SSLSession getHandshakeSession() {
            return delegate.getHandshakeSession();
        }

        @Override
        public void addHandshakeCompletedListener(HandshakeCompletedListener listener) {
            delegate.addHandshakeCompletedListener(listener);
        }

        @Override
        public void removeHandshakeCompletedListener(HandshakeCompletedListener listener) {
            delegate.removeHandshakeCompletedListener(listener);
        }

        @Override
        public void startHandshake() throws IOException {
            delegate.startHandshake();
        }

        @Override
        public void setUseClientMode(boolean mode) {
            delegate.setUseClientMode(mode);
        }

        @Override
        public boolean getUseClientMode() {
            return delegate.getUseClientMode();
        }

        @Override
        public void setNeedClientAuth(boolean need) {
            delegate.setNeedClientAuth(need);
        }

        @Override
        public boolean getNeedClientAuth() {
            return delegate.getNeedClientAuth();
        }

        @Override
        public void setWantClientAuth(boolean want) {
            delegate.setWantClientAuth(want);
        }

        @Override
        public boolean getWantClientAuth() {
            return delegate.getWantClientAuth();
        }

        @Override
        public void setEnableSessionCreation(boolean flag) {
            delegate.setEnableSessionCreation(flag);
        }

        @Override
        public boolean getEnableSessionCreation() {
            return delegate.getEnableSessionCreation();
        }

        @Override
        public String getApplicationProtocol() {
            return delegate.getApplicationProtocol();
        }

        @Override
        public String getHandshakeApplicationProtocol() {
            return delegate.getHandshakeApplicationProtocol();
        }

        @Override
        public void bind(SocketAddress bindpoint) throws IOException {
            delegate.bind(bindpoint);
        }

        @Override
        public InetAddress getInetAddress() {
            return delegate.getInetAddress();
        }

        @Override
        public InetAddress getLocalAddress() {
            return delegate.getLocalAddress();
        }

        @Override
        public int getPort() {
            return delegate.getPort();
        }

        @Override
        public int getLocalPort() {
            return delegate.getLocalPort();
        }

        @Override
        public SocketAddress getRemoteSocketAddress() {
            return delegate.getRemoteSocketAddress();
        }

        @Override
        public SocketAddress getLocalSocketAddress() {
            return delegate.getLocalSocketAddress();
        }

        @Override
        public SocketChannel getChannel() {
            return delegate.getChannel();
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return delegate.getInputStream();
        }

        @Override
        public OutputStream getOutputStream() throws IOException {
            return delegate.getOutputStream();
        }

        @Override
        public void setTcpNoDelay(boolean on) throws SocketException {
            delegate.setTcpNoDelay(on);
        }

        @Override
        public boolean getTcpNoDelay() throws SocketException {
            return delegate.getTcpNoDelay();
        }

        @Override
        public void setSoLinger(boolean on, int linger) throws SocketException {
            delegate.setSoLinger(on, linger);
        }

        @Override
        public int getSoLinger() throws SocketException {
            return delegate.getSoLinger();
        }

        @Override
        public void sendUrgentData(int data) throws IOException {
            delegate.sendUrgentData(data);
        }

        @Override
        public void setOOBInline(boolean on) throws SocketException {
            delegate.setOOBInline(on);
        }

        @Override
        public boolean getOOBInline() throws SocketException {
            return delegate.getOOBInline();
        }

        @Override
        public synchronized void setSoTimeout(int timeout) throws SocketException {
            delegate.setSoTimeout(timeout);
        }

        @Override
        public synchronized int getSoTimeout() throws SocketException {
            return delegate.getSoTimeout();
        }

        @Override
        public synchronized void setSendBufferSize(int size) throws SocketException {
            delegate.setSendBufferSize(size);
        }

        @Override
        public synchronized int getSendBufferSize() throws SocketException {
            return delegate.getSendBufferSize();
        }

        @Override
        public synchronized void setReceiveBufferSize(int size) throws SocketException {
            delegate.setReceiveBufferSize(size);
        }

        @Override
        public synchronized int getReceiveBufferSize() throws SocketException {
            return delegate.getReceiveBufferSize();
        }

        @Override
        public void setKeepAlive(boolean on) throws SocketException {
            delegate.setKeepAlive(on);
        }

        @Override
        public boolean getKeepAlive() throws SocketException {
            return delegate.getKeepAlive();
        }

        @Override
        public void setTrafficClass(int tc) throws SocketException {
            delegate.setTrafficClass(tc);
        }

        @Override
        public int getTrafficClass() throws SocketException {
            return delegate.getTrafficClass();
        }

        @Override
        public void setReuseAddress(boolean on) throws SocketException {
            delegate.setReuseAddress(on);
        }

        @Override
        public boolean getReuseAddress() throws SocketException {
            return delegate.getReuseAddress();
        }

        @Override
        public synchronized void close() throws IOException {
            delegate.close();
        }

        @Override
        public void shutdownInput() throws IOException {
            delegate.shutdownInput();
        }

        @Override
        public void shutdownOutput() throws IOException {
            delegate.shutdownOutput();
        }

        @Override
        public boolean isConnected() {
            return delegate.isConnected();
        }

        @Override
        public boolean isBound() {
            return delegate.isBound();
        }

        @Override
        public boolean isClosed() {
            return delegate.isClosed();
        }

        @Override
        public boolean isInputShutdown() {
            return delegate.isInputShutdown();
        }

        @Override
        public boolean isOutputShutdown() {
            return delegate.isOutputShutdown();
        }
    }
}
