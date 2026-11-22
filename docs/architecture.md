# Kiến trúc

## Luồng runtime

```text
Web → Nginx → Spring Boot /api → Vision EfficientNet-B2
                             → Recipes E5 → Qdrant
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
Source backend có SQLite schema v1 lưu phiên nấu và snapshot recipe; điều khiển bước độc lập LLM.
Volume `assistant-sessions` chỉ backend ghi, native SQLite library nằm trong image để không phụ thuộc `/tmp` executable.
State xác nhận nằm ở client;
đổi ảnh/món hoặc điều hướng phải hủy và bỏ qua response cũ.
Giao diện dùng font/icon local; không chạy HTML demo hoặc CDN của nguồn thiết kế.

## Bổ sung cho MVP tiếp theo — chưa triển khai

Chat/hướng dẫn đi qua backend hiện có → adapter API Gemini/OpenAI/Anthropic.
Source backend đã có API phiên/bước nấu với SQLite trong volume backend; image `2.0.0-rc.2` chưa có phần này.
Route messages đã chốt contract nhưng hiện trả 503 chưa cấu hình; adapter/provider thuộc Phase 10.
Không thêm service chat riêng; giữ một Compose. Cần cấp key server và đường mạng
ra API LLM; phần nhận diện/tra công thức vẫn hoạt động khi LLM không sẵn sàng.
Contract và thứ tự triển khai ở [plan/assistant.md](plan/assistant.md).
