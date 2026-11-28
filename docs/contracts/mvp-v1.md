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
Confidence lấy từ softmax trên toàn bộ đầu ra của model và giữ nguyên giá trị trong Top-3.
Tổng ≤1 với sai số 1e-6.
Model `efficientnet-b2-32class-epoch5` trả 422 `OTHER_FOOD` hoặc `NON_FOOD` khi lớp tương ứng đứng đầu.
Khi một món thuộc danh mục đứng đầu, model trả ba món được xếp cao nhất trong danh mục, không áp dụng ngưỡng 65%.
Model công bố 30 lớp tiếp tục trả 422 `LOW_CONFIDENCE_PREDICTION` khi confidence cao nhất dưới 65%.
UI yêu cầu xác nhận món khi có gợi ý và cho phép chọn ảnh khác hoặc tra món theo tên khi ảnh bị từ chối.

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
| 422 | `VALIDATION_ERROR`, `INVALID_DISH`, `IMAGE_BLURRY`, `LOW_CONFIDENCE_PREDICTION`, `OTHER_FOOD`, `NON_FOOD` |
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
| `POST /api/assistant/sessions/{id}/messages` | `{text, expected_version, operation_id}`; chat theo snapshot hoặc lệnh bước nấu xác định; thiếu config trả 503 không đổi state/conversation |

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
Source hiện dùng SQLite schema `PRAGMA user_version=3`, tự migrate schema 1/2 trong một transaction.
Schema lạ/DB lỗi/quyền ghi thiếu trả 503,
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

## Mở rộng chat (thiết kế Phase 10)

Source Phase 10 đã nối `/messages` với provider/context/state và admission/accounting, kiểm chứng HTTP bằng provider giả.
Chưa cấu hình key hoặc pricing policy hợp lệ thì không nhận operation/call mới; cooking commands vẫn hoạt động.
Compose đã forward config chỉ backend và thêm egress bridge; kiểm chứng Docker runtime/API thật còn mở.
DTO/controller/OpenAPI và client dùng chung phải được cập nhật cùng triển khai, không duy trì schema OpenAPI viết tay.

### State và hội thoại

Giữ các route, body, envelope `api_version: "1.0.0"` và các field Session hiện có.
`version` tiếp tục là revision của state phiên: mỗi action hợp lệ hoặc một cặp hỏi/đáp đã commit tăng đúng một lần.
Không có chat thành công ở Phase 9 nên việc kích hoạt `/messages` không thay một hành vi chat thành công đã có.
Client phải bỏ giả định nội bộ `version == history.length` khi hỗ trợ chat.

- `history` chỉ chứa cooking actions, tối đa 100 event, slot cuối vẫn dành cho `finish`.
  Version của action tăng nghiêm ngặt nhưng có thể có khoảng trống do chat.
- `messages` là các cặp liên tiếp `user`, `assistant`, mỗi item giữ `{role, text}`.
  Tối đa 30 cặp/60 message; không cắt hội thoại đã lưu để tạo thêm quota hoặc làm mất dedup.
- Bất biến public: `version == history.length + messages.length / 2`.
  Backend ghép action và chat turn theo version để kiểm tra liên tục từ 1 đến version hiện tại, expected version, step/status và timestamp.
- Chat thường chỉ thêm cặp message và đổi version/updated_at; không đổi recipe, bước, trạng thái hoặc expires_at.
  Không lưu nửa cặp user message khi provider lỗi hoặc kết quả không còn phù hợp.
- Replay thành công trả state mới nhất của cùng phiên, không append message hoặc gọi lại provider, kể cả sau restart/kết thúc; phiên hết hạn vẫn trả 410.
  `operation_id` dùng chung namespace giữa actions và messages trong một phiên; đổi loại request, text, action hoặc expected_version với ID đã dùng trả 409 `OPERATION_CONFLICT`.
  Text dùng để đối chiếu replay là chuỗi đã parse nguyên vẹn, không tự trim/đổi nội dung trước khi lưu fingerprint.

Ví dụ: `start` tạo action version 1; một câu hỏi/đáp commit version 2; `next` tạo action version 3.
State cuối có version 3, hai action với version `[1, 3]`, hai message và bước 2.

### Provider call, retry và response muộn

1. Trong transaction ngắn: validate dữ liệu lưu/expiry, kiểm tra replay trước expected_version/status/quota, sau đó nhận operation mới và snapshot state.
   Chỉ cho một provider call đang chờ trên mỗi phiên; operation khác gặp pending trả 409 `ASSISTANT_REQUEST_IN_PROGRESS`.
   Cooking actions và GET không bị pending chat chặn; chúng vẫn có thể làm snapshot chat cũ đi.
