# Kế hoạch xử lý độ tin cậy LLM Assistant (#28, #29)

Người nhận: `tung51652-alt`
Phạm vi issue:
- [#28](https://github.com/tung51652-alt/Cooking-assistant/issues/28): `[Backend/LLM] Từ chối phản hồi hợp lệ khi chạm max_tokens hoặc total_tokens có reasoning_tokens`
- [#29](https://github.com/tung51652-alt/Cooking-assistant/issues/29): `[Assistant/Backend] Thiếu retry khi LLM provider trả về 503 tạm thời và UI không hiện nút thử lại`

Tài liệu liên quan: [WORKFLOW.md](../WORKFLOW.md), [phase-10-llm.md](phase-10-llm.md), [mvp-v1.md](../contracts/mvp-v1.md).

## 1. Bối cảnh và nguyên nhân gốc rễ đã kiểm chứng

### 1.1. Từ chối nhầm phản hồi hợp lệ của Gemini (#28)

Trong `backend/src/main/java/com/cooklens/client/OpenAiChatProvider.java`:
- Dòng 39 đặt `reasoning_effort = "minimal"` cho `gemini-3.1-flash-lite`, nhưng endpoint OpenAI-compatible của Gemini vẫn có thể phát sinh `reasoning_tokens` (thoughts tokens) và cộng vào `total_tokens`.
- Dòng 105 kiểm tra `input + output != total`; khi có `reasoning_tokens > 0`, `prompt_tokens + completion_tokens < total_tokens`, khiến `usage()` ném `ASSISTANT_PROVIDER_UNAVAILABLE` (HTTP 503) dù câu trả lời hoàn toàn hợp lệ.
- Dòng 90 bắt buộc `finish_reason` phải bằng `"stop"`, từ chối `"length"`; dòng 94 từ chối nếu `usage.outputTokens() > config.maxOutputTokens()`.
- Khi bị từ chối ở bước đọc response, `AssistantService.message()` vẫn ghi bản ghi thất bại vào `session_operations` và `llm_calls` (`status='unknown'`), đồng thời trả HTTP 503 cho người dùng.

### 1.2. Thiếu retry tạm thời và UX thử lại trên Web (#29)

- **Backend (`OpenAiChatProvider.java` dòng 65–73)**: mọi mã HTTP `!= 200` (ngoài `401`, `403`, `429`, `402`) đều lập tức ném `503 ASSISTANT_PROVIDER_UNAVAILABLE`, không có retry cho lỗi tạm thời `502`/`503` từ upstream.
  Khi kiểm thử luồng người dùng thực tế với `gemini-3.1-flash-lite`, lỗi `503` xảy ra thoáng qua và request ngay sau đó thành công (HTTP 200).
- **Ràng buộc deadline và idempotency (`AssistantService.java` dòng 255, 322)**:
  - Timeout phía provider trong `LlmSettings` tối đa 20 s, deadline `pending` trong `AssistantService` là 25 s, và `proxy_read_timeout` ở `frontend/nginx/nginx.conf` cho `/api/assistant/` là 25 s.
  - Khi backend đã trả về `503 ASSISTANT_PROVIDER_UNAVAILABLE`, `failMessage()` đã chốt `session_operations.status = 'failed'`.
    Nếu client gửi lại **cùng `operation_id`**, `replayMessage()` ở dòng 322 sẽ trả lại ngay lỗi `503` đã lưu mà không gọi lại LLM.
- **Frontend Web vs Mobile**:
  - `mobile/src/assistant/session-controller.ts` (dòng 192–215) đã tách rõ: lỗi không rõ kết quả (`uncertainMessage`) giữ `pending` để kiểm tra phiên / retry cùng `operation_id`, còn lỗi provider dứt khoát (`ASSISTANT_PROVIDER_UNAVAILABLE`) xóa `pending` để lượt gửi tiếp theo dùng `operation_id` mới trong khi giữ nguyên `draft`.
  - `frontend/src/features/AssistantPage.tsx` (dòng 60, 131–135) giữ đúng `draft`, và chỉ gán `retry` (cùng `operation_id`, nút `"Thử lại yêu cầu"`) khi mất kết nối hoặc `ASSISTANT_REQUEST_IN_PROGRESS` (đã khóa bởi `frontend/tests/assistant.spec.ts` dòng 105–117).
    Tuy nhiên banner lỗi trên Web chưa có nút thao tác trực tiếp để gửi lại bằng `operation_id` mới khi gặp `ASSISTANT_PROVIDER_UNAVAILABLE`, `ASSISTANT_PROVIDER_TIMEOUT` hoặc `ASSISTANT_RATE_LIMITED`.

## 2. Quyết định thiết kế cần chốt trước khi sửa code

1. **Chính sách với `finish_reason: "length"` (#28)**:
   - Không bật streaming hoặc tự động gọi nối tiếp (vượt trần `max_output_tokens = 512` và ngân sách `ChatPricing`).
   - Có hai hướng cần chọn dứt khoát ở Bước 1:
     - **Hướng đề xuất**: chấp nhận phản hồi `finish_reason: "length"` nếu `content` không rỗng, không chứa `tool_calls`/`refusal`, nằm trong giới hạn độ dài `<= 16384`, và kèm ghi chú ngắn ở cuối (hoặc chỉ giữ nguyên text hợp lệ) để người dùng đọc được câu trả lời thay vì mất trắng và vẫn tốn token.
       Nếu muốn an toàn cao nhất cho câu trả lời bị cắt giữa chừng, kiểm tra lại `ChatContextBuilder` (hiện prompt yêu cầu trả lời gọn 2–5 câu/ý) để hạn chế chạm 512 tokens.
     - **Hướng thay thế**: giữ từ chối `"length"` nếu lo ngại câu trả lời cụt ý gây hiểu nhầm định lượng/an toàn, nhưng trả thông báo lỗi rõ ràng hơn (hoặc nâng nhẹ hướng dẫn ngắn gọn trong `ChatContextBuilder`).
2. **Chính sách đếm token có `reasoning_tokens` (#28)**:
   - Cho phép `total_tokens >= prompt_tokens + completion_tokens` (từ chối khi `total_tokens < prompt_tokens + completion_tokens`, vì `total_tokens` luôn phải bao trùm ít nhất `input + output`).
   - Đọc thêm `completion_tokens_details.reasoning_tokens` (nếu có và không âm) để kiểm tra tính nhất quán: nếu provider có báo `reasoning_tokens`, xác minh `input + output <= total` (và nếu `total` khác `input + output`, không coi là malformed usage khi `input + output < total`).
   - Giữ nguyên `Usage(inputTokens, outputTokens)` để `ChatAdmission.settle()` không làm vỡ schema `llm_calls` hoặc `PersistedSessionValidator`; kiểm tra lại xem Gemini tính phí thinking tokens theo output rate hay tách riêng (để ghi chú rõ trong `ChatPricing` nếu cần).
3. **Chính sách bounded retry ở `OpenAiChatProvider` (#29)**:
   - Chỉ retry trong **1 lần gọi `complete()`** (tức nằm trong 1 `reserve` / `settle` duy nhất ở `AssistantService`, không tạo thêm dòng `llm_calls`).
   - Dùng **1 deadline chung** tính từ lúc vào `complete()`: `deadline = Instant.now().plus(config.timeout())`.
   - Chỉ retry tối đa **1 lần** (tổng tối đa 2 attempts) và **chỉ** cho các lỗi tạm thời an toàn: HTTP `502`, HTTP `503`, hoặc `ConnectException` trước khi gửi xong request.
   - Không retry với `400`, `401`, `402`, `403`, `404`, `422`, `429`, response body sai định dạng, model mismatch, hoặc `HttpTimeoutException`.
   - Trước khi ngủ backoff (ví dụ `300 ms`) và gửi attempt thứ 2, kiểm tra thời gian còn lại tới `deadline` phải đủ tối thiểu `>= 2000 ms`; mỗi HTTP request dùng `Duration.between(Instant.now(), remainingDeadline)` làm timeout để tổng thời gian không bao giờ vượt `config.timeout()` (tối đa 20 s, an toàn dưới trần 25 s của `AssistantService` và Nginx).
4. **Hành vi UI trên Web và Mobile (#29)**:
   - Giữ nguyên semantics idempotent của nút `"Thử lại yêu cầu"` (`retry` giữ cùng `operation_id`) cho lỗi chưa rõ kết quả (`!known?.code`, `ASSISTANT_REQUEST_IN_PROGRESS`, `ASSISTANT_STORAGE_UNAVAILABLE`).
   - Thêm nút riêng `"Gửi lại câu hỏi"` trên banner lỗi của `AssistantPage.tsx` khi gặp lỗi provider đã chốt (`ASSISTANT_PROVIDER_UNAVAILABLE`, `ASSISTANT_PROVIDER_TIMEOUT`, `ASSISTANT_RATE_LIMITED`), miễn `draft.trim()` còn nội dung và phiên chưa đóng; bấm nút này gọi `send()` để tạo `operation_id` mới (không vi phạm assertion `Thử lại yêu cầu` = 0 trong `frontend/tests/assistant.spec.ts`).
   - Kiểm tra đồng bộ `mobile/src/assistant/CookingSessionScreen.tsx` & `session-controller.ts`: xác nhận khi gặp 503 `ASSISTANT_PROVIDER_UNAVAILABLE`, người dùng có thể bấm gửi lại hoặc thấy nút gửi lại rõ ràng mà không phải xóa/nhập lại câu hỏi.

## 3. Kế hoạch triển khai từng bước

### Bước 1 — Chốt hành vi chi tiết và cập nhật test contract

- [x] Xác nhận phương án xử lý `finish_reason: "length"` (chấp nhận phản hồi hợp lệ không rỗng khi chạm ngưỡng độ dài).
- [x] Kiểm tra response thực tế của `gemini-3.1-flash-lite` khi chạm `max_tokens` (`finish_reason: "length"`, `usage` gồm `completion_tokens`, `prompt_tokens`, `total_tokens`).
- [x] Liệt kê đầy đủ và cập nhật các unit test cũ trong `OpenAiChatProviderTest.java` và `AssistantJvmRestartTest.java`.

### Bước 2 — Sửa `OpenAiChatProvider.java` và test backend (#28, #29)

- [x] **Usage validation (`OpenAiChatProvider.usage`)**:
  - Sửa điều kiện `input + output != total` thành `input + output > total` (cho phép `total_tokens >= prompt_tokens + completion_tokens` khi có `reasoning_tokens`).
  - Bổ sung kiểm tra `completion_tokens_details.reasoning_tokens` (nếu có: số nguyên không âm) và giữ bảo toàn `Usage(input, output)` khi tính `outputLimit`.
- [x] **`finish_reason` & `output_tokens` (`OpenAiChatProvider.complete`)**:
  - Chấp nhận `finish_reason` thuộc `{"stop", "length"}` khi `content` không rỗng và hợp lệ.
  - Tính `outputLimit` có cộng `reasoning_tokens` nếu provider tính gộp vào `completion_tokens`, giữ chặn `output-limit` khi không có `reasoning_tokens`.
- [x] **Bounded retry trong deadline (`OpenAiChatProvider.complete`)**:
  - Tách `sendAttempt` dùng `remainingMs` theo `deadlineNanos` chung (`config.timeout()`).
  - Retry tối đa 1 lần cho HTTP `502`, `503` hoặc `ConnectException` khi còn đủ cửa sổ thời gian (`> RETRY_BACKOFF_MS + MIN_RETRY_WINDOW_MS`).
- [x] **Cập nhật `OpenAiChatProviderTest.java`**:
  - Đã kiểm chứng cả `total_tokens > input + output`, `finish_reason: "length"`, `503 -> 200` retry recovery, skip retry khi hết cửa sổ deadline, và không retry cho `401`/`402`/`403`/`404`/`422`/`429`/`500` (16/16 pass).

### Bước 3 — Kiểm tra `AssistantService` và `AssistantChatIntegrationTest`

- [x] Xác nhận `AssistantService.message()` giữ đúng 1 lần `reserve` và 1 lần `settle` khi `OpenAiChatProvider` retry nội bộ (`AssistantJvmRestartTest` kiểm chứng 20 upstream calls / 12 dòng `llm_calls`).
- [x] Chạy toàn bộ suite backend qua `maven:3.9.11-eclipse-temurin-21`: 79/79 tests pass (`0 Failures, 0 Errors, 0 Skipped`).

### Bước 4 — Cập nhật Web UI & đối chiếu Mobile (#29)

- [x] **Web (`frontend/src/features/AssistantPage.tsx`)**:
  - Giữ nút `"Thử lại yêu cầu"` cho lỗi chưa rõ kết quả (`retry` giữ nguyên `operation_id`).
  - Thêm nút `"Gửi lại câu hỏi"` gọi `send()` (`operation_id` mới với `draft` đang giữ) cho `ASSISTANT_PROVIDER_UNAVAILABLE`, `ASSISTANT_PROVIDER_TIMEOUT`, `ASSISTANT_RATE_LIMITED`.
- [x] **Web tests (`frontend/tests/assistant.spec.ts`)**:
  - Bổ sung test kiểm tra nút `"Gửi lại câu hỏi"` tạo `operation_id` mới sau 503 và xóa `draft` khi thành công; Playwright `flow.spec.ts` + `assistant.spec.ts` đạt 46/46 trên desktop và mobile.
- [x] **Mobile (`mobile/src/assistant/session-controller.ts`, `CookingSessionScreen.tsx`)**:
  - Đối chiếu xác nhận Mobile đã phân biệt lỗi không rõ kết quả vs lỗi provider dứt khoát và giữ `draft` inline ngay bên trên nút `"Gửi câu hỏi"`; `npm --prefix mobile run test:assistant` đạt 22/22, `typecheck` pass.

### Bước 5 — Kiểm thử end-to-end với stack thật và hoàn tất

- [x] Build lại `cooklens-backend:local` và `cooklens-frontend:local` và khởi động stack local với `HOST_BIND=0.0.0.0`.
- [x] Kiểm thử `/messages` với Gemini API thật (trả HTTP 200, nội dung 1.196 ký tự) và chạy Playwright thật (`COOKLENS_REAL_API=1 COOKLENS_REAL_ASSISTANT=1`) 2/2 pass trên desktop và mobile (`real-flow.spec.ts` các ca `out-of-domain`/`multiple-dish` skip theo điều kiện fixture mặc định, 6/6 ca chạy đều pass).
- [x] Chạy `python3 deploy/scripts/check_public_metadata.py` (`PASS`).
- [ ] Commit, tạo PR đóng `#28` và `#29` sau khi người dùng review diff.

## 4. Tiêu chí nghiệm thu (Definition of Done)

- [x] Không còn từ chối 503 oan khi Gemini trả `total_tokens > prompt_tokens + completion_tokens` do `reasoning_tokens`, hoặc khi `finish_reason: "length"` với nội dung hợp lệ.
- [x] Lỗi `502`/`503` thoáng qua ở upstream tự phục hồi được trong tối đa 1 lần retry mà vẫn tuân thủ chặt deadline `config.timeout()` và không nhân đôi ledger `llm_calls`.
- [x] Trên Web và Mobile, khi vẫn rớt xuống 503/timeout, người dùng không mất câu hỏi đang nhập và có nút gửi lại trực tiếp bằng `operation_id` mới (không nhầm lẫn với nút replay `operation_id` cũ).
- [x] Toàn bộ test suites backend (`79/79`), shared API (`14/14`), frontend (`npm run build`, Playwright `46/46` + real assistant `2/2`), mobile (`typecheck`, `22/22`), và metadata check (`check_public_metadata.py`) đều pass.
