# Contract MVP v1 — Top-3 và công thức

Trạng thái: Phase 0/1 đã được người dùng merge; contract có hiệu lực. Vision nội bộ thuộc Phase 1; recipes nội bộ được triển khai trong Phase 2, corpus hiện phủ 18/30 món và chưa đóng cổng nghiệm thu phase. Public OpenAPI sẽ được sinh từ Spring controllers ở Phase 3; không thêm bản OpenAPI YAML song song.

## Quy ước chung

- API public dưới `/api`; frontend chỉ dùng relative URL trên cùng origin. JSON UTF-8, tên trường `snake_case`, số thực hữu hạn; không dùng chuỗi cho confidence/score.
- `X-Request-ID`: nhận UUID hợp lệ từ caller hoặc tạo UUID mới; trả lại trong header và `request_id` trong mọi JSON envelope, truyền xuyên các HTTP client. Header không hợp lệ được thay mới; không echo tùy ý nội dung caller vào logs.
- Dùng `api_version: "1.0.0"` ở JSON public. Thay đổi trường bắt buộc/ý nghĩa hoặc xóa trường cần cập nhật version và contract tests; thêm trường optional phải được client chấp nhận.
- Tên class model không phải tên hiển thị: `class_id` là 0-based theo checkpoint; `normalized_dish` là khóa snake_case trong mapping v1.0.0; `display_name` tiếng Việt cho UI. Mapping authoritative được nhập từ nhánh data đã chọn và đối chiếu đủ 30 lớp ở Phase 1.
- Danh sách có thứ tự; rank là 1-based. Timestamp theo ISO 8601 UTC, ngày theo `YYYY-MM-DD`. Field nullable có mặt và trả `null`, không tự suy đoán giá trị.
- Giới hạn xử lý mặc định: vision 1 request inference đồng thời/process (1 worker); queue không giới hạn bị cấm, quá tải trả 503 `SERVICE_BUSY`. Backend/recipes tối đa 4 request AI đang xử lý mỗi instance; cân chỉnh chỉ sau benchmark và cập nhật quyết định.
- Connect timeout 2 giây; vision read timeout 15 giây, recipes read timeout 5 giây. Frontend timeout 25 giây cho upload/predict, 10 giây cho tìm/detail. Reverse proxy tối thiểu 20 giây cho vision. Không retry tự động POST ảnh; user có thể thử lại. Search/detail có thể retry tối đa 1 lần khi lỗi kết nối tạm, trong deadline tổng.
- Không có session/chat, không lưu ảnh hoặc trạng thái xác nhận phía server trong milestone này. `confirmed_dish` là lựa chọn rõ ràng từ UI; backend không tự thay bằng top-1.

## 1. POST /api/vision/predict

Multipart có đúng trường `file` là ảnh JPEG hoặc PNG; tối đa **10 MiB nội dung file**, số pixel tối đa **25.000.000** sau đọc header, một ảnh một request. Content-Type và nội dung decode đều phải hợp lệ. WebP trong HTML tham chiếu được bỏ khỏi hướng dẫn cho milestone này để UI/API có cùng tập định dạng.

Multipart overhead được dành thêm 1 MiB ở proxy/backend (request body tối đa 11 MiB); application vẫn kiểm tra từng file tối đa 10 MiB. Không tin chỉ `Content-Length`; đọc có giới hạn kể cả upload chunked. Không xử lý animation; ảnh nhiều frame bị từ chối. Chuyển RGB; reject ảnh bomb/corrupt trước inference.

HTTP 200:

```json
{
  "api_version": "1.0.0",
  "request_id": "<request-id>",
  "model_version": "efficientnet-b2-30vnfoods-2026-09-30",
  "taxonomy_version": "1.0.0",
  "predictions": [
    {"rank":1,"class_id":28,"normalized_dish":"pho","display_name":"Phở","confidence":0.70},
    {"rank":2,"class_id":14,"normalized_dish":"bun_bo_hue","display_name":"Bún bò Huế","confidence":0.15},
    {"rank":3,"class_id":3,"normalized_dish":"banh_canh","display_name":"Bánh canh","confidence":0.05}
  ]
}
```

