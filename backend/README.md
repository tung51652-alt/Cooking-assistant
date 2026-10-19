# CookLens public gateway — Phase 3

Java 21, Spring Boot 3.5.16, Maven 3.9.11, springdoc 2.9.1; multipart streaming dùng Apache Commons FileUpload 2.0.0-M5 (Jakarta Servlet 6). Tham khảo [Spring Boot requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html), [springdoc compatibility](https://springdoc.org/v2/) và [Apache streaming API](https://commons.apache.org/proper/commons-fileupload/streaming.html). Dependency trực tiếp được pin trong pom; transitive/plugin versions do parent Spring Boot quản lý. Image runtime Temurin 21.0.12.1, user 10001, read-only, budget 512 MiB/2 CPU; Maven/JDK chỉ nằm ở build stage.

## Trách nhiệm

- `controller`: public routes và schema sinh OpenAPI; `dto`: typed records theo contract snake_case.
- `service`: điều phối, validation, chọn món rõ ràng, chuẩn hóa query và readiness cache một giây.
- `client`: HTTP độc lập vision/recipes, connect hai giây, deadline vision 15 giây/recipes năm giây; response tối đa 1 MiB. Không tự retry, không follow redirect.
- `config`: tải manifest/taxonomy từ cùng file nguồn của AI, CORS allowlist, nonblocking receive guard và probe Docker chỉ dùng JDK.
- `exception`: status/code/message public, không trả message/stack/path upstream.

Không thêm database, JPA, tài khoản, lưu ảnh, chatbot hoặc state xác nhận. Hai AI service không gọi ngược backend. Không hardcode danh mục món trong Java; Maven đưa hai file authoritative vào classpath khi build.

## Chạy local

Cần JDK 21 đầy đủ và Maven; Java runtime đơn thuần không biên dịch được. Hai AI service phải chạy với artifact/version trong manifest.

```sh
mvn -f backend/pom.xml test
VISION_URL=http://127.0.0.1:8000 RECIPES_URL=http://127.0.0.1:8001 \
  mvn -f backend/pom.xml spring-boot:run
```

Swagger: http://127.0.0.1:8080/swagger-ui/index.html. OpenAPI sinh từ controller/DTO tại `/v3/api-docs`; không duy trì YAML riêng. Routes `/api/vision/predict`, `/api/dishes`, `/api/recipes/search`, `/api/recipes/{id}`, `/api/health`. Frontend vẫn dùng `/api` relative; Phase 4 nối và nghiệm thu UI.

Release dùng cùng origin; mặc định CORS trống. Nếu chạy Vite khác origin, đặt `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Không wildcard/credentials. Không tin Forwarded headers từ caller; reverse proxy chính thức thuộc Phase 5.

## Docker tích hợp

Đầu vào build là checkpoint vision, bundle embedding và vectors/corpus đã stage theo [vision](../ai/cv/inference/README.md) và [recipes](../ai/rag/README.md). Image AI local phải tương ứng corpus hiện tại; chưa push Docker Hub trong Phase 3.

```sh
docker build -f deploy/docker/Dockerfile.vision -t cooklens-vision:phase1 .
docker build -f deploy/docker/Dockerfile.recipes -t cooklens-recipes:phase2 .
docker build -f deploy/docker/Dockerfile.backend -t cooklens-backend:phase3 .
docker compose -p cooklens-phase3-local \
  -f deploy/compose/recipes.phase2.yml -f deploy/compose/backend.phase3.yml up -d
```

Compose cần hỗ trợ `!reset` (Docker Compose 2.24.4 trở lên). Overlay bỏ port recipes, chỉ publish backend trên loopback 8080; AI/Qdrant chỉ dùng network internal; backend có thêm browser bridge để Docker publish cổng localhost. `BACKEND_PORT` đổi port host. Đây là stack kiểm tra Phase 3; frontend và Compose release toàn sản phẩm thuộc Phase 4/5. Volume Qdrant riêng theo project; init dùng cùng image và idempotent.

```sh
python3 deploy/scripts/smoke_backend_stack.py
# Dựng project riêng, xác minh với AI thật, dừng dependency/thử phục hồi rồi thu dọn.
sh deploy/scripts/generate_frontend_contract.sh
# Gateway đang chạy: sinh frontend/src/generated/api.d.ts từ OpenAPI public.
```

Dừng riêng stack review (giữ volume để chạy lại):

```sh
docker compose -p cooklens-phase3-local \
  -f deploy/compose/recipes.phase2.yml -f deploy/compose/backend.phase3.yml down
```

Probe `/actuator/health/liveness` chỉ phản ánh process; `/actuator/health/readiness` và `/api/health` kiểm tra cả hai AI đúng version. Hai request health chạy song song với deadline tổng dưới hai giây, cache tối đa một giây; không inference/embedding. Không expose actuator config/debug.

## Giới hạn và kiểm thử

Guard giữ tối đa bốn request nghiệp vụ, gồm thời gian nhận body; quá tải trả ngay 503. Body vision tối đa 11 MiB, từng file 10 MiB; search 8 KiB, kể cả chunked. Servlet nonblocking nhận body với deadline tổng 15 giây cho upload/năm giây cho JSON, đọc trong RAM, không tạo file tạm. Multipart chỉ nhận đúng một trường file JPEG/PNG. Decode/pixel/frame/bomb checks do vision thực hiện; backend không giải mã ảnh lần hai. Tomcat HTTP connections/accept queue cũng được chặn ở mức hữu hạn; health không giữ slot AI.

JUnit dùng cổng HTTP thật và dependency server giả lập để kiểm tra lỗi, version, deadline, response quá lớn, request ID, strict JSON, upload chunked, ngắt kết nối, quá tải, nguồn URL và readiness. Fixture prediction dùng chung với Phase 1; corpus test lấy trực tiếp file Phase 2, không chép một bản dữ liệu khác. Smoke Compose riêng kiểm chứng CV thật → chọn ứng viên thứ hai → tìm/detail, đủ 30 món, dừng/khởi động AI, AI network internal, một lượt toàn luồng khi tháo browser bridge của backend, non-root/read-only và probe. Fault injection không được tính vào metric retrieval.

Type frontend được sinh tự động từ OpenAPI; UI hiện chưa được chuyển sang import type mới hoặc nghiệm thu với backend thật trong Phase 3. Không tạo app mobile/APK; định hướng Expo giữ nguyên.
