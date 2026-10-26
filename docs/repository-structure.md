# Cấu trúc repository CookLens

Trạng thái hiện tại theo [kế hoạch Top-3/recipe](plans/top3-recipes-docker-mvp.md), [contract v1](contracts/mvp-v1.md) và [quyết định runtime](decisions/mvp-runtime.md): Phase 0–5 đã merge, Phase 6–7 chưa hoàn tất. Sơ đồ bên dưới là bản đồ khái niệm, không phải danh sách đầy đủ file; thành phần ghi rõ "dự kiến" chưa thuộc runtime. Frontend production là React/TypeScript/Vite. PostgreSQL và LangGraph/chat chưa được khởi tạo. Snapshot HTML tại `docs/frontend-reference/` chỉ là tài liệu, không là source production thứ hai.

## Nguyên tắc

Repository chia mã theo service, dữ liệu, client, triển khai và tài liệu. `mobile/` cùng `packages/` hiện có ở PR Expo #17, chưa nằm trong `develop`.

```text
.
├── ai/
│   ├── cv/
│   │   ├── training/          # Datamodule, train/evaluate scripts, configs
│   │   ├── inference/         # Preprocessing, model loader, prediction service
│   │   └── experiments/       # Config/metadata experiment; không chứa weights lớn
│   ├── rag/
│   │   ├── ingestion/         # Nạp recipe đã chuẩn hóa vào vector DB
│   │   ├── embeddings/        # Local embedding adapter
│   │   ├── retrieval/         # Vector search, metadata filter, stable ranking
│   │   └── evaluation/        # Hit@K, MRR, groundedness evaluation
│   ├── agents/                # Dự kiến cho milestone chat, chưa có runtime
│   └── evaluation/            # Dự kiến cho đánh giá liên service
├── data/
│   ├── raw/                   # Source manifest; không chứa bộ ảnh lớn
│   ├── interim/               # Báo cáo audit dữ liệu
│   ├── processed/             # Taxonomy và split manifest
│   ├── recipes/               # Corpus recipe, provenance, validator
│   └── tests/                 # Test corpus và taxonomy
├── backend/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/cooklens/
│   │   │   │   ├── controller/ # Public REST API
│   │   │   │   ├── service/    # Điều phối Top-3/recipe
│   │   │   │   ├── client/     # HTTP clients gọi AI services
│   │   │   │   ├── dto/        # Request/response records
│   │   │   │   ├── config/     # Health, request guard, web config
│   │   │   │   └── exception/  # ControllerAdvice và error contract
│   │   │   └── resources/application.yml
│   │   └── test/java/com/cooklens/ # JUnit unit/integration tests
│   └── pom.xml                # Maven build và dependency declarations
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Web view state
│   │   ├── features/          # Upload, recognition, recipe detail
│   │   ├── lib/               # API client
│   │   ├── generated/         # OpenAPI TypeScript contract
│   │   └── styles.css
│   ├── public/                # Fonts, icons, notices
│   └── package.json           # Vite/React/TypeScript
├── deploy/
│   ├── docker/                # Dockerfile từng service
│   ├── compose/               # Compose release và overlay dev/review
│   ├── scripts/               # Artifact, validation, smoke scripts
│   ├── tests/                 # Deploy/release regression tests
│   └── env/                   # Chỉ .env.example, tuyệt đối không secret
├── .github/workflows/         # CI workflows
├── mobile/                    # Expo app trên PR #17, chưa merge vào develop
├── packages/                  # Shared API client/contract trên PR #17
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
| `ai/` | CV inference, embedding/retrieval/ingestion; chat agent còn dự kiến | Raw data không kiểm soát, API routes, Docker secrets, model weights lớn |
| `data/` | Dataset manifest, pipeline artifacts và recipe đã chuẩn hóa | Source code ứng dụng, credentials, dữ liệu không rõ quyền |
| `backend/` | Public API contract và orchestration; hiện không lưu tài khoản/lịch sử | Train notebook hoặc UI React |
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
- `data/raw` lưu source manifest gồm nguồn, license, version và ngày lấy dữ liệu.
- Experiment CV/RAG lưu config, seed, chỉ số và link artifact; bảng tổng hợp nằm trong `docs/cv` hoặc `docs/data`.
- Khi thêm module, tạo test cạnh module hoặc trong `backend/tests`; mô tả cách chạy trong tài liệu liên quan.

## Lộ trình tạo mã

1. Tạo `data` contract và corpus recipe MVP trước.
2. Khởi tạo `ai/cv` và `ai/rag` độc lập, có evaluation riêng.
3. Xây `ai/agents` sau khi retrieval đã có contract ổn định.
4. Khởi tạo Spring Boot module trong `backend/src/main/java/com/cooklens` để phơi OpenAPI contract.
5. Xây `frontend` theo endpoint đã chốt.
6. Bổ sung Docker/CI trong `deploy` khi có ít nhất một service chạy được.
