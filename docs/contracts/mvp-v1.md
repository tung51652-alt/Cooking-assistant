# Contract API v1

Nguồn schema: Spring controller/DTO sinh OpenAPI tại `/v3/api-docs`; Swagger tại
`/swagger-ui/index.html` khi truy cập gateway phát triển. TypeScript được sinh vào
[api.d.ts](../../frontend/src/generated/api.d.ts), không duy trì OpenAPI YAML riêng.

## Quy ước

- Public API dưới `/api`, JSON UTF-8, `snake_case`, `api_version: "1.0.0"`.
- Mỗi JSON public có `request_id`; header `X-Request-ID` khớp envelope. Caller UUID
  hợp lệ được truyền xuyên service; giá trị không hợp lệ được thay mới.
- Dùng taxonomy có version tại [label map](../../data/processed/30vnfoods-label-map.json):
  `class_id` 0-based, `normalized_dish` snake_case, `display_name` tiếng Việt; rank 1-based.
- Field nullable vẫn có mặt với `null`; không bịa quantity, thời gian hoặc khẩu phần.
- Không lưu ảnh hoặc trạng thái xác nhận phía server.
  Client phải xác nhận món; phiên nấu lưu riêng tại SQLite backend theo contract trợ lý dưới đây.
- Thay đổi bắt buộc/ý nghĩa hoặc xóa trường cần version và contract tests tương ứng.

## Public endpoints

| Route | Đầu vào | Kết quả HTTP 200 |
| --- | --- | --- |
| `POST /api/vision/predict` | Multipart đúng một trường `file`, JPEG/PNG | `model_version`, `taxonomy_version`, `predictions[3]` |
| `GET /api/dishes` | Không có body | `taxonomy_version`, `dishes[30]`, theo class ID |
| `POST /api/recipes/search` | `confirmed_dish`, `top_k` 1–3 (mặc định 3), `query` tùy chọn | Version corpus/embedding/taxonomy, món xác nhận và `recipes[]` |
| `GET /api/recipes/{id}` | ID `[a-z0-9][a-z0-9_-]{0,79}` | `corpus_version`, `recipe` |
| `GET /api/health` | Không có body | `status: "ready"` và trạng thái/version vision, recipes |

Các kết quả trên đều có public envelope. Ví dụ tìm công thức:

```json
{"confirmed_dish":"pho","top_k":3,"query":"bò ninh xương"}
```

## Nhận diện ảnh

File ≤10 MiB, multipart body ≤11 MiB, ảnh ≤25 triệu pixel, một frame; từ chối
ảnh lỗi/bomb/animation hoặc format ngoài JPEG/PNG. Chuyển RGB trước inference.
Mỗi prediction có `rank`, `class_id`, `normalized_dish`, `display_name`, `confidence`.
Sort confidence giảm dần, tie-break class ID tăng dần; không trùng class.
Confidence lấy từ softmax toàn bộ 30 lớp, không chuẩn hóa lại Top-3; tổng ≤1 với sai số 1e-6.
UI luôn yêu cầu xác nhận/sửa, không dùng threshold để tự chọn hoặc tuyên bố phát hiện ngoài miền.

## Truy xuất công thức

`query` được trim/NFC, tối đa 200 ký tự; blank được coi như không gửi.
`top_k` là integer, không nhận boolean/float. Không có query thì dùng tên hiển thị món.
Lọc món/ngôn ngữ/ẩm thực trước vector search; cosine giảm dần, tie-break ID tăng dần.
Không nhân score với confidence CV; không reranker, LLM hoặc fallback sang món khác.

Item tìm kiếm có ID/title/món, language/cuisine, metadata khẩu phần/thời gian,
preview plain text ≤240 ký tự, rank, cosine `retrieval_score` trong [-1,1] và source.
Món hợp lệ không có recipe trả `recipes: []`; index chưa ready trả 503.
Detail theo [schema corpus](../../data/recipes/README.md): có ingredients, instructions
liên tục 1..N và source gồm name, URL, license, retrieved_at, attribution, revision_url,
modifications. Chỉ plain text và URL HTTP(S) đã validate; client escape nội dung.

## Giới hạn và deadline

