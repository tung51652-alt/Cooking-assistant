# Phase 10 — Trợ lý qua API LLM

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 9](phase-09-sessions.md).

## Mục tiêu

Hỏi đáp theo công thức và bước hiện tại bằng một provider đã chọn.

## Thực hiện

- [ ] Tạo interface `ChatProvider` và adapter đầu tiên cho Gemini, OpenAI hoặc Anthropic.
- [ ] Cấu hình provider/model/key ở backend; giới hạn timeout, input, output và lịch sử.
- [ ] Gửi context từ corpus và state server; tách dữ liệu người dùng khỏi chỉ dẫn hệ thống.
- [ ] Câu trả lời gắn đúng phiên/recipe; phân biệt dữ kiện công thức với gợi ý bổ sung.
- [ ] Không tự tạo nguồn/định lượng khi thiếu dữ liệu; hỏi lại hoặc nêu giới hạn.
- [ ] Lệnh bước nấu hợp lệ gọi logic Phase 9; text model không tự ghi đè state.
- [ ] Xử lý thiếu key, provider không hỗ trợ, lỗi xác thực, 429 và timeout; không tự đổi provider.
- [ ] Cho backend kết nối ra API LLM; lỗi trợ lý không làm hỏng readiness của luồng ảnh/công thức.

## Kiểm thử

- [ ] Mock provider để kiểm tra request mapping, context, giới hạn, response lỗi/rỗng và usage.
- [ ] Kiểm tra thiếu key, 401/403/429/5xx/timeout bằng fault injection, không cố làm cạn quota thật.
- [ ] Kiểm tra request trùng/response muộn không cập nhật sai phiên, bước hoặc lịch sử.
- [ ] Chạy bộ câu hỏi đã chốt với API thật: đúng recipe/bước, thiếu dữ kiện, câu hỏi lệch ngữ cảnh.
- [ ] Chạy một hội thoại nhiều lượt thật; ghi provider/model, số mẫu, latency và usage nếu có.
- [ ] Rà không lộ key qua API, prompt, client, lỗi hoặc log; không gửi ảnh gốc cho API chat.

## Điều kiện hoàn thành

- [ ] Một provider chạy thật, các tình huống nghiệm thu đạt và kết quả được ghi trung thực.
- [ ] Không yêu cầu key/adapter của cả ba provider để đóng phase.
- [ ] Backend/client contract và hồi quy cũ qua; PR/CI tích hợp trước [Phase 11](phase-11-web.md).

## Kết quả kiểm tra
