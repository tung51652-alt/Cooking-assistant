# Phase 3 — Public gateway Spring Boot

Trạng thái: **triển khai và kiểm thử kỹ thuật hoàn tất, chờ người dùng review/merge PR Phase 3**. Nhánh feature/backend-top3-recipes tách từ develop đã chứa Phase 0–2 và PR sửa audit. Chưa bắt đầu nghiệm thu frontend Phase 4, chưa phát hành application v2.0.0 hoặc push Docker Hub.

## Phạm vi và tổ chức

Java 21/Spring Boot 3.5.16, Maven 3.9.11 trong build image, springdoc 2.9.1; code chia controller/service/client/dto/config/exception, xem [backend README](../../backend/README.md). Không khởi tạo database/JPA vì milestone không lưu tài khoản, ảnh, lịch sử hoặc state xác nhận. Không chatbot/APK; hướng Expo giữ nguyên.

API v1.0.0 hiện thực predict/dishes/search/detail/health dưới /api. OpenAPI sinh từ controller/DTO, Swagger tại /swagger-ui/index.html. Script pin openapi-typescript 7.13.0 sinh frontend/src/generated/api.d.ts; CI dựng API và sinh lại để phát hiện lệch contract. Fixture prediction dùng chung Phase 1; test đọc corpus Phase 2 trực tiếp, không thêm bản copy. Chưa thay UI sang API/type mới; đó là Phase 4.

Maven đóng gói manifest/taxonomy authoritative vào classpath, không hardcode danh mục món trong Java. Typed clients kiểm tra schema, model/corpus/embedding/taxonomy versions, Top-3/rank/tie-break, danh mục 30 món, nguồn URL và món xác nhận. Chặn confirmed_dish ngoài taxonomy trước HTTP; query trim/NFC, top_k integer thật 1–3. Search không tự đổi món; empty-result hợp lệ vẫn trả 200.

## Runtime

HTTP connect hai giây, deadline vision 15 giây/recipes năm giây; response tối đa 1 MiB kể cả chunked. Không follow redirect hoặc retry tầng ứng dụng. Kết nối không lập được/kết nối timeout trả 503 DEPENDENCY_NOT_READY; phản hồi vượt deadline trả 504 DEPENDENCY_TIMEOUT. Status/code upstream được whitelist, message public do gateway tạo; không trả message/stack/path provider. UUID request ID được chuẩn hóa/tạo mới, truyền xuyên service và trả header/envelope.

Servlet nonblocking guard giữ tối đa bốn request nghiệp vụ từ lúc nhận body đến hết response. Upload tối đa 11 MiB request/10 MiB file; JSON 8 KiB, kể cả không có Content-Length. Deadline tổng nhận body 15 giây cho upload/năm giây cho JSON. Body/file ở RAM, không tạo file tạm. Multipart chỉ nhận đúng một file JPEG/PNG; decode/pixel/frame/bomb checks tiếp tục do CV thực hiện. Ngắt kết nối/over-limit/timeout đều trả slot. Tomcat connection/accept queue hữu hạn; health không giữ slot AI.

Readiness gọi hai AI song song, kiểm tra version, deadline dưới hai giây và cache dependency state một giây, không cache request ID. Liveness chỉ kiểm tra process. Chỉ expose Actuator health; CORS mặc định trống, dev dùng allowlist cụ thể, release cùng origin qua proxy ở Phase 5.

Docker nhiều stage loại Maven/JDK/test source khỏi runtime; user 10001, read-only/tmpfs, budget 512 MiB/2 CPU. Probe dùng JDK HttpClient, không tạo Spring process thứ hai. Overlay Compose dùng recipes/init/Qdrant Phase 2, chỉ publish backend loopback. AI/Qdrant chỉ ở network internal. Backend có browser bridge để Docker publish cổng; smoke tháo bridge, chạy lại toàn luồng từ container AI rồi tạo lại backend để phục hồi Swagger. Không tuyên bố network có bridge là bị chặn Internet.

## Kiểm chứng và giới hạn

- 13 JUnit integration tests qua HTTP thật: contract/UUID, strict JSON, MIME/nhiều part/size/chunked, response hỏng/quá lớn/khác món/URL sai, version, lỗi dependency/timeout không retry, readiness/cache/liveness, bốn upload treo, client ngắt kết nối và deadline nhận body.
- [Smoke AI thật](evidence/phase-3-backend-stack.json): CV → chọn ứng viên thứ hai → search/detail; tìm đủ 30 món; dừng/phục hồi từng AI; request ID, Swagger/OpenAPI, port bindings, non-root/read-only và toàn luồng không có network ngoài. Model/corpus có trong image, không tải lúc runtime.
- Backend cgroup peak khoảng 258 MiB trong lần smoke; giữ budget 512 MiB. Đây là integration smoke với cache image/model sẵn có, không phải benchmark tải hoặc bảo đảm RAM mọi máy. Phase 5/7 tiếp tục nghiệm thu tài nguyên.
- 7 data/taxonomy và 13 transfer/public-metadata tests qua; corpus/checkpoint gốc không sửa. Type frontend sinh từ OpenAPI và được kiểm tra bằng build frontend. Scanner public metadata và whitespace phải qua trước commit.
- Corpus 33 recipe/30 món; phần lớn món có một ứng viên. Không lặp dữ liệu để đủ ba. Review công thức độc lập/thử nấu vẫn chưa thực hiện và thuộc gate Phase 7; smoke không thay thế review ẩm thực.

## Rà soát cuối phase

Bỏ placeholder backend/.gitkeep và backend/tests/.gitkeep. Giữ 13 tests hồi quy và harness có mục đích rõ; image không COPY tests/notebooks/.agent/log/env. Không commit build output, log, caches, model hoặc vector staging. Không ghi secret/token hoặc literal SHA/hash/checksum/digest vào source/tài liệu/evidence/PR; kiểm chứng transfer chỉ trong RAM theo policy.

Giữ local develop và CHANGELOG.md chưa track của người dùng; sửa ở worktree Phase 3 riêng. Không dừng/xóa volume stack Phase 2. Stack Phase 3 riêng giữ để review Swagger, có lệnh dừng đúng project trong backend README.

- [x] Public API, typed clients, validation/version, limits/errors/request ID.
- [x] OpenAPI/type frontend sinh tự động và Docker/Compose tích hợp.
- [x] Kiểm thử HTTP/AI thật, failure/recovery và toàn luồng offline.
- [x] Rà file thừa, test tạm, build output, secrets và mọi literal mã/hash bị cấm.
- [ ] Người dùng review/merge PR Phase 3; agent fetch xác nhận develop trước Phase 4.
