# Quy ước agent cho CookLens backend

`backend/` là Spring Boot service của CookLens.
Nó phơi REST API cho frontend, lưu dữ liệu ứng dụng và điều phối các dịch vụ AI; nó không chứa code train CV, RAG ingestion hoặc LangGraph node implementation.

## Công nghệ và cấu trúc

- Java 21, Spring Boot 3.x, Maven, Spring Web MVC, Spring Data JPA và PostgreSQL.
- Base package: `com.cooklens`.
- Mã nằm trong `backend/src/main/java/com/cooklens/`: `controller/`, `service/`, `client/`, `dto/`, `domain/`, `repository/`, `config/`, `exception/`.
- Test nằm trong `backend/src/test/java/com/cooklens/` và dùng JUnit 5/Mockito; dùng Testcontainers khi cần kiểm thử PostgreSQL thật.
- Contract nguồn: [`../../docs/technical-architecture.md`](../../docs/technical-architecture.md).

## Ranh giới triển khai

- Controller nhận/trả DTO record, dùng Bean Validation, và không trả JPA entity hoặc raw `Map`.
- `@RestControllerAdvice` tạo error contract thống nhất; response thành công dùng `ApiResponse<T>` khi module DTO được tạo.
- Service điều phối use case/transaction; repository chỉ truy cập PostgreSQL.
- `client/` gọi các dịch vụ Python trong `ai/` qua HTTP với timeout, retry có giới hạn và error mapping rõ ràng.
  Không import trực tiếp code Python, Qdrant client hay LLM provider vào controller.
- Endpoints MVP: `POST /api/vision/predict`, `POST /api/recipes/search`, `POST /api/chat`.
  Dùng springdoc annotation để OpenAPI sinh từ code; không hand-maintain OpenAPI YAML.
- `normalized_dish` phải thống nhất giữa CV, recipe metadata và API.
  `thread_id` là bắt buộc cho chat request; backend truyền nó cho agent/checkpointer và trả `current_step`, `selected_recipe_id` cần thiết cho UI.

## Security, logging và xác minh

- Validate MIME type/kích thước ảnh trước khi gọi vision service.
- Không log secret, ảnh gốc hoặc nội dung hội thoại không cần thiết.
  Log request ID, model version, confidence, normalized dish, recipe IDs, intent, current step, latency và error code.
- Spring Boot Actuator/Micrometer là lựa chọn mặc định cho health/metrics khi service được tạo.
- Không tự commit hoặc push nếu user chưa yêu cầu trong lượt hiện tại.
  Commit message viết bằng tiếng Anh.
- Trước khi báo hoàn thành, chạy compile/test/check phù hợp với thay đổi và đọc lại diff.
