package com.cooklens.exception;

import com.cooklens.config.RequestGuard;
import com.cooklens.config.RuntimeContract;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiExceptionHandler {
    private final RuntimeContract contract;
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    public ApiExceptionHandler(RuntimeContract contract) { this.contract=contract; }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<com.cooklens.dto.ApiModels.ErrorResponse> handle(Exception error, HttpServletRequest request) {
        ApiFailure failure;
        if (error instanceof ApiFailure f) failure=f;
        else if (error instanceof org.springframework.http.converter.HttpMessageNotReadableException) failure=ApiFailure.invalid();
        else if (error instanceof ErrorResponse e) {
            int status = e.getStatusCode().value();
            if (status == 415) failure = new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE");
            else if (status >= 400 && status < 500) failure = new ApiFailure(status == 400 ? 422 : status, "VALIDATION_ERROR");
            else failure = new ApiFailure(500, "INTERNAL_ERROR");
        } else failure = new ApiFailure(500, "INTERNAL_ERROR");
        if (failure.status() == 500) log.error("request_failed request_id={}", RequestGuard.id(request));
        return ResponseEntity.status(failure.status()).body(new com.cooklens.dto.ApiModels.ErrorResponse(
                contract.apiVersion, RequestGuard.id(request), failure.code(), failure.publicMessage()));
    }
}
