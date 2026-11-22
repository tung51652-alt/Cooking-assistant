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
- Không lưu ảnh, session hoặc trạng thái xác nhận phía server. Client phải xác nhận món.
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
