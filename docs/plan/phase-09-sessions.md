# Phase 9 — Phiên và điều khiển bước nấu

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 8](phase-08-foundation.md).

## Mục tiêu

Backend quản lý phiên và bước nấu chính xác, không phụ thuộc LLM để chuyển bước.

## Thực hiện

- [ ] Tạo/đọc phiên từ recipe ID hợp lệ; backend lấy công thức từ corpus và gắn version.
- [ ] Lưu SQLite trong volume backend, có schema/version và quyền ghi cho user non-root.
- [ ] Triển khai bắt đầu, tiếp, trước, nhắc lại, kết thúc; thống nhất index API/UI.
- [ ] Giới hạn bước đầu/cuối, tuổi phiên và kích thước lịch sử; xử lý phiên mất/hết hạn.
- [ ] Xử lý request trùng, đồng thời và version state; đổi công thức tạo phiên mới.
- [ ] Bổ sung controller/DTO/OpenAPI và type/client dùng chung, giữ envelope/request ID.

## Kiểm thử

- [ ] Unit tests cho mọi action, trạng thái kết thúc và các biên bước.
- [ ] Integration tests với SQLite thật: database mới, đọc/ghi, hết hạn và khôi phục sau restart.
- [ ] Hai phiên hoạt động song song không trộn công thức, bước hoặc hội thoại.
- [ ] Gửi trùng/đồng thời không làm tăng bước hai lần hoặc ghi đè state mới.
- [ ] Recipe ID sai/không có/version không phù hợp trả lỗi rõ; không nhận recipe giả từ client.
- [ ] Chạy backend/client contract tests và kiểm tra type sinh lại không lệch API.

## Điều kiện hoàn thành

- [ ] Phiên/bước hoạt động và lưu bền vững, kể cả khi chưa cấu hình API LLM.
- [ ] Tests qua, PR/CI tích hợp; sẵn sàng cho [Phase 10](phase-10-llm.md).

## Kết quả kiểm tra
