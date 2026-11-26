# Điều hướng công thức và khôi phục món

- [x] Cuộn lên đầu và chuyển focus về nội dung chính khi mở/đóng chi tiết.
- [x] Lưu món đã xác nhận theo tab; khôi phục danh sách từ API sau reload trang công thức hoặc quay lại từ trợ lý.
- [x] Xử lý storage hỏng/bị chặn và xóa ngữ cảnh khi đổi ảnh hoặc chọn món mới.
- [x] Compile frontend và đọc diff.

Phạm vi: frontend; không đổi API hoặc lưu ảnh/kết quả nhận diện.
Đã thêm kiểm thử hồi quy cho điều hướng, reload và storage.
TypeScript và build Vite đạt; 6 lượt E2E trên desktop và mobile 390×844 đạt với Chrome đã cài.
Sau khi cập nhật test chọn công thức khác theo luồng về thẳng danh sách, toàn bộ 62 lượt E2E desktop/mobile đạt.
