# Kiến trúc

## Luồng runtime

```text
Web → Nginx → Spring Boot /api → Vision EfficientNet-B2
                             → Recipes E5 → Qdrant
                             → SQLite phiên/ledger → API LLM (chat tùy chọn)
Expo Go ───→ cùng public API
Recipe init ────────────────→ nạp bundle vào Qdrant
```

| Service | Trách nhiệm | Mã nguồn |
| --- | --- | --- |
| `frontend` | Phục vụ web và proxy API cùng origin | [frontend/](../frontend/README.md) |
| `backend` | Public API, validation, giới hạn request, timeout và điều phối AI | [backend/](../backend/README.md) |
| `vision` | Kiểm tra ảnh, load checkpoint và trả Top-3 | [ai/cv/inference/](../ai/cv/inference/README.md) |
| `recipes` | Embed query, lọc món, tìm và đọc công thức | [ai/rag/](../ai/rag/README.md) |
| `qdrant` | Lưu vector và metadata của corpus | [Compose](../compose.yaml) |
| `recipe-init` | Job một lần: kiểm tra/nạp bundle và kích hoạt index | [Ingestion](../ai/rag/ingestion/) |

Toàn bộ service nằm trong một [compose.yaml](../compose.yaml) ở root, project `cooklens`.
Mỗi phần có Dockerfile riêng; Compose dùng image có sẵn, không build source lúc khởi động. Web và Expo chỉ gọi gateway;
AI/Qdrant nằm trong mạng internal của release. Chỉ web publish ra loopback.
Trong source Phase 10, backend có thêm bridge `llm-egress`, chỉ dùng cho kết nối ra provider; AI/Qdrant không tham gia bridge này.

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

1. Vision trả đúng ba class duy nhất, confidence giảm dần; tie-break theo class ID.
2. Người dùng luôn xác nhận/sửa món trước khi tìm công thức.
3. Recipes lọc `dish`, `language=vi`, `cuisine=vietnamese` trước vector search.
4. Query chỉ xếp hạng trong món đã xác nhận; không fallback sang món khác hoặc gọi LLM.
5. Kết quả rỗng, lỗi và dữ liệu thiếu được trả rõ ràng; client không tạo dữ liệu thay thế.

Prefix embedding là `query: ` và `passage: `. Text recipe dựng từ schema đã validate;
bundle vector tạo trước khi build image. Init kiểm tra version và giữ collection cũ
để rollback; chỉ chạy một init job mỗi lần.

## API và trạng thái

[Contract v1](contracts/mvp-v1.md) quy định envelope, routes, error, timeout và upload.
Spring sinh OpenAPI tại `/v3/api-docs`; client dùng [schema TypeScript sinh tự động](../frontend/src/generated/api.d.ts).
Web và Expo chia sẻ [client API](../packages/cooklens-api/).

Chưa có PostgreSQL/JPA hoặc LangGraph trong runtime.
Source backend dùng SQLite schema 3 lưu phiên/snapshot recipe, hội thoại/operation và ledger admission/chi phí; điều khiển bước độc lập LLM.
Volume `assistant-sessions` chỉ backend ghi, native SQLite library nằm trong image để không phụ thuộc `/tmp` executable.
State xác nhận nằm ở client;
đổi ảnh/món hoặc điều hướng phải hủy và bỏ qua response cũ.
Giao diện dùng font/icon local; không chạy HTML demo hoặc CDN của nguồn thiết kế.

## Trợ lý trong source Phase 10

Chat đi qua backend hiện có → adapter Chat Completions tương thích OpenAI, mặc định NVIDIA Nemotron 3 Ultra; chưa có adapter Gemini/Anthropic.
Source đã nối messages với recipe/state/context và admission/accounting; image `2.0.0-rc.2` chưa có phần này.
Request mới nhận operation/reservation trong transaction ngắn, nhả writer lock rồi gọi provider và chỉ commit cặp reply khi state vẫn phù hợp.
Provider error/usage thiếu/stale reply không xóa reservation; cooking commands dùng logic ứng dụng, không chạy theo output model.
Không thêm service chat riêng; giữ một Compose. Cần cấp key server và đường mạng
ra API LLM; phần nhận diện/tra công thức vẫn hoạt động khi LLM không sẵn sàng.
Contract và thứ tự triển khai ở [plan/assistant.md](plan/assistant.md).

## Trợ lý web trong source Phase 11

Recipe detail mở `assistant.html` bằng recipe ID/corpus version từ shared API client.
Backend trả snapshot, history, messages và state; client chỉ render state đã validate, không suy bước từ lời model.
Reload/nav khôi phục phiên gần nhất; localStorage chỉ chứa session ID/recipe ID, không có ảnh/chat/key.
Mutex, abort và generation guard chặn double submit/response cũ; retry thủ công giữ nguyên operation ID khi chưa biết kết quả.
Năm nút nấu độc lập LLM; lỗi provider/config/budget giữ draft, version conflict refresh state, expiry có lối chọn/tạo phiên mới.
Text model render bằng React text nodes; không thực thi HTML hoặc link từ hội thoại.
Candidate local đã qua browser flow thật desktop/mobile; human answer review và PR/CI chưa hoàn tất.