Số liệu trên chỉ minh họa shape, không phải kết quả đánh giá. Luôn trả đúng 3 class duy nhất; sort confidence giảm dần, bằng nhau thì `class_id` tăng dần. Confidence lấy từ softmax toàn bộ 30 lớp, không normalize lại Top-3; tổng ≤ 1 (cho phép sai số số thực 1e-6). Truyền giá trị float đầy đủ; UI làm tròn phần trăm khi hiển thị, không round trước sort.

UI luôn yêu cầu chọn/xác nhận, cả khi confidence cao. Hiển thị rằng đây là 3 khả năng trong bộ 30 món, không phải kiểm chứng món ngoài miền. Không dùng threshold 0.30 để tự xác nhận hoặc để tuyên bố phát hiện out-of-distribution. Policy confidence thấp ở v1 là cùng quy trình chọn/sửa, không cần threshold runtime mới.

## 2. GET /api/dishes

HTTP 200 gồm `api_version`, `request_id`, `taxonomy_version`, `dishes[30]`. Mỗi item có `class_id`, `normalized_dish`, `display_name`; sort `class_id` tăng dần. Alias gõ có dấu/không dấu chỉ phục vụ UI/search trong danh mục; request recipe gửi khóa canonical. Không nhân bản taxonomy hardcode vào React/Java.

## 3. POST /api/recipes/search

JSON object:

```json
{"confirmed_dish":"pho","top_k":3,"query":"phở bò"}
```

- `confirmed_dish`: bắt buộc, canonical trong taxonomy; giá trị khác trả 422 `INVALID_DISH`.
- `top_k`: integer 1–3, mặc định 3; không chấp nhận boolean/float. `query`: optional, trim, Unicode NFC, 1–200 ký tự sau trim nếu gửi. Query rỗng/blank được xử lý như không gửi; dài quá giới hạn trả 422.
- Query chỉ xếp hạng bên trong món đã chọn. Filter bắt buộc `dish=confirmed_dish`, `language=vi`, `cuisine=vietnamese` **trước** vector search. Không mở rộng sang món khác khi tập lọc rỗng.
- Không có query thì dùng `display_name` của món làm query. Trả tối đa `top_k` recipe khác ID/nội dung trùng; sort cosine giảm dần, tie-break ID tăng dần; chưa dùng reranker/threshold cắt kết quả trong v1. Score không phải xác suất và không nhân với confidence CV.

HTTP 200 gồm `api_version`, `request_id`, `corpus_version`, `embedding_version`, `taxonomy_version`, `confirmed_dish`, `recipes[]`. Item: `id`, `title`, `normalized_dish`, `language`, `cuisine`, `servings`, `prep_time_minutes`, `cook_time_minutes`, `preview` (tối đa 240 ký tự plain text), `rank`, `retrieval_score` (cosine [-1,1]), `source`.

Món hợp lệ chưa có recipe: HTTP 200, `recipes: []`, vẫn có version và món xác nhận. Không gọi LLM/web hoặc điền recipe giả. Khi chưa có corpus/index đang active đúng version: HTTP 503, không giả vờ đây là empty-result hợp lệ.

## 4. GET /api/recipes/{id}

ID khớp `[a-z0-9][a-z0-9_-]{0,79}`, không chứa path. HTTP 404 `RECIPE_NOT_FOUND` nếu không tồn tại, 422 nếu ID sai định dạng. HTTP 200 gồm `api_version`, `request_id`, `corpus_version`, `recipe` theo schema trong [docs/data](../data/README.md), bổ sung:

- `source` bắt buộc `name`, `url`, `license`, `retrieved_at`, `attribution`, `revision_url`, `modifications`. Với dữ liệu tự biên soạn, `revision_url` có thể null, phải có tác giả và bằng chứng license trong manifest.
- `servings`, thời gian và quantity có thể `null` nếu nguồn không có. `quantity` là số dương hoặc null; khoảng/“tùy khẩu vị” lưu trung thực ở `note`, không gán một số đại diện giả.
- `ingredients` có ít nhất một mục; `instructions` có bước 1..N liên tục, text không rỗng; units/ingredient names được chuẩn hóa có kiểm soát ở Phase 2.
- `tags` là list string; `created_at`/`updated_at` là ngày lưu corpus, không giả là ngày tác giả xuất bản.

