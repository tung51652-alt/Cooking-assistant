# Phase 11 — Trợ lý trên web

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 10](phase-10-llm.md).

## Mục tiêu

Người dùng đi từ công thức sang chat và hướng dẫn nấu ngay trên web.

## Thực hiện

- [ ] Thêm lối vào trợ lý từ recipe detail, tạo/khôi phục phiên bằng client dùng chung.
- [ ] Hiển thị chat, công thức đang chọn, bước hiện tại/tổng bước và các nút điều khiển.
- [ ] Có loading, lỗi, retry, phiên hết hạn và trạng thái trợ lý chưa được cấu hình.
- [ ] Khi đổi recipe/phiên hoặc rời màn hình, hủy/bỏ qua response cũ.
- [ ] Khôi phục phiên khi reload; chỉ giữ định danh cần thiết ở client, không giữ API key.
- [ ] Giữ tiếng Việt, responsive, keyboard/focus và cách hiển thị nguồn/gợi ý rõ ràng.

## Kiểm thử

- [ ] Playwright với API mô phỏng: tạo phiên, chat, chuyển bước, reload, hết hạn và lỗi provider.
- [ ] Kiểm tra đổi phiên khi đang chờ trả lời, double click/gửi trùng và response sai thứ tự.
- [ ] Nội dung model được hiển thị an toàn; script/HTML hoặc link nguy hiểm không thực thi.
- [ ] Desktop/mobile viewport dùng được, không overflow; thao tác bàn phím và focus đúng.
- [ ] Chạy Docker/backend/API LLM thật: ảnh → xác nhận → recipe → chat → các bước → kết thúc.
- [ ] Hồi quy upload/Top-3/search/detail hiện có vẫn qua; build và scanner client không có key.

## Điều kiện hoàn thành

- [ ] Luồng web hoàn chỉnh qua cả test lỗi có kiểm soát và API thật.
- [ ] PR/CI tích hợp; sẵn sàng cho [Phase 12](phase-12-mobile.md).

## Kết quả kiểm tra