2. Gọi provider ngoài transaction SQLite, với deadline tổng 20 s và connect timeout 2 s.
   Không tự retry upstream, fallback provider hoặc giữ writer lock trong thời gian chờ.
3. Khi có kết quả: transaction mới validate lại phiên/expiry và expected_version trước khi commit nguyên tử cặp message, kết quả operation, version và updated_at.
   Operation phải vẫn pending và còn deadline; completion đến sau khi operation đã thành lỗi cuối không được mở lại hoặc commit, kể cả version phiên chưa đổi.
   Nếu state đã đổi, trả 409 `SESSION_VERSION_CONFLICT`; nếu hết hạn trả 410; không lưu câu trả lời vào hội thoại.
   Usage của lần gọi vẫn phải được tính dù kết quả bị loại vì state cũ.

Request trùng đang pending trả 409 `ASSISTANT_REQUEST_IN_PROGRESS`, không gọi provider lần hai.
Operation đã thất bại hoặc bị loại lưu mã lỗi cuối để replay cùng body không tự phát sinh một lần gọi mới.
Lỗi trước khi nhận operation (ví dụ thiếu key, validation, rate limit hoặc budget) không ghi conversation/state hoặc operation mới.
Khi timeout, mất kết nối hoặc process chết sau khi nhận operation, kết quả upstream có thể không xác định.
Khi xử lý request chat, operation pending quá deadline 25 s chuyển thành lỗi cuối 503 `ASSISTANT_OUTCOME_UNKNOWN`; không tự gửi lại operation đó sau restart.
Không tuyên bố exactly-once ở provider; người dùng chỉ gửi operation mới sau khi đọc lại state và chủ động thử lại.
Giữ operation records tới khi phiên được purge; không log text, key hoặc raw provider response.

### Lệnh bước nấu và context

Chỉ ánh xạ nguyên câu sau trim/NFC/lowercase: `bắt đầu`, `bước tiếp`, `bước trước`, `nhắc lại`, `kết thúc` thành action tương ứng.
Các lệnh này gọi cùng logic action/dedup/version của Phase 9, không gọi provider, không thêm cặp message và không tính vào 30 lượt hỏi đáp.
Phân loại operation vẫn ghi nhận route/body gốc để replay qua route khác không bị coi là cùng request.
Không dùng output model để gọi action hoặc ghi đè state; câu dài chứa từ khóa không được tự suy thành lệnh.

Backend lấy recipe/source, corpus/recipe version và bước hiện tại từ snapshot server.
System instruction tách riêng user text, recipe text và lịch sử; tất cả nội dung dữ liệu đều không được nâng thành chỉ dẫn hệ thống.
Gửi tối đa 6 cặp gần nhất, ưu tiên cặp mới nhất và bỏ nguyên cặp cũ khi vượt ngân sách lịch sử khoảng 2.500 tokens.
Không cắt mất recipe/step để nhét thêm history.
Admission ước lượng `ceil(UTF-8 bytes / 3) + 16` mỗi message, cộng 32 mỗi prompt; toàn input tối đa 6.000 estimated tokens và 20.000 byte nội dung UTF-8, JSON request tối đa 64 KiB.
Đây không phải tokenizer hoặc token billing; usage thật và accounting xử lý riêng, không suy usage thiếu thành 0.
Adapter không streaming/tools, response tối đa 1 MiB; từ chối reply rỗng/truncated/tool call/model sai, giữ usage hợp lệ trong failure khi có.
Output tối đa 512 tokens; câu trả lời tiếng Việt là plain text, phân biệt dữ kiện công thức với gợi ý, không bịa nguồn/định lượng.
Client `/messages` dùng timeout 25 s; không tự retry POST và bỏ response khi đổi phiên hoặc nhận version thấp hơn state đang giữ.
Response `/messages` có header tùy chọn `Server-Timing` với `assistant_prepare`, `assistant_provider`, `assistant_persist`, `assistant_total`, đơn vị ms, không có text/ID/key.
Timing bắt đầu ở controller trước parse, total kết thúc trước serialize response; provider gồm network/HTTP/parse, không phải số đo nội bộ NVIDIA.
Header cũng được set khi service báo lỗi; replay/lệnh không gọi provider có provider duration bằng 0, không thay envelope/DTO/state hoặc timeout.

### Persistence và lỗi bổ sung

