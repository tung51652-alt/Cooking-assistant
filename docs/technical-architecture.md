# Chuẩn kỹ thuật MVP

Tài liệu này mô tả runtime hiện có và hướng mở rộng CookLens. MVP ưu tiên luồng **ảnh → món xác nhận → recipe có nguồn**; state hội thoại/hướng dẫn tương tác là phần tương lai, không thuộc runtime hiện tại.

## Milestone hiện có trên develop

Phạm vi hiện có là **Top-3 từ ảnh → xác nhận món → tìm tối đa 3 recipe → chi tiết trên frontend**, cùng Compose độc lập Phase 5. Phase 0–5 đã merge vào `origin/develop`; Docker Hub release thuộc Phase 6, nghiệm thu cuối thuộc Phase 7. [Contract v1](contracts/mvp-v1.md) chốt endpoint, error code, giới hạn byte/pixel, confirmation, timeout và version; [quyết định runtime](decisions/mvp-runtime.md) chốt stack/embedding/gates.

Runtime không có chat/LangGraph, PostgreSQL/JPA hoặc persistence hội thoại. Frontend React/Vite tái sử dụng [HTML CookLens đã audit](frontend-reference/README.md), qua Nginx gọi Spring backend; backend gọi vision/recipes bằng HTTP. Qdrant + job init phục vụ corpus có version. Không cần LLM/key để tra recipe. App Expo tích hợp qua PR #17, dùng chung public API; người dùng đã xác nhận upload ảnh trên điện thoại thật ngày 2026-10-26. Kiểm thử native đầy đủ Android/iOS còn mở theo báo cáo Expo.

## Ranh giới trách nhiệm

| Lớp | Chịu trách nhiệm | Không chịu trách nhiệm |
| --- | --- | --- |
| Computer Vision | Ảnh hợp lệ → Top-K món + confidence | Suy luận toàn bộ nguyên liệu/định lượng từ ảnh món đã nấu |
| Retrieval/RAG | Chọn recipe phù hợp, có metadata và nguồn | Thay thế database bằng LLM hoặc truy xuất chỉ bằng embedding |
| LangGraph | Chưa có trong runtime; hướng mở rộng cho chat/state | Là dependency của luồng tra recipe hiện tại |
| Backend | Spring Boot API, validation, timeout, logging | Lưu tài khoản/lịch sử trong MVP; huấn luyện model hoặc render UI |
| Frontend | Web upload, xác nhận món, recipe; Expo dùng chung public API | Chat/step mode; gọi trực tiếp model, Qdrant hoặc LLM provider |

## Taxonomy bắt buộc: CV → Recipe

Mọi lớp dùng cùng một `normalized_dish` dạng `snake_case`.

```text
CV label: com_tam_suon
  → mapping có version: com_tam
  → retrieval filter: dish=com_tam, language=vi, cuisine=vietnamese
  → selected recipe: recipe_001
```

- Mapping được version-control tại `data/processed/30vnfoods-label-map.json`; không chép danh sách lớp riêng vào service khác.
- CV prediction chưa được người dùng xác nhận không được dùng để trả lời recipe cuối cùng.
- Người dùng luôn có thể chọn một mục Top-K hoặc sửa sang món khác, kể cả khi confidence cao.

## Retrieval policy hiện tại và mở rộng tương lai

1. Nhận `confirmed_dish`.
2. Lọc metadata theo `dish`, `language=vi`, `cuisine=vietnamese`.
3. Thực hiện vector retrieval trong tập đã lọc.
4. Runtime hiện tại không có reranker hoặc LLM fallback; thay đổi ranking cần version/evaluation riêng.
5. UI hiện hiển thị recipe trả về trực tiếp, không lưu state hội thoại phía server.

Vector similarity không được phép tự vượt qua filter món đã xác nhận. Recipe document phải được dựng từ schema đã validate, không nhúng HTML thô.

## API contract hiện tại và phần mở rộng dự kiến