Vision xử lý 1 inference/process; backend/recipes tối đa 4 request nghiệp vụ/instance.
Quá tải trả 503, không tạo queue vô hạn. Search body ≤8 KiB, kể cả chunked.
Connect timeout 2 s; upstream vision 15 s, recipes 5 s; client predict 25 s,
search/detail 10 s. Không tự retry upload POST; người dùng chủ động thử lại.
Health không chạy inference, deadline tổng 2 s; gateway cache dependency tối đa 1 s.
Health trả 503 `not_ready` khi dependency/version không phù hợp; không lộ URL/config nội bộ.

## Lỗi

Envelope lỗi gồm `api_version`, `request_id`, `code`, `message`; không trả stack/path/secret.
Proxy giữ cùng JSON envelope và request ID cho lỗi nó chủ động chặn.

| HTTP | Code |
| --- | --- |
| 400 | `INVALID_IMAGE` |
| 404 | `RECIPE_NOT_FOUND` |
| 413 | `UPLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `INVALID_DISH` |
| 500 | `INTERNAL_ERROR` |
| 503 | `DEPENDENCY_NOT_READY`, `SERVICE_BUSY` |
| 504 | `DEPENDENCY_TIMEOUT` |

## Nội bộ

Vision: `/predict`, `/health/live`, `/health/ready`. Recipes: `/search`, `/recipes/{id}`,
`/dishes`, `/health/live`, `/health/ready`; response bỏ public envelope.
Gateway có `/actuator/health/liveness` và `/actuator/health/readiness` cho vận hành.
`recipe-init` là CLI one-shot, không có API và phải exit khác 0 khi seed lỗi.
Release không publish trực tiếp AI/Qdrant hoặc Actuator debug.

## Phiên trợ lý (Phase 8–9)

Các route mới vẫn dùng JSON/envelope/version và `X-Request-ID` như API cũ.
Tất cả thành công trả HTTP 200 với `{api_version, request_id, session}`.
Session ID và operation ID là UUID chuẩn; operation ID khác request ID dùng để truy vết HTTP.
Session ID là quyền truy cập phiên, cần giữ riêng, không đưa vào log/URL chia sẻ.

| Route | Body / hành vi |
| --- | --- |
| `POST /api/assistant/sessions` | `{recipe_id, corpus_version, operation_id}`; lấy recipe từ gateway/corpus, không nhận recipe/state do client khai |
| `GET /api/assistant/sessions/{id}` | Đọc snapshot recipe và state đã lưu, không cần upstream/LLM |
| `POST /api/assistant/sessions/{id}/actions` | `{action, expected_version, operation_id}` |
| `POST /api/assistant/sessions/{id}/messages` | `{text, expected_version, operation_id}`; Phase 9 trả 503 `ASSISTANT_NOT_CONFIGURED`, không lưu text hoặc đổi state |

Body tối đa 8 KiB kể cả chunked, deadline nhận 5 s, cùng tối đa 4 request nghiệp vụ.
Từ chối field lạ, JSON key trùng, null bắt buộc và coercion số/boolean/string.
`expected_version` là integer không âm; `text` không blank, tối đa 2.000 UTF-16 code units.
`corpus_version` tối đa 100 UTF-16 code units và phải khớp manifest runtime.
ID recipe dùng cùng quy tắc endpoint detail.

Session gồm `id`, `corpus_version`, `recipe_version` (= recipe `updated_at`), `recipe` đầy đủ,
`status` (`ready`, `cooking`, `finished`), `current_step`, `total_steps`, `version`,
`created_at`, `updated_at`, `expires_at` (UTC ISO-8601), `history` và `messages`.
Recipe là snapshot do server đã validate, giữ nguyên nguồn/license và metadata null.
Phiên đã tạo giữ snapshot/version cũ sau thay corpus; tạo phiên mới với version sai trả 409.
`messages` rỗng trong Phase 9; Phase 10 mới triển khai trả lời/provider và lưu hội thoại.

| Action | Trạng thái hợp lệ | Kết quả |
| --- | --- | --- |
| `start` | `ready` | `cooking`, bước 1 |
| `next` | `cooking` | Tăng bước, chặn tại N, không tự kết thúc |
| `previous` | `cooking` | Giảm bước, chặn tại 1 |
| `repeat` | `cooking` | Giữ bước hiện tại |
| `finish` | `ready`, `cooking` | `finished`, giữ bước hiện tại, không mở lại |

Mới tạo: `ready`, bước 0, version 0; bước trong recipe/API/UI đều 1-based.
Mỗi action mới hợp lệ (kể cả repeat/chạm biên) tăng version một lần và thêm một history event.
Event có `operation_id`, `action`, `version`, `current_step`, `created_at`.
Tối đa 100 event; vị trí cuối dành cho `finish`; quá giới hạn trả 409, không cắt mất dedup history.
Đổi recipe hoặc bắt đầu lại sau kết thúc phải tạo phiên mới với operation ID mới.

SQLite transaction khóa writer trước khi đọc state/version và ghi action/state nguyên tử.
Hai operation khác nhau cùng expected version: chỉ một thành công, cái còn lại 409.
Replay cùng operation/body trả state mới nhất mà không thực hiện lại, kể cả sau restart/kết thúc.
Dùng lại operation với action/version khác hoặc create với recipe/version khác trả 409.
Replay create trả cùng session ID; không cần gọi upstream lại.
Client giữ nguyên operation ID/body khi retry, không tự retry POST.
Client hủy/bỏ qua response khi đổi phiên/recipe và chỉ áp dụng state có version không thấp hơn state đang giữ.
Sau 409 đọc lại session trước khi gửi thao tác mới; response đến muộn không được thay state mới.

Tuổi phiên cố định 24 giờ từ lúc tạo, không gia hạn theo request/replay.
Hết hạn trả 410; không có trả 404; record hết hạn trên 7 ngày được dọn khi tạo phiên.
Tối đa 10.000 record, vượt trả 503; sau dọn record cũ trả 404.
SQLite schema `PRAGMA user_version=1`; schema lạ/DB lỗi/quyền ghi thiếu trả 503,
không tự xóa database, hạ schema hoặc ảnh hưởng readiness ảnh/công thức.
Dedup/replay chỉ được bảo đảm khi record phiên còn được giữ; create replay cùng payload trên phiên hết hạn nhưng chưa dọn trả 410.
Với record còn giữ, create operation trùng nhưng recipe/corpus khác trả 409, kể cả khi phiên đã hết hạn; dữ liệu lưu sai luôn ưu tiên storage 503.
Khi record hết hạn trên 7 ngày bị dọn, khóa create operation cũng bị xóa và không còn được nhận diện là replay.
Client phải dùng operation ID mới khi tạo phiên mới, không tái gửi yêu cầu tạo phiên cũ ngoài thời hạn giữ record.

Trước khi đọc, replay hoặc chuyển bước, backend kiểm tra snapshot recipe và các bất biến state/history đã lưu.
Recipe ID phải khớp bản ghi; source URL, metadata và thứ tự bước dùng cùng validation với recipe detail.
Version/history/operation/step/status và timestamp liên kết phải nhất quán; dữ liệu sai trả 503 `ASSISTANT_STORAGE_UNAVAILABLE` và không tự sửa DB.
Snapshot corpus cũ hợp lệ vẫn đọc được; không buộc corpus version của phiên cũ khớp manifest hiện tại.
History sắp theo version; không giả định đồng hồ hệ thống luôn tăng khi kiểm tra timestamp.
Shared client chuẩn hóa UUID phiên và operation thành chữ thường trước khi gửi và đối chiếu response.

| HTTP | Code bổ sung |
| --- | --- |
| 404 | `SESSION_NOT_FOUND` (recipe sai vẫn dùng `RECIPE_NOT_FOUND`) |
| 409 | `RECIPE_VERSION_MISMATCH`, `SESSION_VERSION_CONFLICT`, `OPERATION_CONFLICT`, `INVALID_SESSION_ACTION`, `SESSION_FINISHED`, `SESSION_HISTORY_LIMIT` |
| 410 | `SESSION_EXPIRED` |
| 503 | `ASSISTANT_STORAGE_UNAVAILABLE`, `ASSISTANT_NOT_CONFIGURED` |
