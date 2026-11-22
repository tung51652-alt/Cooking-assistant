# Trợ lý trò chuyện và hướng dẫn nấu ăn

## Mục tiêu và trạng thái

Bổ sung vào phạm vi MVP theo yêu cầu người dùng ngày 2026-11-22.
Source có API phiên/bước nấu, hội thoại schema 3 và `/messages` đã nối provider/context/admission/accounting, kiểm chứng với HTTP provider giả.
Ba smoke Linux container đã qua trên Docker Desktop với backend/frontend build từ source.
Baseline Ultra không đạt latency; candidate Super đã qua 50/50 HTTP/state, latency, usage và restart/replay.
Đã có form review local, human quality review và PR/CI còn mở; chưa nghiệm thu chất lượng hội thoại.
Web Phase 11 đã triển khai và qua flow local desktop/mobile với provider thật; trợ lý Expo chưa triển khai.
Thiếu key/config/pricing hợp lệ thì không gửi câu hỏi ra ngoài; cooking commands vẫn hoạt động.
Image `2.0.0-rc.2` chưa có phần mở rộng trợ lý này.
Luồng đích: ảnh → xác nhận món → chọn công thức → hỏi đáp và hướng dẫn từng bước.
Dùng API LLM có sẵn, không huấn luyện/chạy model hội thoại local.

## Chức năng MVP

| Chức năng | Hành vi |
| --- | --- |
| Hỏi đáp | Giải thích nguyên liệu, thao tác và bước nấu của công thức đang chọn |
| Hướng dẫn | Bắt đầu, bước tiếp/trước, nhắc lại và kết thúc; hiện bước hiện tại/tổng số bước |
| Giữ phiên | Tiếp tục đúng công thức và bước khi tải lại trang hoặc backend restart |

Bắt đầu từ công thức có trong corpus.
Thay nguyên liệu phức tạp, đổi khẩu phần, giọng nói và tìm kiếm web để sau MVP; không dùng chúng làm điều kiện bàn giao đợt này.

## Kết nối model

Backend Spring hiện có gọi API qua một interface `ChatProvider`; adapter chuyển request/response theo từng nhà cung cấp.
Chỉ một provider được chọn tại một thời điểm.
Bắt đầu với một adapter chạy thật; giữ cùng interface để thêm/đổi Gemini, OpenAI hoặc Anthropic.
Không yêu cầu cài hoặc có key của cả ba để dùng MVP.

| Cấu hình backend | Ý nghĩa |
| --- | --- |
| `LLM_PROVIDER` | Hiện hỗ trợ `openai` (Chat Completions tương thích OpenAI); adapter Gemini/Anthropic chưa triển khai |
| `LLM_BASE_URL` | Base URL endpoint đã chọn; mặc định NVIDIA, không tự đổi khi lỗi |
| `LLM_MODEL` | Model ID hợp lệ của provider được chọn; không hardcode vào UI |
| `LLM_API_KEY` | Key chỉ cấp cho backend qua biến môi trường, không đưa vào Git/client/log |
| `LLM_TIMEOUT_SECONDS`, `LLM_MAX_OUTPUT_TOKENS` | Giới hạn thời gian và độ dài phản hồi |
| `LLM_MAX_INPUT_TOKENS` | Trần estimated input cho admission, không phải tokenizer/billing count |

Provider/model đầu tiên là NVIDIA Nemotron 3 Ultra qua adapter `openai`, ID `nvidia/nemotron-3-ultra-550b-a55b`.
Đã đối chiếu [model/endpoint](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) và [API reference](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/apireference) ngày 2026-11-22 (+07), đã chạy baseline API thật cùng ngày.
Ngân sách Phase 8 cảnh báo $5/chặn $10 mỗi tháng UTC đã có ledger/admission bền vững.
Pricing runtime hiện chỉ cho phép trial NVIDIA đúng endpoint/model đã đối chiếu; chưa bật call trả phí hoặc adapter Anthropic/Gemini.
Người dùng đã giao chọn đường hoàn thành nhanh nhất; runtime local chọn Super trên cùng endpoint/key, giữ Ultra/Bolt cho rollback và không đổi ngưỡng nghiệm thu.
Không tự chuyển provider khi lỗi.
Đối chiếu API/SDK chính thức khi triển khai: [Gemini](https://aistudio.google.com/docs/get-started), [OpenAI](https://developers.openai.com/api/docs/quickstart), [Anthropic](https://platform.claude.com/docs/en/api/overview).

## Xử lý và trạng thái

- Backend lấy recipe theo ID từ corpus, gửi công thức, bước hiện tại và lịch sử hội thoại có giới hạn cho LLM.
  Không tin nội dung recipe/state do client tự khai; không gửi ảnh gốc cho API chat.
- Chuyển bước bằng logic ứng dụng, không phụ thuộc câu trả lời của model.
  Nếu nhận lệnh chuyển bước qua chat, chỉ cập nhật sau khi ánh xạ/kiểm tra action hợp lệ; không vượt bước đầu/cuối.
- Công thức gốc là nguồn chuẩn.
  Gợi ý bổ sung phải ghi rõ; thiếu dữ kiện thì hỏi lại, không tự tạo nguồn, định lượng hoặc thời gian như thể có trong công thức.
- SQLite một file trong volume backend lưu phiên, không thêm container database.
  State tối thiểu: session ID khó đoán, recipe ID/version, bước hiện tại, trạng thái, hội thoại và thời điểm cập nhật.
- Client giữ ID phiên để khôi phục; đổi công thức tạo phiên mới.
  Cần giới hạn độ dài/tuổi phiên, xử lý lệnh gửi trùng và chặn response muộn thay đổi phiên/bước mới.

## API và giao diện dự kiến

| Route dưới `/api/assistant` | Trách nhiệm |
| --- | --- |
| `POST /sessions` | Tạo phiên từ recipe ID đã chọn |
| `GET /sessions/{id}` | Đọc lại công thức, hội thoại và bước hiện tại |
| `POST /sessions/{id}/messages` | Gửi câu hỏi, nhận câu trả lời gắn với đúng phiên/công thức |
| `POST /sessions/{id}/actions` | Bắt đầu, chuyển bước, nhắc lại hoặc kết thúc |

Web và Expo dùng chung contract/client, có khung chat và nút điều khiển bước.
Backend cần kết nối ra API provider; không mở cổng AI/Qdrant.
Vẫn một project `cooklens` và `docker compose up`; cấu hình key/model tại backend trước khi dùng chat.
Thiếu key, timeout hoặc hết hạn mức chỉ ảnh hưởng trợ lý; luồng ảnh/công thức vẫn dùng được.

## Triển khai và nghiệm thu

Theo [lộ trình Phase 8–14](mvp.md); checklist, phụ thuộc và kết quả ghi trong từng file phase.
Provider/model, giới hạn phiên, ngưỡng đo và phạm vi thiết bị được chốt ở [Phase 8](phase-08-foundation.md).
Tài liệu này giữ thiết kế chung; không đánh dấu tính năng đã hoàn thành theo kế hoạch.
