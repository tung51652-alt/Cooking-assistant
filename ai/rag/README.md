# CookLens recipes — Phase 2

FastAPI service nội bộ: `POST /search`, `GET /recipes/{id}`, `GET /dishes`, `GET /health/live`, `GET /health/ready`, Swagger `/docs`. Public envelope và `/api` thuộc gateway ở Phase 3. Không có LLM/chatbot/web search trong runtime.

Corpus hiện có **21 recipe, phủ 18/30 món**, nguồn/giấy phép/chỉnh sửa trong từng recipe. Xem [data README](../../data/recipes/README.md). Món hợp lệ còn thiếu trả danh sách rỗng; index không sẵn sàng trả 503. Chưa đóng Phase 2 hoặc được chấp nhận phát hành đủ 30 món.

## Cấu trúc

- `api/main.py`: DTO, JSON tối đa 8 KiB/5 giây nhận body, admission 4 request, request ID, lỗi an toàn, endpoints.
- `embeddings/local.py`: model E5 local load một lần, prefix query/passage, mean pooling + L2, chiều 384, tối đa 512 tokens.
- `ingestion/bundle.py`: validate corpus dùng chung và precompute vectors trước build image; không tính toàn corpus khi boot.
- `ingestion/seed.py`: CLI one-shot dùng cùng image với API; chỉ cần corpus/vectors và Qdrant, không load embedding.
- `retrieval/store.py`: Qdrant REST qua httpx, filter metadata trước cosine; exact search trong corpus nhỏ, sort score rồi ID. Không reranker.
- `evaluation/`: 150 query cố định dạng draft và công cụ đo. Chưa review độc lập; 60 query thuộc món thiếu phải trả rỗng và không được tính vào Hit/MRR. 15 query thuộc ba món có hai biến thể, phần lớn query còn lại chỉ có một ứng viên, nên metric cao không chứng minh chất lượng xếp hạng tổng quát.
- `tests/test_runtime.py`: hồi quy với model và Qdrant thật; có fault injection riêng cho timeout, quá tải, alias sai và import lỗi.

## Build và chạy local

Từ thư mục gốc repo, dùng Python 3.12/venv riêng nếu chạy mã trực tiếp:

```sh
python3 deploy/scripts/fetch_embedding_model.py
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
python -m pip install -r ai/rag/requirements.txt
python -m ai.rag.ingestion.bundle --model deploy/artifacts/staging/embedding --output deploy/artifacts/staging/recipes
docker build -f deploy/docker/Dockerfile.recipes -t cooklens-recipes:phase2 .
docker compose -f deploy/compose/recipes.phase2.yml up -d
```

Swagger: http://127.0.0.1:8001/docs. Search ví dụ:

```json
{"confirmed_dish":"pho","query":"phở bò","top_k":3}
```

Đây là Compose kiểm tra riêng Phase 2, chưa phải Compose sản phẩm bốn service. Model/tokenizer/corpus/vectors đã ở trong image; fetch/build cần Internet, container runtime không tải thêm model hoặc công thức. Backend/frontend sẽ dùng chung origin và không gọi thẳng cổng này trong bản phát hành.

## Index và vận hành

Collection chứa corpus/embedding version trong tên. Mỗi recipe một point với ID số ổn định theo bundle, các payload index keyword cho món, ngôn ngữ, cuisine và ba version. Init kiểm tra count/dimension/nội dung payload/vector trước đổi alias active nguyên tử. Chạy lại version hợp lệ không upsert lại hoặc thêm point. API kiểm tra alias, dimension, status, count và indices; startup đối chiếu toàn bộ nội dung nếu Qdrant đã sẵn sàng.

Chỉ chạy **một init job mỗi lần**; kiểm tra alias trước chuyển không thay thế distributed lock giữa nhiều người vận hành. Khi một import dở dang/sai version đã tồn tại, init từ chối ghi đè. Operator cần kiểm tra và xóa riêng collection chưa active, hoặc xuất bundle với version mới; không tự xóa collection đang phục vụ hay các version rollback. Thay corpus/model cần version mới và precompute lại, không sửa bundle đang active tại chỗ. Quản lý rollback/volume toàn stack thuộc Phase 5/7.

API chạy non-root, read-only, một worker; baseline CPU 4 thread và 2 GiB RAM. Qdrant chính thức giữ user mặc định của upstream và volume ghi riêng trong Compose; không chứa khóa/provider từ notebook. Không mở cổng Qdrant ra host trong Compose.

## Kiểm tra

```sh
python3 -m unittest discover -s data/tests -v
python3 deploy/scripts/check_public_metadata.py
python3 deploy/scripts/smoke_recipes_container.py --image cooklens-recipes:phase2
python -m ai.rag.evaluation.evaluate --url http://127.0.0.1:8001
```

Để chạy runtime tests bằng Python, đặt `QDRANT_URL`, `RECIPES_BUNDLE_DIR`, `EMBEDDING_MODEL_DIR` trỏ đến Qdrant riêng và bundle/model local, rồi `python -m unittest discover -s ai/rag/tests -v`. Không dùng database sản phẩm cho test import lỗi.

Smoke tạo Qdrant và mạng internal riêng, chạy seed hai lần, API thật và 100 search trong image offline/read-only/non-root; thu dọn đúng tài nguyên do nó tạo. Evidence và giới hạn nằm ở [báo cáo Phase 2](../../docs/phases/phase-2.md). Test/evaluation/model downloader không được COPY vào image. Giữ fixture/query hồi quy hữu ích, không giữ raw crawl/log/cache tạm hoặc literal secret/hash trong nội dung project.