Các route CV/recipe dưới đây thuộc API chạy hiện tại. Catalog, detail và health cũng được cung cấp theo [contract v1](contracts/mvp-v1.md). Chat chỉ là hợp đồng dự kiến cho milestone tương lai, chưa được cài trong backend:

| Endpoint | Request chính | Response tối thiểu |
| --- | --- | --- |
| `POST /api/vision/predict` | `multipart/form-data` image | `predictions[]` gồm `rank`, `class_id`, `normalized_dish`, `display_name`, `confidence` |
| `POST /api/recipes/search` | `confirmed_dish`, `top_k` | `recipes[]` gồm `id`, `title`, metadata và source |
| `POST /api/chat` (dự kiến) | `thread_id`, `message` | `message`, `current_step`, `selected_recipe_id`, state cần UI render |

- API dùng Java record DTO + Bean Validation; breaking change phải version contract.
- Spring controllers gọi `service/`; service gọi typed HTTP clients đến CV/recipe services trong `ai/` với timeout và error mapping. LangGraph là phần dự kiến, chưa có service trong runtime.
- Khi bổ sung tài khoản/lịch sử, Spring Data JPA/PostgreSQL lưu dữ liệu ứng dụng; Qdrant thuộc retrieval. LangGraph/checkpointer chỉ thêm ở milestone chat, không là dependency khởi động v1 hiện tại.
- Dùng springdoc annotations để sinh OpenAPI từ controller; không hand-maintain OpenAPI YAML.
- Backend xác thực loại/kích thước ảnh, giới hạn request, đặt timeout downstream và trả lỗi có mã ổn định.
- Frontend không giữ secret hoặc gọi trực tiếp Qdrant/LLM/model inference.

## LangGraph state & persistence

Phần này là thiết kế tương lai, chưa thuộc tiêu chí hoàn thành milestone Top-3/recipe hiện tại.

State tối thiểu:

```python
class CookingState(TypedDict):
    thread_id: str
    dish_candidates: list
    predicted_dish: str | None
    confirmed_dish: str | None
    confidence: float | None
    selected_recipe: dict | None
    ingredients: list
    instructions: list
    servings: int | None
    current_step: int
    user_constraints: dict
    messages: list
```

- `thread_id` bắt buộc trên mọi chat request.
- LangGraph service dùng checkpointer/persistence; state phải khôi phục được qua request độc lập và service restart. Spring Boot truyền `thread_id` và không tự sao chép business state của graph.
- `current_step` là 0-based trong state và 1-based trên UI.
- Intent router chỉ route các intent MVP: recipe question, substitution, technique, step navigation, serving adjustment, quantity conversion.
- Khi context thiếu dữ kiện, assistant phải nêu giới hạn; không bịa nguyên liệu, định lượng, thời gian hay kết luận an toàn thực phẩm.

## Observability, privacy & reliability

Mỗi request Spring Boot nên log theo `request_id`; dùng Actuator/Micrometer cho health và metrics khi service được khởi tạo:

```text
model_version, prediction confidence, normalized_dish,
retrieved recipe IDs/scores, selected_recipe_id, routed intent,
current_step, latency theo component, error code
```

Không log API key, ảnh gốc, secrets hoặc nội dung hội thoại không cần cho vận hành. Ảnh upload chỉ lưu khi thực sự cần và phải có thời hạn xóa rõ ràng.

## Evaluation gates

Trước khi gọi MVP là hoàn thành, nhóm phải chốt ngưỡng cụ thể cho các chỉ số sau theo tập món được hỗ trợ:

- CV: Top-1, Top-3, Macro F1, latency, model size.
- Retrieval: Hit@1, Hit@3, Recall@5, MRR.
- Assistant: groundedness, recipe consistency, hallucination rate, step consistency.
- End-to-end: tỷ lệ hoàn tất luồng, tỉ lệ yêu cầu xác nhận được xử lý đúng, lỗi/timeout.

Metric không có ngưỡng là metric theo dõi, chưa phải tiêu chí nghiệm thu.
