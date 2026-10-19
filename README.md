# CookLens

> Vision-RAG cooking assistant: nhận diện món Việt từ ảnh, truy xuất công thức có căn cứ và hướng dẫn nấu theo ngữ cảnh.

## Mục tiêu MVP

Milestone đang triển khai: **ảnh một món Việt → Top-3 món → người dùng xác nhận/sửa → tối đa 3 công thức liên quan → xem chi tiết**. Frontend tận dụng khung HTML CookLens có sẵn; mục tiêu phát hành bằng Docker với trọng số/model embedding/corpus đi kèm image.

Xem [kế hoạch từng phase](docs/plans/top3-recipes-docker-mvp.md), [contract v1](docs/contracts/mvp-v1.md) và [trạng thái Phase 0](docs/phases/phase-0.md). Chưa có stack Docker hoặc các endpoint public chạy được trên `develop`; phase hiện tại chốt đầu vào/contract. Các phần CV đang có trên nhánh riêng, chưa được coi là tính năng đã tích hợp.

Chat, LangGraph hướng dẫn có state, tài khoản/lịch sử và cooking assistant thuộc roadmap sau milestone này. Mục tiêu dài hạn:

`Ảnh một món Việt → Nhận diện món → Xác nhận món → Tìm recipe → Chat / hướng dẫn từng bước`

Ảnh chỉ trả lời **đây là món gì**. Nguyên liệu và hướng dẫn là nội dung recipe được truy xuất, không phải thành phần phát hiện từ pixel.

## Tài liệu nhóm

| Tài liệu | Nội dung |
| --- | --- |
| [CV](docs/cv/README.md) | Dataset, model, thí nghiệm và chỉ số train. |
| [LangGraph](docs/langgraph/README.md) | State, workflow, node và kiến trúc. |
| [Data & RAG](docs/data/README.md) | Nguồn dữ liệu, quyền, schema và ingestion. |
| [Chuẩn kỹ thuật MVP](docs/technical-architecture.md) | Contract CV–RAG, API, state persistence, observability và evaluation gates. |

## Cấu trúc repository

```text
ai/                    Computer Vision, RAG, LangGraph và evaluation AI
data/                  Dữ liệu gốc, trung gian, đã xử lý và recipes
backend/               Spring Boot API, orchestration, persistence và backend tests
frontend/              React/TypeScript, tái sử dụng khung HTML CookLens
deploy/                Docker, compose, CI/CD và cấu hình môi trường triển khai
docs/                  Tài liệu dùng chung và quyết định kỹ thuật
```

Xem cấu trúc chi tiết và quy ước đặt mã tại [docs/repository-structure.md](docs/repository-structure.md).

Các thư mục chỉ là khung xương. Không commit dataset lớn, weights, API key hoặc dữ liệu người dùng.

## Theo dõi triển khai

Quy ước: `[x]` đã xong có bằng chứng; `[~]` đang làm; `[ ]` chưa bắt đầu. Khi hoàn thành, thêm link PR/issue/kết quả.

Checklist bên dưới là roadmap ban đầu, không phải số phase hiện hành hoặc xác nhận tính năng trên mọi nhánh. Dùng [kế hoạch Top-3](docs/plans/top3-recipes-docker-mvp.md) và báo cáo từng phase để theo dõi milestone đang giao. Agent tạo PR, người dùng merge; phần phụ thuộc chỉ tiếp tục sau khi xác nhận `origin/develop` đã cập nhật.

### Phase 0 — Khởi tạo

- [x] Chốt bài toán và scope MVP.
- [x] Tạo tracker, skeleton folder và tài liệu chung.
- [ ] Phân công CV, Data/RAG, Backend/Graph và Frontend.
- [ ] Thêm `.gitignore`, `.env.example`, format/lint và CI.

### Phase 1 — Computer Vision

- [ ] Xác minh quyền sử dụng, tải 30VNFoods và làm EDA/split tái lập được.
- [ ] Train baseline, so sánh model; đo Top-1, Top-3, Macro F1, Precision, Recall, confusion matrix.
- [ ] Chọn confidence threshold; confidence thấp phải yêu cầu xác nhận.
- [ ] Export model, đo latency và tạo `POST /api/vision/predict`.

Xem [tài liệu CV](docs/cv/README.md).

### Phase 2 — Data & Recipe Knowledge Base

- [ ] Chốt nguồn recipe có quyền phù hợp; lưu source manifest.
- [ ] Làm sạch, chuẩn hóa món/nguyên liệu/đơn vị, loại trùng.
- [ ] Validate recipe schema và tạo corpus MVP được review.

Xem [tài liệu Data/RAG](docs/data/README.md).

### Phase 3 — Retrieval & RAG

- [ ] Chọn multilingual embedding, chunking và Qdrant/vector DB.
- [ ] Nạp recipe; filter theo dish/language/cuisine; xây retrieval + reranking.
- [ ] Đánh giá Hit@1, Hit@3, Recall@5, MRR.
- [ ] Tạo `POST /api/recipes/search`, kiểm tra đáp án bám recipe.

### Phase 4 — LangGraph Cooking Assistant

- [ ] Chốt `CookingState`, persistence và `thread_id`.
- [ ] Xây confidence gate, user confirmation, retrieve/select/parse recipe.
- [ ] Intent router: recipe, thay nguyên liệu, kỹ thuật, bước nấu, khẩu phần, đổi đơn vị.
- [ ] Step-by-step với `current_step`; tạo `POST /api/chat` và test đa lượt.

Xem [tài liệu LangGraph](docs/langgraph/README.md).

### Phase 5 — Frontend

- [ ] Khởi tạo responsive web/PWA.
- [ ] Camera/upload, Top-K prediction, xác nhận món, recipe view, chat, cooking mode.
- [ ] Kiểm thử desktop và mobile.

### Phase 6 — Tích hợp & đánh giá MVP

- [ ] Hoàn thiện luồng ảnh → xác nhận → recipe → chat → bước nấu.
- [ ] Integration test, xử lý lỗi/timeout, đánh giá end-to-end và demo.

## MVP Done

- Tải/chụp ảnh trên desktop/mobile; Top-K và xác nhận khi confidence thấp.
- Recipe phù hợp ổn định Top-5 cho món hỗ trợ.
- Câu trả lời bám recipe; không mất bước nấu trong phiên.

## Stack đề xuất

| Layer | Lựa chọn |
| --- | --- |
| Web/API | Milestone hiện tại: React/TypeScript/Vite + CSS khung CookLens, Nginx / Java 21, Spring Boot REST; framework version khóa khi dựng service |
| CV | PyTorch, PyTorch Lightning |
| Orchestration | Backend HTTP cho milestone hiện tại; LangGraph ở roadmap chat sau |
| Retrieval | Qdrant + multilingual-e5-small local; filter món trước cosine ranking, chưa reranker |
| Storage/infra | Docker Compose + Qdrant volume; PostgreSQL khi có dữ liệu ứng dụng cần lưu |
