package com.cooklens.controller;

import com.cooklens.config.RequestGuard;
import com.cooklens.dto.ApiModels.ErrorResponse;
import com.cooklens.dto.AssistantModels.*;
import com.cooklens.service.AssistantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.responses.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value="/api/assistant", produces="application/json")
@ApiResponses({
    @ApiResponse(responseCode="404", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="409", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="410", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="413", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="415", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="422", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="500", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="503", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="504", content=@Content(schema=@Schema(implementation=ErrorResponse.class)))
})
public class AssistantController {
    private final AssistantService service;
    public AssistantController(AssistantService service) { this.service=service; }
    @PostMapping(value="/sessions", consumes="application/json")
    @Operation(operationId="createSession", summary="Tạo phiên từ công thức có version", requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(
            required=true, content=@Content(mediaType="application/json", schema=@Schema(implementation=CreateSession.class))))
    @ApiResponse(responseCode="200", description="OK", content=@Content(schema=@Schema(implementation=SessionResponse.class)))
    public SessionResponse create(@RequestBody byte[] body, HttpServletRequest request) {
        return service.create(service.parse(body,CreateSession.class),RequestGuard.id(request));
    }
    @GetMapping("/sessions/{id}")
    @Operation(operationId="getSession", summary="Khôi phục công thức và bước nấu đã lưu")
    @ApiResponse(responseCode="200", description="OK", content=@Content(schema=@Schema(implementation=SessionResponse.class)))
    public SessionResponse get(@PathVariable String id, HttpServletRequest request) {
        return service.get(id,RequestGuard.id(request));
    }
    @PostMapping(value="/sessions/{id}/actions", consumes="application/json")
    @Operation(operationId="sessionAction", summary="Điều khiển bước với operation ID và state version", requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(
            required=true, content=@Content(mediaType="application/json", schema=@Schema(implementation=SessionAction.class))))
    @ApiResponse(responseCode="200", description="OK", content=@Content(schema=@Schema(implementation=SessionResponse.class)))
    public SessionResponse action(@PathVariable String id, @RequestBody byte[] body, HttpServletRequest request) {
        return service.act(id,service.parse(body,SessionAction.class),RequestGuard.id(request));
    }
    @PostMapping(value="/sessions/{id}/messages", consumes="application/json")
    @Operation(operationId="sessionMessage", summary="Hỏi đáp theo phiên; chưa cấu hình provider trả 503", requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(
            required=true, content=@Content(mediaType="application/json", schema=@Schema(implementation=SessionMessage.class))))
    @ApiResponse(responseCode="200", description="OK", content=@Content(schema=@Schema(implementation=SessionResponse.class)))
    public SessionResponse message(@PathVariable String id, @RequestBody byte[] body, HttpServletRequest request) {
        return service.message(id,service.parse(body,SessionMessage.class),RequestGuard.id(request));
    }
}
