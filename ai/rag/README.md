# Recipes service

API công thức dùng multilingual-e5-small và Qdrant, truy xuất từ 33 công thức phủ
30 món. Không gọi LLM/web search lúc runtime. Nguồn và giấy phép ở
[data/recipes](../../data/recipes/README.md); model ở [artifact manifest](../../deploy/artifacts/manifest.json).

## API nội bộ

| Route | Chức năng |
| --- | --- |
| `GET /dishes` | Danh mục theo taxonomy chung |
| `POST /search` | Tìm theo món đã xác nhận, query tùy chọn và `top_k` 1–3 |
| `GET /recipes/{id}` | Chi tiết nguyên liệu, bước nấu và nguồn |
| `GET /health/live`, `/health/ready` | Trạng thái process và model/index |

Lọc món/ngôn ngữ/ẩm thực trước vector search, cosine giảm dần và tie-break ID.
Không trả món khác hoặc tự tạo recipe khi không có dữ liệu. Client truy cập qua
public gateway; xem [contract](../../docs/contracts/mvp-v1.md).

## Docker

Từ root repository, `docker compose up` chạy toàn dự án bằng image đã đóng gói.
Recipes và job `recipe-init` dùng chung image; Qdrant giữ index trong named volume.
Không publish trực tiếp cổng recipes/Qdrant ra host.

Dockerfile tại `ai/rag/Dockerfile`, dùng context root. Khi cần build source,
chuẩn bị embedding và vector bundle theo [development.md](../../docs/development.md).
Runtime CPU 4 thread, RAM budget 2 GiB, non-root/read-only; model và dữ liệu nằm trong image.

## Index và vận hành

- Collection mang version corpus/embedding; mỗi recipe có ID ổn định và metadata filter.
- Init kiểm tra manifest, vector, dimension và payload trước khi đổi alias active.
- Chạy lại bundle hợp lệ không tạo thêm dữ liệu; API chỉ ready khi index/version phù hợp.
- Chỉ chạy một init job mỗi lần; không ghi đè dữ liệu dưới version đã công bố.
- Nếu seed dở/sai, xử lý collection chưa active hoặc xuất version mới; không xóa collection đang phục vụ.
- Giữ collection và bộ image cũ để rollback; xem [deployment.md](../../docs/deployment.md).

## Kiểm tra

Corpus: `python3 data/recipes/validate.py --require-full-coverage` từ root.
Smoke image riêng: `python3 deploy/scripts/smoke_recipes_container.py --image cooklens-recipes:local`
(sau khi build image local). Harness tạo và thu dọn tài nguyên riêng.

[recipe_evaluation.py](../../deploy/scripts/recipe_evaluation.py) chạy bộ 204 query
trong container recipes, không mở cổng AI; CI dùng cùng helper với nghiệm thu.
Kết quả và giới hạn ở [acceptance.md](../../docs/acceptance.md).
