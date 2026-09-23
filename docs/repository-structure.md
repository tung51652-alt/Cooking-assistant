# Cấu trúc repository CookLens

## Nguyên tắc

Repository được tổ chức theo sáu miền trách nhiệm để mọi thành viên biết mã, dữ liệu, hạ tầng và tài liệu thuộc về đâu. Thư mục cấp cao nhất chỉ gồm `ai`, `data`, `backend`, `frontend`, `deploy`, `docs` (ngoài file cấu hình gốc như `README.md`).

```text
.
├── ai/
│   ├── cv/
│   │   ├── training/          # Datamodule, train/evaluate scripts, configs
│   │   ├── inference/         # Preprocessing, model loader, prediction service
│   │   └── experiments/       # Config/metadata experiment; không chứa weights lớn
│   ├── rag/
│   │   ├── ingestion/         # Nạp recipe đã chuẩn hóa vào vector DB
│   │   ├── preprocessing/     # Chunking, text construction, metadata mapping
│   │   ├── embeddings/        # Embedding adapters và batch jobs
│   │   ├── retrieval/         # Retriever, filter, reranker
│   │   └── evaluation/        # Hit@K, MRR, groundedness evaluation
│   ├── agents/
│   │   ├── nodes/             # LangGraph nodes
│   │   ├── tools/             # Recipe search, đổi đơn vị, tính khẩu phần
│   │   ├── prompts/           # Prompt có version
│   │   ├── graph.py           # Graph assembly
│   │   └── state.py           # CookingState và schema state
│   └── evaluation/            # Test/evaluation dùng chung cho CV, RAG, agent
├── data/
│   ├── raw/                   # Bản gốc bất biến + source manifest
│   ├── interim/               # Dữ liệu sau cleaning, trước validation
│   ├── processed/             # Dữ liệu đạt schema validation
│   ├── recipes/               # Recipe JSON chuẩn cho MVP
│   └── README.md              # Data contract và cách lấy dữ liệu (sẽ thêm)
├── backend/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/cooklens/
│   │   │   │   ├── controller/ # REST controllers: vision, recipes, chat, health
│   │   │   │   ├── service/    # Điều phối use case và transaction boundary
│   │   │   │   ├── client/     # HTTP clients gọi các dịch vụ trong ai/
│   │   │   │   ├── dto/        # Request/response records và ApiResponse
│   │   │   │   ├── domain/     # JPA entities chỉ cho dữ liệu ứng dụng
│   │   │   │   ├── repository/ # Spring Data JPA repositories
│   │   │   │   ├── config/     # Security, OpenAPI, HTTP client, observability
│   │   │   │   └── exception/  # ControllerAdvice và error contract
│   │   │   └── resources/application.yml
│   │   └── test/java/com/cooklens/ # JUnit unit/integration tests
│   └── pom.xml                # Maven build và dependency lock
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js routes/pages
│   │   ├── components/        # UI tái sử dụng
│   │   ├── features/          # upload, recipe, chat, cooking mode
│   │   ├── lib/               # API client, utility
│   │   └── types/             # Shared frontend types
│   ├── public/
│   └── package.json
├── deploy/
│   ├── docker/                # Dockerfile từng service
│   ├── compose/               # local/staging compose files
│   ├── ci/                    # CI workflow/templates nếu không để .github/
│   ├── scripts/               # migrate, seed, release scripts
│   └── env/                   # Chỉ .env.example, tuyệt đối không secret
└── docs/
    ├── cv/                    # Dataset, model, train results
    ├── data/                  # Data/RAG schema và nguồn dữ liệu
    ├── langgraph/             # Workflow, state, quyết định graph
    ├── repository-structure.md
    └── README.md
```

## Trách nhiệm từng miền

| Thư mục | Sở hữu / mục đích | Không đặt ở đây |
| --- | --- | --- |
| `ai/` | Logic ML/LLM, training, inference, retrieval, agent evaluation | Raw data, API routes, Docker secrets, model weights lớn |
| `data/` | Dataset manifest, pipeline artifacts và recipe đã chuẩn hóa | Source code ứng dụng, credentials, dữ liệu không rõ quyền |
| `backend/` | API contract, business orchestration, persistence adapters | Train notebook hoặc UI React |
| `frontend/` | Trải nghiệm web/PWA và client API | Khóa API, logic training/model |
| `deploy/` | Cách chạy, build, deploy, CI/CD | `.env` thật, dữ liệu hoặc weights |
| `docs/` | Quyết định, schema, runbook, kết quả được đọc bởi con người | Dữ liệu gốc hay output lớn |

## Quy ước dependency

```text
frontend → backend → ai
                   ↘ data / vector DB / PostgreSQL
backend + frontend → deploy
mọi miền → docs (tham chiếu, không import runtime)
```

`ai/` không được import Spring controller. `backend/` gọi các dịch vụ AI qua HTTP client/interface rõ ràng. `frontend/` chỉ giao tiếp qua OpenAPI contract, không gọi trực tiếp Qdrant hay model provider.

## Quy ước commit dữ liệu và artifact

- Không commit ảnh dataset, checkpoints, vector index, `.env`, token hoặc log chứa dữ liệu người dùng.
- `data/raw` lưu source manifest gồm nguồn, license, version/checksum và ngày lấy dữ liệu.
- Experiment CV/RAG lưu config, seed, chỉ số và link artifact; bảng tổng hợp nằm trong `docs/cv` hoặc `docs/data`.
- Khi thêm module, tạo test cạnh module hoặc trong `backend/tests`; mô tả cách chạy trong tài liệu liên quan.

## Lộ trình tạo mã

1. Tạo `data` contract và corpus recipe MVP trước.
2. Khởi tạo `ai/cv` và `ai/rag` độc lập, có evaluation riêng.
3. Xây `ai/agents` sau khi retrieval đã có contract ổn định.
4. Khởi tạo Spring Boot module trong `backend/src/main/java/com/cooklens` để phơi OpenAPI contract.
5. Xây `frontend` theo endpoint đã chốt.
6. Bổ sung Docker/CI trong `deploy` khi có ít nhất một service chạy được.
