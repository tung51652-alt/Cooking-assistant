# Chuẩn kỹ thuật MVP

Tài liệu này là chuẩn kỹ thuật chung cho CookLens. Nó ưu tiên tính đúng đắn của luồng **ảnh → món xác nhận → recipe có nguồn → hướng dẫn có state**, không tối ưu hóa cho mô hình hay agent phức tạp nhất.

## Ranh giới trách nhiệm

| Lớp | Chịu trách nhiệm | Không chịu trách nhiệm |
| --- | --- | --- |
| Computer Vision | Ảnh hợp lệ → Top-K món + confidence | Suy luận toàn bộ nguyên liệu/định lượng từ ảnh món đã nấu |
| Retrieval/RAG | Chọn recipe phù hợp, có metadata và nguồn | Thay thế database bằng LLM hoặc truy xuất chỉ bằng embedding |
| LangGraph | Điều phối state, xác nhận, intent, step navigation | Tạo một agent riêng cho từng intent |
| Backend | Spring Boot API, validation, persistence, timeout, logging | Huấn luyện model, RAG ingestion hoặc render UI |
| Frontend | Upload/camera, xác nhận món, recipe, chat, step mode | Gọi trực tiếp model, Qdrant hoặc LLM provider |

## Taxonomy bắt buộc: CV → Recipe

Mọi lớp dùng cùng một `normalized_dish` dạng `snake_case`.

```text
CV label: com_tam_suon
  → mapping có version: com_tam
  → retrieval filter: dish=com_tam, language=vi, cuisine=vietnamese
  → selected recipe: recipe_001
```

- Mapping được version-control trong `data/processed/` khi bắt đầu xây data pipeline.
- CV prediction chưa được người dùng xác nhận không được dùng để trả lời recipe cuối cùng.
- Người dùng luôn có thể chọn một mục Top-K hoặc sửa sang món khác, kể cả khi confidence cao.

## Retrieval policy

1. Nhận `confirmed_dish`.
2. Lọc metadata theo `dish`, `language=vi`, `cuisine=vietnamese`.
3. Thực hiện vector retrieval trong tập đã lọc.
4. Rerank khi có nhiều recipe tương thích.
5. Lưu `selected_recipe.id` cùng source provenance vào state.
6. Chỉ đưa recipe đã chọn và context liên quan vào LLM.

Vector similarity không được phép tự vượt qua filter món đã xác nhận. Recipe document phải được dựng từ schema đã validate, không nhúng HTML thô.

## API contract tối thiểu

| Endpoint | Request chính | Response tối thiểu |
| --- | --- | --- |
| `POST /api/vision/predict` | `multipart/form-data` image | `predictions[]` gồm `dish`, `confidence`, `model_version` |
| `POST /api/recipes/search` | `confirmed_dish`, `top_k` | `recipes[]` gồm `id`, `title`, metadata và source |
| `POST /api/chat` | `thread_id`, `message` | `message`, `current_step`, `selected_recipe_id`, state cần UI render |

- API dùng Java record DTO + Bean Validation; breaking change phải version contract.
- Spring controllers gọi `service/`; service gọi typed HTTP clients đến CV/RAG/LangGraph services trong `ai/` với timeout và error mapping.
- Spring Data JPA/PostgreSQL lưu dữ liệu ứng dụng; Qdrant và LangGraph checkpointer thuộc các dịch vụ AI.
- Dùng springdoc annotations để sinh OpenAPI từ controller; không hand-maintain OpenAPI YAML.
- Backend xác thực loại/kích thước ảnh, giới hạn request, đặt timeout downstream và trả lỗi có mã ổn định.
- Frontend không giữ secret hoặc gọi trực tiếp Qdrant/LLM/model inference.

## LangGraph state & persistence

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
