# Sản phẩm

## Mục tiêu

Giúp người dùng xác định một món Việt trong ảnh, tìm công thức có nguồn và giấy phép rõ ràng,
rồi hỏi đáp và nấu theo từng bước với trợ lý.

## Luồng sử dụng

1. Chụp hoặc chọn ảnh món ăn; nếu đã biết tên món, chọn trực tiếp trong danh mục 30 món.
2. Xem tối đa ba gợi ý và xác nhận một món.
   Ảnh mờ hoặc có điểm cao nhất dưới 65% không có gợi ý; người dùng đổi ảnh hoặc chọn món theo tên.
3. Màn hình Trợ lý hiện tối đa ba công thức của món đã xác nhận, có thể lọc theo nguyên liệu hoặc cách nấu.
4. Xem chi tiết công thức, hỏi đáp theo công thức đang chọn hoặc bắt đầu nấu từng bước.
   Phiên nấu được lưu 24 giờ và mở lại được sau khi tải lại trang hoặc mở lại app.

## Phạm vi hiện có

| Thành phần | Khả năng |
| --- | --- |
| Web | Responsive desktop/mobile; nhận diện, chọn món, công thức, hỏi đáp và bước nấu |
| Expo Go | Chụp/chọn ảnh và cùng luồng với web qua API dùng chung |
| Nhận diện | EfficientNet-B2, 30 lớp món Việt, trả Top-3 kèm confidence |
| Công thức | Corpus `cooklens-recipes-v3`: 90 công thức cho 30 món, gồm 42 từ Wikibooks, 37 từ nguồn tiếng Việt khác và 11 công thức có nhãn AI |
| Trợ lý | Hỏi đáp theo công thức đã chọn qua Gemini; năm nút bước nấu chạy bằng logic ứng dụng |
| Triển khai | Một Docker Compose; model, corpus và vector nằm trong image |

Bản phát hành `2.0.0` dùng corpus v1 với 33 công thức và luồng công thức → trợ lý tách màn hình.
Corpus v3, màn hình Trợ lý gộp và ngưỡng 65% có trên `develop`, chuẩn bị cho `2.1.0`.

## Giới hạn

- Ảnh JPG/PNG tối đa 10 MiB và 25 triệu pixel; một món chính trong ảnh.
- Confidence không xác nhận món và không phát hiện chắc chắn ảnh ngoài danh mục.
- Nguyên liệu lấy từ công thức đã chọn, không suy ra từ pixel.
- Không tạo thêm kết quả cho đủ ba; giá trị thiếu như thời gian/khẩu phần giữ `null`.
- Server không lưu ảnh; phiên nấu (snapshot công thức, bước, hội thoại) lưu 24 giờ trong SQLite.
- Không có tài khoản hoặc lịch sử dài hạn.
- Trợ lý cần key Google AI Studio ở backend; Gemini có thể bị rate limit hoặc timeout.
  Thiếu key hoặc provider lỗi, ảnh, công thức và nút bước nấu vẫn dùng được.
- Trợ lý không tự chuyển bước theo lời model và không bảo đảm an toàn dị ứng.
- Android thật và iOS chưa được nghiệm thu đầy đủ.
- Ngoài phạm vi: thay nguyên liệu phức tạp, đổi khẩu phần, giọng nói, tìm kiếm web, APK/store và thử nấu.

Số đo ở [acceptance.md](acceptance.md).