Chỉ trả plain text; frontend escape nội dung, không `innerHTML` từ corpus. Chỉ hiển thị source URL HTTP(S) được validate; không cho JavaScript/file URL.

## 5. GET /api/health

HTTP 200 khi tất cả dependency bắt buộc đúng version và ready, 503 nếu không:

```json
{
  "api_version":"1.0.0",
  "request_id":"<request-id>",
  "status":"ready",
  "dependencies":{
    "vision":{"status":"ready","model_version":"efficientnet-b2-30vnfoods-2026-09-30","taxonomy_version":"1.0.0"},
    "recipes":{"status":"ready","corpus_version":"<active-version>","embedding_version":"multilingual-e5-small-v1","taxonomy_version":"1.0.0"}
  }
}
```

Version corpus trong ví dụ là placeholder để mô tả; implementation trả version thật. Khi chưa ready, top-level `status: "not_ready"`, dependency có `status: "not_ready"` và code ổn định, không trả URL/config nhạy cảm. Health không làm inference/embedding, có deadline tổng 2 giây và cache tối đa 5 giây. `/api/health` trả schema health ở trên; các endpoint nghiệp vụ dùng schema error bên dưới.

## Error envelope và status

```json
{
  "api_version":"1.0.0",
  "request_id":"<request-id>",
  "code":"INVALID_IMAGE",
  "message":"Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG hợp lệ."
}
```

| HTTP | Code | Trường hợp |
| --- | --- | --- |
| 400 | `INVALID_IMAGE` | Bytes không decode được, ảnh corrupt/bomb/multiple frames |
| 413 | `UPLOAD_TOO_LARGE` | File >10 MiB hoặc request multipart >11 MiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | MIME/format ngoài JPEG/PNG hoặc content-type request không đúng |
| 422 | `VALIDATION_ERROR`, `INVALID_DISH` | Thiếu file, JSON/type/range/ID sai, món ngoài taxonomy |
| 404 | `RECIPE_NOT_FOUND` | ID hợp lệ nhưng không có recipe |
| 503 | `DEPENDENCY_NOT_READY`, `SERVICE_BUSY` | Model/index chưa ready, dependency mất kết nối, version không tương thích, quá tải |
| 504 | `DEPENDENCY_TIMEOUT` | Vượt deadline upstream |
| 500 | `INTERNAL_ERROR` | Lỗi không dự kiến; log có request ID, public không có stack/path/secret |

Proxy phải trả JSON envelope cùng HTTP semantics cho lỗi nó chủ động chặn; request ID có thể tạo tại proxy rồi truyền backend. FastAPI validation/internal failures phải được typed clients map, không trả nguyên lỗi provider cho browser. Request ID xuất hiện ở cả lỗi do proxy (ví dụ body quá lớn).

## API nội bộ

| Service | Route | Dữ liệu / trách nhiệm |
| --- | --- | --- |
| vision | `POST /predict` | Cùng file rules; response `model_version`, `taxonomy_version`, `predictions` như public (backend thêm public envelope) |
| vision | `GET /health/live`, `/health/ready` | Live 200 khi process sống; ready 200 chỉ sau load/check artifact + mapping, ngược lại 503 |
| recipes | `POST /search`, `GET /recipes/{id}`, `GET /dishes` | Search/detail như trên bỏ public envelope; dishes là mapping v1.0.0 dùng chung, vision kiểm tra cùng version |
| recipes | `GET /health/live`, `/health/ready` | Ready cần model local, Qdrant/alias active và corpus/embedding/taxonomy đúng version |
| backend | `/actuator/health/liveness`, `/actuator/health/readiness` | Dùng cho Compose; public đi qua `/api/health`, không mở Actuator debug/config |

`GET /api/dishes` lấy từ recipes/mapping bundle, không phụ thuộc kết quả CV mới. Các AI error body nội bộ có `code`, `message`, `request_id`; backend chuyển HTTP/provider failures thành envelope public. Không expose cổng AI/Qdrant trong release. `recipe-init` là CLI one-shot, không có API; lỗi manifest/seed phải exit khác 0.
