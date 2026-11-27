package com.cooklens.controller;

import com.cooklens.client.VoiceClient;
import com.cooklens.config.RequestGuard;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.ErrorResponse;
import com.cooklens.service.SingleFileUpload;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VoiceController {
    private final SingleFileUpload upload;
    private final VoiceClient voice;
    private final RuntimeContract contract;

    public VoiceController(SingleFileUpload upload, VoiceClient voice, RuntimeContract contract) {
        this.upload = upload;
        this.voice = voice;
        this.contract = contract;
    }

    public record AudioRequest(@Schema(type = "string", format = "binary", requiredMode = Schema.RequiredMode.REQUIRED) String file) {}
    public record TranscriptionResponse(
            @JsonProperty(value = "api_version", required = true) String apiVersion,
            @JsonProperty(value = "request_id", required = true) String requestId,
            @JsonProperty(value = "text", required = true) @Schema(maxLength = 2000) String text) {}

    @PostMapping(value = RequestGuard.TRANSCRIPTION_PATH, consumes = "multipart/form-data", produces = "application/json")
    @Operation(operationId = "transcribe", summary = "Chuyển câu hỏi nói tiếng Việt thành chữ",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(mediaType = "multipart/form-data", schema = @Schema(implementation = AudioRequest.class))))
    @ApiResponses({
            @ApiResponse(responseCode = "200", content = @Content(schema = @Schema(implementation = TranscriptionResponse.class))),
            @ApiResponse(responseCode = "400", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "413", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "415", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "422", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "503", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "504", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    public TranscriptionResponse transcribe(HttpServletRequest request) {
        String id = RequestGuard.id(request);
        return new TranscriptionResponse(contract.apiVersion, id, voice.transcribe(upload.readAudio(request), id));
    }
}
