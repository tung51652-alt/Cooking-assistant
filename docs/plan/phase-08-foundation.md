# Phase 8 — Chốt nền tảng và contract

Trạng thái: triển khai local phần contract/nền SQLite; chưa đóng.
Đã kiểm chứng source/backend/client; Docker runtime sau tổ chức lại chưa kiểm chứng.
Đầu vào: bản ảnh/công thức và [thiết kế trợ lý](assistant.md).

## Mục tiêu

Có nền chạy ổn định và contract rõ ràng trước khi triển khai trợ lý.

## Thực hiện

- [ ] Rà, tích hợp phần docs/Docker đang sửa và kết quả nghiệm thu ảnh/công thức; xử lý PR còn mở.
- [x] Giữ một `compose.yaml`, project `cooklens`, Dockerfile từng phần và image có sẵn.
- [x] Chốt request/response cho tạo/đọc phiên, messages, actions và lỗi; giữ API cũ tương thích.
- [x] Chốt action, quy tắc bước đầu/cuối, đổi recipe, gửi trùng và response muộn.
- [x] Chốt SQLite/schema, recipe version gắn phiên, tuổi phiên và giới hạn lịch sử/body.
- [ ] Chọn provider/model đầu tiên, timeout, giới hạn output và ngân sách gọi API thật.
- [ ] Chốt hệ điều hành/thiết bị Expo bàn giao; chốt bộ tình huống, kỳ vọng từng ca, số mẫu và ngưỡng latency/usage của trợ lý trước khi đo.

## Kiểm thử

- [x] Chạy deploy/data tests, build web và kiểm tra contract client hiện tại.
- [ ] Bật Docker, chạy `docker compose up`; kiểm tra readiness và luồng ảnh → recipe → detail.
- [ ] Kiểm tra seed mới, restart giữ index và chỉ cổng web được publish.
- [x] Đối chiếu từng route/action với tình huống hợp lệ, lỗi và yêu cầu bảo toàn state.
- [ ] Rà link tài liệu, diff, secrets và đầu vào artifact; không dùng số đo cũ thay test mới.

## Điều kiện hoàn thành

- [ ] Nền Docker chạy thật, hồi quy cũ qua; contract và các giới hạn đã ghi rõ.
- [ ] Provider/model và phạm vi mobile đã chốt; key được cấu hình riêng, không ghi vào plan/Git.
- [ ] PR/CI đã review và tích hợp; đủ đầu vào cho [Phase 9](phase-09-sessions.md).

## Quyết định cần chốt

Provider/model:

Chờ người dùng chốt; không tự chọn provider, key hoặc gọi dịch vụ trả phí.

Giới hạn phiên, request và ngân sách:

Phiên 24 giờ cố định, tối đa 100 action (slot cuối dành cho kết thúc), tối đa 10.000 record.
SQLite schema 1, snapshot recipe/corpus version; body 8 KiB, nhận JSON trong 5 s, 4 request nghiệp vụ/instance.
Message không blank, tối đa 2.000 UTF-16 code units; chưa gửi ra provider hoặc lưu hội thoại trong Phase 9.
Quy tắc đầy đủ ở [contract](../contracts/mvp-v1.md#phiên-trợ-lý-phase-89).
Timeout/output/ngân sách gọi LLM thật và ngưỡng latency/usage còn chờ quyết định cùng provider.

Nền tảng/thiết bị mobile:

Chờ người dùng chốt; không dùng browser mobile emulation để thay bằng chứng thiết bị thật.

## Kết quả kiểm tra

2026-11-22: đã đọc toàn bộ 46 Markdown và fixture trong docs trước khi sửa.
PR mở hướng về develop còn #4 (`hung/rag`, notebook RAG), ngoài scope; không sửa hoặc merge PR này.
Contract trợ lý, DTO/controller/OpenAPI và type/client chung đã đồng bộ; API ảnh/công thức giữ nguyên.
`python -X utf8 -m unittest discover -s deploy/tests -q`: 31 ca, 3 skip theo suite; data: 7/7 qua.
Lệnh Python mặc định ban đầu lỗi cp1252 trên Windows; chạy chế độ UTF-8 qua, không sửa test/config hoặc code ngoài scope.
Client regression 9/9, web build/typecheck, corpus validation 33 recipe/30 món, public metadata scanner và frontend bundle check đều qua.
`npm --prefix frontend run test:e2e`: 20/20 qua sau khi cài Chromium đúng phiên bản Playwright; không sửa test/config.
Đã rà 40 link file nội bộ trong tài liệu thay đổi, không có đích thiếu; diff không có test/snapshot hay secrets.
Kiểm chứng HTTP backend/SQLite thật với upstream recipe giả lập ghi tại [Phase 9](phase-09-sessions.md#kết-quả-kiểm-tra).
Môi trường Windows: Maven 3.9.11 tạm, JDK 24 biên dịch target 21, Node 22.18, Python 3.14.
Chưa có Docker executable nên không chạy Compose/readiness/seed mới/restart index và luồng AI thật.
Artifact manifest/provenance đã đọc; chưa có kiểm chứng build/runtime model trong lần này.
Không dùng số đo nghiệm thu cũ thay thế lần kiểm chứng này.
Provider/model/ngân sách, thiết bị Expo và tiêu chí đánh giá LLM vẫn chờ quyết định; PR/CI/tích hợp chưa thực hiện trong phạm vi bàn giao.
