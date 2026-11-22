# Phase 8 — Chốt nền tảng và contract

Trạng thái: chưa đóng.
Đã có cấu trúc docs/Docker mới; runtime sau tổ chức lại chưa kiểm chứng.
Đầu vào: bản ảnh/công thức và [thiết kế trợ lý](assistant.md).

## Mục tiêu

Có nền chạy ổn định và contract rõ ràng trước khi triển khai trợ lý.

## Thực hiện

- [ ] Rà, tích hợp phần docs/Docker đang sửa và kết quả nghiệm thu ảnh/công thức; xử lý PR còn mở.
- [ ] Giữ một `compose.yaml`, project `cooklens`, Dockerfile từng phần và image có sẵn.
- [ ] Chốt request/response cho tạo/đọc phiên, messages, actions và lỗi; giữ API cũ tương thích.
- [ ] Chốt action, quy tắc bước đầu/cuối, đổi recipe, gửi trùng và response muộn.
- [ ] Chốt SQLite/schema, recipe version gắn phiên, tuổi phiên và giới hạn lịch sử/body.
- [ ] Chọn provider/model đầu tiên, timeout, giới hạn output và ngân sách gọi API thật.
- [ ] Chốt hệ điều hành/thiết bị Expo bàn giao; chốt bộ tình huống, kỳ vọng từng ca, số mẫu và ngưỡng latency/usage của trợ lý trước khi đo.

## Kiểm thử

- [ ] Chạy deploy/data tests, build web và kiểm tra contract client hiện tại.
- [ ] Bật Docker, chạy `docker compose up`; kiểm tra readiness và luồng ảnh → recipe → detail.
- [ ] Kiểm tra seed mới, restart giữ index và chỉ cổng web được publish.
- [ ] Đối chiếu từng route/action với tình huống hợp lệ, lỗi và yêu cầu bảo toàn state.
- [ ] Rà link tài liệu, diff, secrets và đầu vào artifact; không dùng số đo cũ thay test mới.

## Điều kiện hoàn thành

- [ ] Nền Docker chạy thật, hồi quy cũ qua; contract và các giới hạn đã ghi rõ.
- [ ] Provider/model và phạm vi mobile đã chốt; key được cấu hình riêng, không ghi vào plan/Git.
- [ ] PR/CI đã review và tích hợp; đủ đầu vào cho [Phase 9](phase-09-sessions.md).

## Quyết định cần chốt

Provider/model:

Giới hạn phiên, request và ngân sách:

Nền tảng/thiết bị mobile:

## Kết quả kiểm tra
