# Kiểm thử

## Các lớp kiểm tra

| Lớp | Mục đích |
| --- | --- |
| Unit/contract | Taxonomy, schema, validation, phiên, client và đóng gói |
| Browser với API mô phỏng | Lỗi, retry, response đến muộn, escaping và state trên desktop/mobile viewport |
| Integration bằng image thật | Ảnh → xác nhận món → công thức → trợ lý, readiness và phục hồi |
| Evaluation | Accuracy CV, truy xuất, latency, tài nguyên và chất lượng trợ lý |

Build hoặc smoke pass không thay thế accuracy.
Mỗi số đo ghi bộ version, tập đánh giá, cấu hình máy, cách lấy mẫu và giới hạn diễn giải.

## Kiểm tra source

Cài dependency theo [development.md](development.md); Playwright cần `npx playwright install chromium` trong `frontend/`.

```sh
python3 -m unittest discover -s deploy/tests -q
python3 -m unittest discover -s data/tests -q
python3 data/recipes/validate.py --require-full-coverage
mvn -B -q -f backend/pom.xml test
npm --prefix frontend run build
npm --prefix frontend run test:e2e
node --experimental-strip-types --test packages/cooklens-api/client.test.mjs
npm --prefix mobile run test:assistant
npm --prefix mobile run typecheck
python3 deploy/scripts/check_public_metadata.py
```

Suite web chạy `flow.spec.ts` và `assistant.spec.ts` với API mô phỏng trên desktop và mobile viewport.
`real-flow.spec.ts` chạy trên stack thật khi đặt `COOKLENS_REAL_API=1` và `COOKLENS_BASE_URL`;
thêm `COOKLENS_REAL_ASSISTANT=1` khi backend có key, và `COOKLENS_LIGHTBULB_IMAGE` để chạy ca ảnh ngoài danh mục.
Kiểm tra native theo [mobile README](../mobile/README.md); browser emulation không thay thế thiết bị thật.

### Lint và format

```sh
ruff check ai data deploy
npm --prefix frontend run lint
npm --prefix frontend run format:check
mvn -B -q -f backend/pom.xml spotless:check
```

### AI services

Test chạy bằng Python 3.12 trong venv riêng với artifact đã staging theo [development.md](development.md), giống [vision.yml](../.github/workflows/vision.yml) và [recipes.yml](../.github/workflows/recipes.yml).

```sh
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1 torchvision==0.29.1
python -m pip install -r ai/cv/inference/requirements-test.txt -r ai/rag/requirements.txt
python deploy/scripts/fetch_vision_checkpoint.py
python -m unittest discover -s ai/cv/inference/tests -v
```

`ai/rag/tests/test_runtime.py` cần một Qdrant riêng (không dùng volume của stack đang chạy):

```sh
docker run -d --name cooklens-recipes-test-qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.19.2
QDRANT_URL=http://127.0.0.1:6333 \
RECIPES_BUNDLE_DIR=deploy/artifacts/staging/recipes \
EMBEDDING_MODEL_DIR=deploy/artifacts/staging/embedding \
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
python -m unittest discover -s ai/rag/tests -v
docker rm -f cooklens-recipes-test-qdrant
```

