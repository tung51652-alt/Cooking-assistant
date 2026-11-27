package com.cooklens.client;

import com.cooklens.config.LlmSettings;
import java.net.ConnectException;

public interface ByokTransport {
    record Response(int statusCode, String contentType, byte[] body) {}

    Response send(LlmSettings.Connection config, byte[] payload, long remainingMs) throws ConnectException;
}
