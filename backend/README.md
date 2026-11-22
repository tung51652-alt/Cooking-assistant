# CookLens public gateway

Java 21, Spring Boot 3.5.16, Maven 3.9.11, springdoc 2.9.1; multipart streaming dùng Apache Commons FileUpload 2.0.0-M5 (Jakarta Servlet 6). Tham khảo [Spring Boot requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html), [springdoc compatibility](https://springdoc.org/v2/) và [Apache streaming API](https://commons.apache.org/proper/commons-fileupload/streaming.html). Dependency trực tiếp được pin trong pom; transitive/plugin versions do parent Spring Boot quản lý. Image runtime Temurin 21.0.12.1, user 10001, read-only, budget 512 MiB/2 CPU; Maven/JDK chỉ nằm ở build stage.

## Trách nhiệm

- `controller`: public routes và schema sinh OpenAPI; `dto`: typed records theo contract snake_case.
- `service`: điều phối, validation, chọn món rõ ràng, chuẩn hóa query và readiness cache một giây.
- `client`: HTTP độc lập vision/recipes, connect hai giây, deadline vision 15 giây/recipes năm giây; response tối đa 1 MiB. Không tự retry, không follow redirect.
- `config`: tải manifest/taxonomy từ cùng file nguồn của AI, CORS allowlist, nonblocking receive guard và probe Docker chỉ dùng JDK.
- `exception`: status/code/message public, không trả message/stack/path upstream.

Phiên nấu dùng SQLite JDBC 3.51.0.0, không thêm JPA hoặc container database.
Không thêm tài khoản, lưu ảnh hoặc state xác nhận.
Hai AI service không gọi ngược backend.
Không hardcode danh mục món trong Java; Maven đưa hai file authoritative vào classpath khi build.

## Chạy local

Cần JDK 21 đầy đủ và Maven; Java runtime đơn thuần không biên dịch được. Hai AI service phải chạy với artifact/version trong manifest.

```sh
mvn -f backend/pom.xml test
VISION_URL=http://127.0.0.1:8000 RECIPES_URL=http://127.0.0.1:8001 \
  mvn -f backend/pom.xml spring-boot:run
```

Swagger: http://127.0.0.1:8080/swagger-ui/index.html. OpenAPI sinh từ controller/DTO tại `/v3/api-docs`; không duy trì YAML riêng. Routes `/api/vision/predict`, `/api/dishes`, `/api/recipes/search`, `/api/recipes/{id}`, `/api/health`. Frontend vẫn dùng `/api` relative; Phase 4 nối và nghiệm thu UI.

Release dùng cùng origin; mặc định CORS trống. Nếu chạy Vite khác origin, đặt `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Không wildcard/credentials. Không tin Forwarded headers từ caller; reverse proxy Nginx được cấu hình trong Compose gốc.

## Phiên nấu (source Phase 9)

`/api/assistant/sessions`, `/{id}`, `/{id}/actions` và `/{id}/messages` được mô tả trong [contract](../docs/contracts/mvp-v1.md#phiên-trợ-lý-phase-89).
Phiên lấy snapshot công thức từ gateway, tồn tại 24 giờ và giữ tối đa 100 action có operation ID/version.
Hỏi đáp hiện trả `ASSISTANT_NOT_CONFIGURED`; điều khiển bước không cần key/LLM.
Web/Expo chưa có giao diện phiên; dùng client chung `getRecipeDocument`, `createSession`, `getSession`, `sessionAction`, `sessionMessage`.
`getRecipeDocument` giữ corpus version cần cho tạo phiên; `getRecipe` cũ vẫn trả recipe như trước.

`ASSISTANT_DB_PATH` mặc định là `${user.home}/.cooklens/assistant.sqlite` khi chạy Spring trực tiếp.
Trong Compose, backend dùng `/app/data/assistant.sqlite` trên volume `assistant-sessions`.
Schema khởi tạo khi truy cập phiên lần đầu; schema lạ hoặc lỗi ghi chỉ ảnh hưởng API trợ lý.
Mỗi lần load kiểm tra snapshot và bất biến state/history trước khi trả dữ liệu hoặc ghi action; dữ liệu lưu sai trả storage 503, không tự sửa.
Snapshot hợp lệ từ corpus cũ được giữ nguyên, không so version với manifest hiện tại khi đọc.
Không log session ID/nội dung hội thoại hoặc chia sẻ ID phiên vì ID là quyền truy cập phiên.
Native library SQLite được đóng gói tại `/app/sqlite` để dùng được với `/tmp` noexec và root filesystem read-only.

## Docker

Chạy toàn dự án từ root bằng `docker compose up`; truy cập qua http://localhost:8080/.
Backend nằm trong mạng nội bộ, không publish cổng riêng. Dockerfile ở `backend/Dockerfile`;
[development.md](../docs/development.md) mô tả build source khi cần.

OpenAPI/Swagger của backend giữ nội bộ. Với stack đang chạy,
`sh deploy/scripts/generate_frontend_contract.sh` lấy schema qua recipes container và sinh type.
Nếu chạy Spring trực tiếp, đặt `API_SCHEMA_URL=http://127.0.0.1:8080/v3/api-docs` trước lệnh.
Probe liveness chỉ phản ánh process; `/api/health` kiểm tra cả hai AI đúng version,
không inference, cache dependency một giây. Không expose Actuator debug/config.

## Giới hạn và kiểm thử

Guard giữ tối đa bốn request nghiệp vụ, gồm thời gian nhận body; quá tải trả ngay 503. Body vision tối đa 11 MiB, từng file 10 MiB; search 8 KiB, kể cả chunked. Servlet nonblocking nhận body với deadline tổng 15 giây cho upload/năm giây cho JSON, đọc trong RAM, không tạo file tạm. Multipart chỉ nhận đúng một trường file JPEG/PNG. Decode/pixel/frame/bomb checks do vision thực hiện; backend không giải mã ảnh lần hai. Tomcat HTTP connections/accept queue cũng được chặn ở mức hữu hạn; health không giữ slot AI.

JUnit dùng cổng HTTP thật và dependency server giả lập để kiểm tra lỗi, version, deadline, response quá lớn, request ID, strict JSON, upload chunked, ngắt kết nối, quá tải, nguồn URL và readiness. Fixture prediction dùng chung với Phase 1; corpus test lấy trực tiếp file Phase 2, không chép một bản dữ liệu khác. Smoke Compose riêng kiểm chứng CV thật → chọn ứng viên thứ hai → tìm/detail, đủ 30 món, dừng/khởi động AI, AI network internal, một lượt toàn luồng khi tháo browser bridge của backend, non-root/read-only và probe. Fault injection không được tính vào metric retrieval.

Trong Phase 3, type frontend được sinh tự động từ OpenAPI; UI tích hợp và nghiệm thu với backend thật ở Phase 4. App Expo là client riêng đã tích hợp qua PR #17; không tạo APK.
