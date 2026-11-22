# Sản phẩm

## Mục tiêu

Giúp người dùng xác định một món Việt trong ảnh và tìm công thức có nguyên liệu,
bước nấu, nguồn và giấy phép rõ ràng.

## Luồng sử dụng

1. Chụp hoặc chọn ảnh món ăn.
2. Xem ba dự đoán; chọn một dự đoán hoặc sửa từ danh mục 30 món.
3. Xác nhận món; tìm tối đa ba công thức, có thể thêm ưu tiên nguyên liệu/cách nấu.
4. Mở công thức để xem chi tiết và thông tin nguồn.

## Phạm vi hiện có

| Thành phần | Khả năng |
| --- | --- |
| Web | Upload, nhận diện, xác nhận/sửa món, tìm và xem công thức; responsive |
| Expo Go | Chụp/chọn ảnh, dùng chung API và luồng công thức với web |
| Nhận diện | EfficientNet-B2, 30 lớp món Việt, trả Top-3 và confidence |
| Công thức | 33 công thức phủ 30 món; 21 từ Wikibooks, 12 do AI biên soạn có gắn nhãn |
| Triển khai | Docker Compose; model, corpus và vector nằm trong image |

## Giới hạn

- Ảnh JPG/PNG tối đa 10 MiB và 25 triệu pixel; một món chính trong ảnh.
- Confidence không xác nhận món hoặc phát hiện chắc chắn ảnh ngoài miền.
- Nguyên liệu lấy từ công thức đã chọn, không suy ra trực tiếp từ pixel.
- Không tạo thêm kết quả để đủ ba; giá trị thiếu như thời gian/khẩu phần giữ `null`.
- Chưa có chatbot, hướng dẫn nấu tương tác, tài khoản hoặc lịch sử sử dụng.
- Ảnh và lựa chọn phục vụ phiên hiện tại; server không lưu ảnh hoặc hội thoại.
- Upload Expo đã được xác nhận trên một điện thoại; nghiệm thu đầy đủ Android/iOS còn mở.

## Phần bổ sung để hoàn thiện MVP

Trợ lý trò chuyện theo công thức đã chọn và hướng dẫn từng bước trên web/Expo.
Backend kết nối API Gemini, OpenAI hoặc Anthropic theo cấu hình; không chạy model chat local.
Chức năng này mới được đưa vào kế hoạch, chưa có trong bản hiện tại.
Chi tiết phạm vi và tiêu chí ở [kế hoạch trợ lý](plan/assistant.md).

Số đo phần đã có nằm trong [nghiệm thu](acceptance.md).
