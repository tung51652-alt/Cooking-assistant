package com.cooklens.config;

import com.cooklens.dto.ApiModels.ErrorResponse;
import com.cooklens.exception.ApiFailure;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestGuard extends OncePerRequestFilter {
    public static final String REQUEST_ID = "cooklens.requestId";
    private static final String BODY = "cooklens.bufferedBody";
    public static final int MAX_FILE = 10 * 1024 * 1024;
    public static final int MAX_UPLOAD = 11 * 1024 * 1024;
    private final Semaphore slots = new Semaphore(4);
    private final ObjectMapper mapper;
    private final RuntimeContract contract;
    public RequestGuard(ObjectMapper mapper, RuntimeContract contract) { this.mapper = mapper; this.contract = contract; }
    @Override protected boolean shouldNotFilterAsyncDispatch() { return false; }
    public static String id(HttpServletRequest request) { return (String) request.getAttribute(REQUEST_ID); }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getAttribute(REQUEST_ID) == null) {
            String candidate = request.getHeader("X-Request-ID");
            String identifier;
            try {
                identifier = UUID.fromString(candidate).toString();
                if (!identifier.equalsIgnoreCase(candidate)) identifier = UUID.randomUUID().toString();
            } catch (IllegalArgumentException | NullPointerException e) { identifier = UUID.randomUUID().toString(); }
            request.setAttribute(REQUEST_ID, identifier);
        }
        response.setHeader("X-Request-ID", id(request));
        if (request.getAttribute(BODY) instanceof byte[] bytes) {
            chain.doFilter(new MemoryRequest(request, bytes), response); return;
        }
        String path = request.getRequestURI();
        boolean business = path.startsWith("/api/") && !path.equals("/api/health") && !request.getMethod().equals("OPTIONS");
        if (!business) { chain.doFilter(request, response); return; }
        if (!slots.tryAcquire()) { writeFailure(request, response, new ApiFailure(503, "SERVICE_BUSY")); return; }
        boolean async = false;
        try {
            if (request.getMethod().equals("POST")) {
                int limit = path.equals("/api/vision/predict") ? MAX_UPLOAD : 8192;
                if (request.getContentLengthLong() > limit) throw new ApiFailure(413, "UPLOAD_TOO_LARGE");
                readBody(request, response, limit);
                async = true;
            } else chain.doFilter(request, response);
        } catch (ApiFailure e) { writeFailure(request, response, e); }
        finally { if (!async) slots.release(); }
    }
    private void readBody(HttpServletRequest request, HttpServletResponse response, int limit) throws IOException {
        AsyncContext context = request.startAsync();
        context.setTimeout(request.getRequestURI().equals("/api/vision/predict") ? 15000 : 5000);
        var finished = new AtomicBoolean();
        var bytes = new ByteArrayOutputStream();
        var input = request.getInputStream();
        context.addListener(new AsyncListener() {
            public void onComplete(AsyncEvent event) { slots.release(); }
            public void onTimeout(AsyncEvent event) { fail(ApiFailure.timeout()); }
            public void onError(AsyncEvent event) { fail(ApiFailure.invalid()); }
            public void onStartAsync(AsyncEvent event) {}
            private void fail(ApiFailure failure) {
                if (finished.compareAndSet(false, true)) {
                    try { writeFailure(request, response, failure); } catch (IOException ignored) { /* Caller disconnected. */ }
                    finally { context.complete(); }
                }
            }
        });
        input.setReadListener(new ReadListener() {
            public void onDataAvailable() throws IOException {
                byte[] chunk = new byte[8192];
                while (input.isReady() && !input.isFinished() && !finished.get()) {
                    int count = input.read(chunk);
                    if (count < 0) break;
                    if (bytes.size() + count > limit) {
                        fail(new ApiFailure(413, "UPLOAD_TOO_LARGE")); return;
                    }
                    bytes.write(chunk, 0, count);
                }
            }
            public void onAllDataRead() {
                if (finished.compareAndSet(false, true)) {
                    request.setAttribute(BODY, bytes.toByteArray()); context.dispatch();
                }
            }
            public void onError(Throwable error) { fail(ApiFailure.invalid()); }
            private void fail(ApiFailure failure) {
                if (finished.compareAndSet(false, true)) {
                    try { writeFailure(request, response, failure); } catch (IOException ignored) { /* Caller disconnected. */ }
                    finally { context.complete(); }
                }
            }
        });
    }
    private void writeFailure(HttpServletRequest request, HttpServletResponse response, ApiFailure failure) throws IOException {
        response.setStatus(failure.status()); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        mapper.writeValue(response.getOutputStream(), new ErrorResponse(contract.apiVersion, id(request), failure.code(), failure.publicMessage()));
    }
    private static class MemoryRequest extends HttpServletRequestWrapper {
        private final byte[] bytes;
        MemoryRequest(HttpServletRequest request, byte[] bytes) { super(request); this.bytes = bytes; }
        @Override public int getContentLength() { return bytes.length; }
        @Override public long getContentLengthLong() { return bytes.length; }
        @Override public ServletInputStream getInputStream() {
            var stream = new ByteArrayInputStream(bytes);
            return new ServletInputStream() {
                public int read() { return stream.read(); }
                public int read(byte[] target, int offset, int length) { return stream.read(target, offset, length); }
                public boolean isFinished() { return stream.available() == 0; }
                public boolean isReady() { return true; }
                public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), java.nio.charset.StandardCharsets.UTF_8)); }
    }
}
