# Kế hoạch làm việc

Bắt đầu từ [lộ trình MVP](mvp.md): Phase 8–14, mỗi phase một file Markdown và có checklist thực hiện, kiểm thử, điều kiện hoàn thành.
Thực hiện theo thứ tự phụ thuộc. [assistant.md](assistant.md) mô tả chung phạm vi và thiết kế trợ lý, không thay checklist từng phase.
Quy trình và quyền chạy kiểm thử/Git theo [WORKFLOW.md](../WORKFLOW.md).

## Cách cập nhật

- Kế hoạch phase dùng tên `phase-NN-chu-de.md`; công việc độc lập dùng `YYYY-MM-DD-chu-de.md`.
- Đánh dấu `[x]` khi có kiểm tra thực tế; lỗi hoặc thiếu đầu vào giữ `[ ]` và ghi rõ.
- Ghi kết quả, PR/CI và giới hạn ngắn ở cuối phase; số đo tổng hợp ở `acceptance.md`.
- Không chép cùng checklist vào nhiều file, không lưu secret, raw log hoặc output build.
- Chưa chốt provider/model/ngưỡng/thiết bị thì để trống tới phase quyết định tương ứng.