Smoke vision epoch 5 dùng image build từ checkpoint nội bộ theo [hướng dẫn build từ source](development.md#chuẩn-bị-artifact).
Dùng `python deploy/scripts/smoke_vision_container.py --image cooklens-vision:local` để xác nhận phiên bản model.
Smoke recipes dùng `python deploy/scripts/smoke_recipes_container.py`.

Đặt `COOKLENS_VISION_MODEL_VERSION=efficientnet-b2-32class-epoch5` khi chạy `real-flow.spec.ts` trên stack epoch 5 để kiểm tra đúng phiên bản.
Để chấm lại checkpoint đang staging trên cùng tập Test, dùng:

```sh
python -m deploy.scripts.evaluate_release_vision --archive /path/to/30VNFoods/test.zip \
  --manifest data/processed/manifests/30vnfoods_clean_split_manifest.csv --candidate local-epoch5
```

Đặt `FOOD_MODEL_PATH` trỏ tới file `efficientnet_b2_legacy.pt` khi chạy cùng lệnh với checkpoint 30 lớp.

## Nghiệm thu bộ image

[Workflow acceptance](../.github/workflows/acceptance.yml) chạy thủ công với manifest và query từ tag phát hành, cùng phiên bản image đang kiểm tra.
Workflow đánh giá CV trên 5.004 ảnh `Test` của [split manifest](../data/processed/manifests/30vnfoods_clean_split_manifest.csv),
chạy 30 luồng ảnh bằng [flow runner](../deploy/scripts/accept_release_flow.py) và kiểm tra browser desktop/mobile.
Flow runner lấy ảnh đầu mỗi lớp; ảnh bị từ chối vẫn tra công thức qua món chọn thủ công và được tách khỏi accuracy.
[Recipes runtime](../.github/workflows/recipes.yml) dùng corpus và query từ source đang review.

Runtime/lifecycle trên máy đã có image:

```sh
python3 deploy/scripts/smoke_release_stack.py --samples 100 --report /tmp/cooklens-runtime.json
```

Các runner Compose tạo project/volume riêng, ép key LLM trống và thu dọn trong `finally`.

## Tiêu chí đạt

| Hạng mục | Ngưỡng/điều kiện |
| --- | --- |
| CV | Top-3 ≥95% trên clean split cố định; báo Top-1 và Macro F1 |
| Taxonomy/corpus | Khớp 30 lớp; mỗi món có ít nhất một công thức hợp lệ và có nguồn |
| Retrieval | ≥150 query, đủ 30 món; Hit@1 ≥0,90; Hit@3 ≥0,95; không lẫn món |
| API latency | P95 vision ≤10 s, search ≤3 s; ≥100 mẫu warm, concurrency 1 |
| Runtime | Seed, persistence, lỗi seed, upgrade/rollback, dependency recovery và offline |
| Client | Xác nhận thủ công; lỗi/rỗng/retry; không hiện response cũ hoặc nguồn không an toàn |
| Trợ lý — latency | `/messages` p50 ≤2,5 s, p95 ≤6 s, tối đa ≤8 s |
| Trợ lý — usage | Input trung bình ≤4.000 (p95 ≤6.000) token; output trung bình ≤350 (tối đa 512) token |
| Trợ lý — chất lượng | 100% ở nhóm an toàn/state/bảo mật; ≥90% hỏi đáp thường; không bịa định lượng hoặc nguồn |

Thử nấu không là gate theo quyết định ngày 2026-11-22.
Report retrieval dùng `technical_gate_met`; `acceptance_gate_met` còn cần review ngoài nhóm.
Kết quả ghi ở [acceptance.md](acceptance.md).

## Đánh giá trợ lý

[Fixture cố định](../deploy/assistant-evaluation.json) gồm 30 ca single-turn thuộc sáu nhóm (26 gọi API thật, 4 lỗi kiểm soát bằng mock)
và 3 hội thoại 8 lượt, tổng 50 request thật mỗi lần chạy.
Giữ nguyên fixture, rubric và ngưỡng trong một lần đo; sửa fixture thì đo lại, không ghép kết quả nhiều lần chạy.

```sh
python3 deploy/scripts/evaluate_assistant.py                       # chỉ in kế hoạch
python3 deploy/scripts/evaluate_assistant.py --execute --base-url http://127.0.0.1:8080 --request-pause-seconds 6
```

Runner tạo phiên riêng cho mỗi ca, không retry POST và dừng khi API/contract sai hoặc gặp 429.
Output nằm trong `backend/target/assistant-evaluation/RUN/` (bị Git ignore); không đưa transcript, SQLite hoặc key vào Git/docs.
Latency đo toàn HTTP `/messages` theo nearest rank; `Server-Timing` chỉ dùng chẩn đoán.

Review từng câu trả lời theo sáu tiêu chí bằng form local:

```sh
python3 deploy/scripts/render_assistant_review.py backend/target/assistant-evaluation/RUN/report.json
```

Form không tự chấm và không gửi dữ liệu ra mạng; export `review.json` khi đủ 50 câu.
Usage lấy từ bản sao SQLite khi backend đã dừng:

```sh
docker compose stop backend
docker compose cp backend:/app/data/assistant.sqlite backend/target/assistant-evaluation/RUN/usage.sqlite
docker compose start backend
python3 deploy/scripts/evaluate_assistant.py --summarize backend/target/assistant-evaluation/RUN/report.json \
  --review backend/target/assistant-evaluation/RUN/review.json \
  --usage-db backend/target/assistant-evaluation/RUN/usage.sqlite \
  --junit backend/target/surefire-reports/TEST-com.cooklens.AssistantChatIntegrationTest.xml
```

Summary trả exit 1 khi chưa đạt hoặc thiếu bằng chứng; usage thiếu giữ unknown, không coi là 0.
Khi nghiệm thu một candidate, chạy trên gateway của gói đã pull, thêm `--candidate-identity` lúc `--execute`
và `--release-summary`, `--provider`, `--reported-model` lúc `--summarize` để lấy object `assistant` cho [hồ sơ phát hành](deployment.md#phát-hành).
