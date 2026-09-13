# CookLens

> Vision-RAG cooking assistant: nhận diện món Việt từ ảnh, truy xuất công thức có căn cứ và hướng dẫn nấu theo ngữ cảnh.

## Mục tiêu MVP

`Ảnh một món Việt → Nhận diện món → Xác nhận món → Tìm recipe → Chat / hướng dẫn từng bước`

Ảnh chỉ trả lời **đây là món gì**. Nguyên liệu và hướng dẫn là nội dung recipe được truy xuất, không phải thành phần phát hiện từ pixel.

## Tài liệu nhóm

| Tài liệu | Nội dung |
| --- | --- |
| [CV](docs/cv/README.md) | Dataset, model, thí nghiệm và chỉ số train. |
| [LangGraph](docs/langgraph/README.md) | State, workflow, node và kiến trúc. |
| [Data & RAG](docs/data/README.md) | Nguồn dữ liệu, quyền, schema và ingestion. |

## Cấu trúc repository

```text
apps/api/              FastAPI API
apps/web/              Next.js / React PWA
services/vision/       preprocessing và inference CV
services/rag/          ingestion, embedding, retrieval, reranking
agents/nodes|tools|prompts/
training/              train/evaluate CV
data/raw|interim|processed|recipes/
evaluation/cv|retrieval|rag/
tests/
docs/                  tài liệu dùng chung
```

Các thư mục chỉ là khung xương. Không commit dataset lớn, weights, API key hoặc dữ liệu người dùng.

## Theo dõi triển khai

Quy ước: `[x]` đã xong có bằng chứng; `[~]` đang làm; `[ ]` chưa bắt đầu. Khi hoàn thành, thêm link PR/issue/kết quả.

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
| Web/API | Next.js, React, Tailwind, PWA / FastAPI REST |
| CV | PyTorch, PyTorch Lightning |
| Orchestration | LangGraph |
| RAG | Qdrant, multilingual embedding, reranker |
| Storage/infra | PostgreSQL, Docker |
