package com.cooklens.controller;

import com.cooklens.config.RequestGuard;
import com.cooklens.config.RuntimeContract;
import com.cooklens.dto.ApiModels.*;
import com.cooklens.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.responses.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value="/api", produces="application/json")
@ApiResponses({
    @ApiResponse(responseCode="400", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="404", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="413", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="415", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="422", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="500", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="503", content=@Content(schema=@Schema(implementation=ErrorResponse.class))),
    @ApiResponse(responseCode="504", content=@Content(schema=@Schema(implementation=ErrorResponse.class)))
})
public class ApiController {
    private final GatewayService service;
    private final ImageUpload upload;
    private final DependencyHealth health;
    private final RuntimeContract contract;
    public ApiController(GatewayService service, ImageUpload upload, DependencyHealth health, RuntimeContract contract) {
        this.service=service; this.upload=upload; this.health=health; this.contract=contract;
    }
    @PostMapping(value="/vision/predict", produces="application/json")
    @Operation(operationId="predict", summary="Nhận diện ba món có khả năng cao nhất", requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(
            required=true, content=@Content(mediaType="multipart/form-data", schema=@Schema(implementation=ImageRequest.class))))
    @ApiResponse(responseCode="200", description="OK", content=@Content(mediaType="application/json", schema=@Schema(implementation=PredictionResponse.class)))
    public PredictionResponse predict(HttpServletRequest request) {
        var image = upload.read(request);
        return service.predict(image.bytes(), image.mime(), RequestGuard.id(request));
    }
    @GetMapping("/dishes")
    @Operation(operationId="dishes", summary="Danh mục 30 món")
    @ApiResponse(responseCode="200", description="OK", content=@Content(mediaType="application/json", schema=@Schema(implementation=DishesResponse.class)))
    public DishesResponse dishes(HttpServletRequest request) { return service.dishes(RequestGuard.id(request)); }
    @PostMapping(value="/recipes/search", consumes="application/json", produces="application/json")
    @Operation(operationId="searchRecipes", summary="Tìm công thức trong món đã xác nhận", requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(
            required=true, content=@Content(mediaType="application/json", schema=@Schema(implementation=SearchRequest.class))))
    @ApiResponse(responseCode="200", description="OK", content=@Content(mediaType="application/json", schema=@Schema(implementation=SearchResponse.class)))
    public SearchResponse search(@RequestBody byte[] body, HttpServletRequest request) {
        return service.search(service.parseSearch(body), RequestGuard.id(request));
    }
    @GetMapping("/recipes/{id}")
    @Operation(operationId="recipeDetail", summary="Chi tiết công thức và nguồn")
    @ApiResponse(responseCode="200", description="OK", content=@Content(mediaType="application/json", schema=@Schema(implementation=DetailResponse.class)))
    public DetailResponse detail(@PathVariable String id, HttpServletRequest request) { return service.detail(id, RequestGuard.id(request)); }
    @GetMapping("/health")
    @Operation(operationId="health", summary="Readiness tổng hợp đúng phiên bản")
    @ApiResponse(responseCode="503", content=@Content(schema=@Schema(implementation=HealthResponse.class)))
    @ApiResponse(responseCode="200", description="OK", content=@Content(mediaType="application/json", schema=@Schema(implementation=HealthResponse.class)))
    public ResponseEntity<HealthResponse> health(HttpServletRequest request) {
        var state = health.snapshot(RequestGuard.id(request));
        return ResponseEntity.status(state.status().equals("ready") ? 200 : 503)
                .body(new HealthResponse(contract.apiVersion, RequestGuard.id(request), state.status(), state.dependencies()));
    }
}
