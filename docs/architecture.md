# Kiến trúc

## Luồng runtime

```text
Web → Nginx → Spring Boot /api → Vision EfficientNet-B2
                             → Recipes E5 → Qdrant
                             → SQLite phiên/ledger
                             → API LLM (Gemini, tùy chọn)
Expo Go ───→ cùng public API
Recipe init ────────────────→ nạp bundle vào Qdrant
```

| Service | Trách nhiệm | Mã nguồn |
| --- | --- | --- |
| `frontend` | Phục vụ web và proxy API cùng origin | [frontend/](../frontend/README.md) |
| `backend` | Public API, validation, giới hạn request, phiên trợ lý và điều phối AI/LLM | [backend/](../backend/README.md) |
| `vision` | Kiểm tra ảnh, load checkpoint và trả Top-3 | [ai/cv/inference/](../ai/cv/inference/README.md) |
| `recipes` | Embed query, lọc món, tìm và đọc công thức | [ai/rag/](../ai/rag/README.md) |
| `qdrant` | Lưu vector và metadata của corpus | [Compose](../compose.yaml) |
| `recipe-init` | Job một lần: kiểm tra/nạp bundle và kích hoạt index | [Ingestion](../ai/rag/ingestion/) |

Toàn bộ service nằm trong một [compose.yaml](../compose.yaml) ở root, project `cooklens`.
Mỗi phần có Dockerfile riêng; Compose dùng image có sẵn, không build source lúc khởi động.
Chỉ frontend publish cổng, mặc định trên loopback.
AI/Qdrant nằm trong mạng internal `application`; riêng backend nối thêm bridge `llm-egress` để gọi provider.

## Model và dữ liệu

| Thành phần | Cấu hình | Nguồn chuẩn |
| --- | --- | --- |
| CV | EfficientNet-B2; crop 288×288; softmax 30 lớp; CPU | [Artifact manifest](../deploy/artifacts/manifest.json) |
| Taxonomy | Class ID, khóa món, tên hiển thị, alias và version dùng chung | [Label map](../data/processed/30vnfoods-label-map.json) |
| Embedding | multilingual-e5-small, 384 chiều, L2 normalization, cosine | [Provenance](../deploy/artifacts/embedding-model-v1.md) |
| Corpus | Công thức có cấu trúc, nguồn, attribution và license | [Dữ liệu](../data/recipes/README.md) |

Không chép taxonomy thành danh sách riêng trong từng client/service.
Model, taxonomy, corpus và embedding có version riêng; release ghi bộ version tương thích.

## Quy tắc xử lý

1. Vision trả đúng ba class duy nhất, confidence giảm dần, tie-break theo class ID.
   Điểm cao nhất dưới 65% trả 422 `LOW_CONFIDENCE_PREDICTION`.
2. Người dùng luôn xác nhận hoặc chọn món trước khi tìm công thức.
3. Recipes lọc `dish`, `language=vi`, `cuisine=vietnamese` trước vector search, prefix `query: `/`passage: `.
4. Query chỉ xếp hạng trong món đã xác nhận; không fallback sang món khác hoặc gọi LLM.
5. Kết quả rỗng, lỗi và dữ liệu thiếu được trả rõ ràng; client không tạo dữ liệu thay thế.

Vector bundle tạo trước khi build image.
`recipe-init` kiểm tra version và giữ collection cũ để rollback; chỉ chạy một init job mỗi lần.

## API và client

[Contract v1](contracts/mvp-v1.md) quy định envelope, routes, lỗi, timeout và upload.
Spring sinh OpenAPI tại `/v3/api-docs`; client dùng [schema TypeScript sinh tự động](../frontend/src/generated/api.d.ts).
Web và Expo chia sẻ [client API](../packages/cooklens-api/).
Món đã xác nhận nằm ở client; đổi ảnh, món hoặc công thức phải hủy và bỏ qua response cũ.
Client chỉ lưu session ID/recipe ID (web: localStorage, Expo: SecureStore), không lưu ảnh, hội thoại hoặc key.
Giao diện dùng font/icon local, không tải CDN.

## Trợ lý

Backend gọi LLM qua interface `ChatProvider` với adapter Chat Completions tương thích OpenAI.
Mặc định là Gemini 3.1 Flash-Lite qua endpoint OpenAI-compatible của Google; NVIDIA trial vẫn dùng được khi cấu hình đúng endpoint/model đã pin.
Chỉ một provider hoạt động, không tự fallback; chưa có adapter Anthropic.

- Backend lấy công thức từ corpus và lưu snapshot vào phiên; không nhận recipe/state do client gửi.
- Context gồm công thức, bước hiện tại và tối đa 6 cặp hỏi đáp gần nhất; dữ liệu người dùng tách khỏi system instruction; không gửi ảnh.
- Năm lệnh `bắt đầu`, `bước tiếp`, `bước trước`, `nhắc lại`, `kết thúc` chạy bằng logic ứng dụng, không gọi LLM; output model không đổi state.
- Request nhận operation và reservation chi phí trong transaction ngắn, gọi provider ngoài writer lock, rồi chỉ commit cặp hỏi đáp nếu state chưa đổi.
- Model trả text thuần; client render bằng text node, không thực thi HTML hoặc link.

| Giới hạn | Giá trị |
| --- | --- |
| Phiên | 24 giờ cố định; 100 action; 30 cặp hỏi đáp; 10.000 record |
| Request | Body 8 KiB; câu hỏi ≤2.000 ký tự; 4 request nghiệp vụ đồng thời/instance |
| Gọi LLM | 12 lượt/phút/phiên; timeout 20 s (proxy 25 s); output ≤512 token; input ước lượng ≤6.000 token |
| Ngân sách | Cảnh báo $5, chặn $10 mỗi tháng UTC; tính theo trần giá đã xác minh |

SQLite schema 3 trong volume `assistant-sessions` lưu phiên, hội thoại, operation và ledger chi phí.
Ledger không bị xóa khi dọn phiên. Chi tiết ở [contract](contracts/mvp-v1.md#phiên-trợ-lý) và [backend README](../backend/README.md).