Schema hiện tại là 3: migration 1 → 2 → 3 hoặc 2 → 3 trong một transaction, giữ nguyên ID/snapshot/action/chat/version/timestamp/expiry hiện có.
Database mới tạo đủ schema 3; schema không hỗ trợ hoặc migration lỗi trả storage 503 và rollback, không xóa DB hoặc tự hạ schema.
`session_chat_turns` lưu chat turn đã commit theo `(session_id, version)` với user/assistant text, operation ID, expected_version, created_at và metadata provider/model/usage nullable.
`session_operations` lưu theo `(session_id, operation_id)` với kind (`action`, `message`, `message_action`), fingerprint SHA-256 của payload canonical, expected_version, created_at, deadline, trạng thái (`pending`, `completed`, `failed`), committed_version nullable và mã HTTP/lỗi cuối nullable.
`command_text` chỉ có ở `message_action`, giữ text gốc để kiểm tra fingerprint và action đã ánh xạ; các kind khác phải null.
Canonical payload gồm route kind và mọi field nghiệp vụ, không gồm request ID; serialized có thứ tự field cố định trước khi hash.
Operation completed phải liên kết đúng một action hoặc chat turn; failed/pending không chiếm version.
Action cũ được backfill operation trong migration; trùng operation/version, thứ tự revision sai hoặc action không hỗ trợ làm migration thất bại.
Snapshot và toàn bộ bất biến state/history tiếp tục được validate mỗi lần load; migration không tự sửa dữ liệu hỏng.
Chat turn và operation thuộc phiên được cascade khi purge; accounting tháng không được mất theo purge phiên.
`llm_calls` không FK tới phiên, giữ call/session key đã hash, tháng UTC, admission timestamp, model, đơn giá, reservation/charge micro-USD, usage nullable và outcome code.
Không lưu prompt/reply/key trong ledger; purge phiên không xóa chi phí.
Nhận operation pending và reservation/rate slot trong cùng transaction; provider call luôn ngoài transaction.
Giới hạn 12 provider attempts được nhận trong sliding window 60 s/phiên, bao gồm lỗi; replay và command không chiếm slot mới.
Tháng UTC cảnh báo tại $5 (một marker bền vững/tháng), từ chối khi tổng đã đạt $10 hoặc reservation mới làm vượt $10.
Tổng dùng charge đã biết hoặc reservation còn giữ; thiếu một trong input/output usage thì không hoàn reservation về 0.
Usage được settle trước khi commit reply, kể cả khi reply bị loại vì stale/expiry; settlement lặp không ghi đè charge đã xác nhận.
Pricing runtime hiện chỉ nhận trial NVIDIA đúng endpoint/model đã đối chiếu với mức 0 USD; endpoint/model khác chưa có policy đã xác minh trả `ASSISTANT_NOT_CONFIGURED` trước admission.
Các profile/operational alias được pin rõ trong `LlmSettings`, không chấp nhận model tùy ý hoặc wildcard; chat turn giữ reported model thực tế, ledger model là selector dùng khi admission.
Super endpoint public trả serving name khác selector; đây là mapping quan sát được, không xác nhận checkpoint/VL tương đương, không gửi image và không tự fallback.
Policy giá trả phí phải có đơn giá và giới hạn billing bảo đảm được trước khi bật; ước lượng admission không được coi là tokenizer billing.

| HTTP | Code Phase 10 | Ý nghĩa |
| --- | --- | --- |
| 409 | `ASSISTANT_REQUEST_IN_PROGRESS` | Có provider call đang chờ; đọc lại phiên trước thao tác mới |
| 409 | `SESSION_MESSAGE_LIMIT` | Đủ 30 cặp hỏi/đáp; action vẫn hoạt động |
| 422 | `ASSISTANT_CONTEXT_TOO_LARGE` | Context bắt buộc vượt trần input, không gửi provider |
| 429 | `ASSISTANT_RATE_LIMITED` | Vượt 12 request chat mới/phút/phiên hoặc provider trả 429 |
| 503 | `ASSISTANT_PROVIDER_UNSUPPORTED` | Adapter chưa hỗ trợ cấu hình đã chọn |
| 503 | `ASSISTANT_PROVIDER_AUTH_FAILED` | Provider trả 401/403; không chuyển lỗi này thành lỗi đăng nhập của người dùng |
| 503 | `ASSISTANT_PROVIDER_UNAVAILABLE` | Provider lỗi mạng/5xx hoặc response rỗng/sai định dạng |
| 503 | `ASSISTANT_OUTCOME_UNKNOWN` | Không xác định kết quả provider; không tự gửi lại operation |
| 503 | `ASSISTANT_BUDGET_EXCEEDED` | Hết ngân sách; không chặn cooking actions |
| 504 | `ASSISTANT_PROVIDER_TIMEOUT` | Provider vượt deadline; replay không gọi lại provider |

Các lỗi chỉ trả thông báo tiếng Việt cố định và request ID, không raw upstream body, URL, prompt hoặc secret.
Thiếu key vẫn dùng `ASSISTANT_NOT_CONFIGURED`; lỗi chat không tham gia readiness của ảnh/công thức.
