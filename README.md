# CookLens

Đưa ảnh một món ăn Việt vào, xem **Top-3 dự đoán**, chọn hoặc sửa món rồi tìm công thức và xem nguyên liệu/bước nấu/nguồn. Phiên bản Phase 4 có frontend responsive theo nguồn Stitch, Spring Boot gateway, CV EfficientNet-B2 và recipe retrieval E5/Qdrant thật.

Hiện hỗ trợ 30 món, corpus 33 công thức; mỗi món trả tối đa ba công thức có sẵn, không tự tạo thêm kết quả để đủ ba. Một số công thức được AI biên soạn và có nhãn nguồn rõ ràng. Ảnh dùng để nhận diện món, không suy ra nguyên liệu trực tiếp từ pixel. Chưa có chatbot, tài khoản/lịch sử hoặc cooking assistant. Mobile hiện là web responsive; app Expo ở mốc sau, không APK.

## Trạng thái phiên bản

Phase 4 đã merge vào develop. Phase 5 trên feature/docker-release bổ sung Compose độc lập và candidate 2.0.0-rc.1; các image vẫn **build local**. Chưa phát hành v2.0.0 hoặc công bố image Docker Hub dùng để pull; kiểm chứng registry/máy sạch thuộc Phase 6. Không dùng trantung2006/cooklens:tagname như một image đã phát hành.

## Compose độc lập Phase 5

Sau khi chuẩn bị artifact theo bước 1–2 bên dưới, từ root repo build candidate:

```bash
docker compose -f deploy/compose/compose.release.yaml \
  -f deploy/compose/compose.dev.yaml build
docker pull qdrant/qdrant:v1.19.2
docker compose -f deploy/compose/compose.release.yaml up -d --wait --wait-timeout 240
```

Mở **http://127.0.0.1:8080/**. Có thể chép riêng compose.release.yaml ra thư mục ngoài source và chạy với các image đã có; runtime không cần model/Python/Java/Node trên host. Chỉ web được publish, AI/backend/Qdrant ở mạng internal. Xem [runbook Docker](docs/runbooks/docker.md) cho build/dev/debug, volume, di chuyển image, upgrade/rollback và giới hạn offline; [báo cáo Phase 5](docs/phases/phase-5.md) ghi bằng chứng kiểm thử. Mobile Expo dùng cùng gateway, đang triển khai riêng ở [PR #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17); Compose release không mở cổng LAN mặc định.

## Stack review Phase 4 trên máy đã có image

Nếu máy đã build đủ bốn image ở bước bên dưới, vào thư mục root repository có mã Phase 4 rồi chạy:

```bash
docker compose -p cooklens-phase4-local \
  -f deploy/compose/recipes.phase2.yml \
  -f deploy/compose/backend.phase3.yml \
  -f deploy/compose/frontend.phase4.yml up -d
```

Mở **http://127.0.0.1:5173/**. Lần khởi động đầu chờ Qdrant nạp index và hai AI load model; kiểm tra sẵn sàng tại http://127.0.0.1:5173/api/health. Không cần chạy uvicorn hoặc kích hoạt venv khi dùng stack Docker.

## Chuẩn bị lần đầu và build từ source

Các lệnh chạy từ root repository trên Linux, dùng Docker Engine hoặc Docker Desktop với Compose **2.24.4 trở lên**, Python 3.12 có venv và Internet khi tải/build. Không cần cài Node/JDK/Maven trên host để build Docker. Image AI dùng CPU, không bắt buộc GPU; cần đủ RAM/disk cho model, dependency và build. Chưa chốt cấu hình tối thiểu cho mọi máy; xem giới hạn nghiệm thu trong báo cáo từng phase.

Kiểm tra Docker:

```bash
docker version
docker compose version
```

### 1. Tạo môi trường chuẩn bị artifact

Dùng venv riêng để tránh thay dependency môi trường train/CV có sẵn:

```bash
python3.12 -m venv .venv-build
source .venv-build/bin/activate
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
python -m pip install -r ai/rag/requirements.txt
```

### 2. Tải trọng số và tạo bundle công thức

```bash
python deploy/scripts/fetch_vision_checkpoint.py
python deploy/scripts/fetch_embedding_model.py
python deploy/scripts/verify_mvp_inputs.py \
  --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_best.pt
python -m ai.rag.ingestion.bundle \
  --model deploy/artifacts/staging/embedding \
  --output deploy/artifacts/staging/recipes
```

Scripts lấy artifact có version từ GitHub Releases, kiểm tra đầu vào rồi đặt vào deploy/artifacts/staging được Git ignore. Không cần API key cho model inference. Nếu file có sẵn khác bản mong đợi, script dừng để bạn kiểm tra, không tự ghi đè trọng số của bạn. Xem [hướng dẫn artifact](deploy/artifacts/README.md) và [nguồn embedding](deploy/artifacts/embedding-model-v1.md).

### 3. Build bốn image

Giữ đúng các tag vì Compose Phase 4 đang tham chiếu chúng:

```bash
docker build -f deploy/docker/Dockerfile.vision -t cooklens-vision:phase1 .
docker build -f deploy/docker/Dockerfile.recipes -t cooklens-recipes:phase2 .
docker build -f deploy/docker/Dockerfile.backend -t cooklens-backend:phase3 .
docker build -f deploy/docker/Dockerfile.frontend -t cooklens-frontend:phase4 .
```

Qdrant dùng image upstream do Compose tải lần đầu. Trọng số CV, embedding, corpus và vectors được đóng gói trong image AI; font/icon nằm local trong frontend. Container runtime không tải thêm model/công thức hoặc gọi CDN. Sau khi build xong có thể deactivate venv; chạy stack bằng lệnh ở phần Chạy nhanh.

## Test sản phẩm bằng ảnh

1. Mở http://127.0.0.1:5173/ trên máy chạy Docker.
2. Chọn/kéo-thả một ảnh JPG hoặc PNG tối đa 10 MiB, tối đa 25 triệu pixel. Nên dùng ảnh rõ một món trong danh mục; có thể dùng ai/cv/inference/tests/fixtures/food.png để thử luồng.
3. Bấm Nhận diện món; xem ba dự đoán và confidence. Hệ thống không tự xác nhận món đầu tiên.
4. Chọn một dự đoán, hoặc bấm Sửa món trong danh mục để chọn món đúng, rồi Xác nhận món.
5. Xem danh sách công thức. Có thể nhập ưu tiên nguyên liệu/cách nấu để xếp hạng trong món đã xác nhận, rồi bấm Xem công thức để mở chi tiết.

Model chỉ hỗ trợ danh mục 30 món; ảnh nhiều món hoặc món ngoài danh mục có thể cho kết quả sai. Confidence là điểm của model, người dùng vẫn phải xác nhận. Ảnh/state không được lưu qua reload. Camera tùy trình duyệt/thiết bị và có nút chọn ảnh thay thế. Đã kiểm thử viewport mobile bằng browser emulation; chưa nghiệm thu camera trên điện thoại thật. Địa chỉ 127.0.0.1 chỉ dùng trên chính máy chạy Docker, chưa là cấu hình LAN cho Expo.

## Kiểm tra trạng thái, lỗi và khởi động lại

```bash
docker compose -p cooklens-phase4-local \
  -f deploy/compose/recipes.phase2.yml \
  -f deploy/compose/backend.phase3.yml \
  -f deploy/compose/frontend.phase4.yml ps -a
curl -fsS http://127.0.0.1:5173/api/health
```

recipe-init chạy một lần rồi Exited (0) là bình thường. Frontend, backend, vision, recipes và qdrant cần chạy khỏe. Để xem lỗi, dùng cùng lệnh Compose và thay ps -a bằng logs --tail=80 backend vision recipes recipe-init frontend. Không đăng token, env hoặc toàn bộ log chưa rà soát lên issue.

| Hiện tượng | Cách xử lý |
| --- | --- |
| Cổng 5173 đã dùng | Dừng đúng Vite/process của bạn hoặc đặt FRONTEND_PORT=5174 trước lệnh Compose up -d; mở http://127.0.0.1:5174/ |
| Compose báo thiếu image | Hoàn tất bước stage artifact và build đủ bốn image với đúng tag |
| Docker build báo thiếu checkpoint/bundle | Chạy bước tải model và tạo bundle từ root; không đưa trọng số vào Git |
| UI báo dịch vụ chưa sẵn sàng | Kiểm tra ps -a, /api/health và log dependency; chờ load model hoặc xử lý service lỗi rồi chạy lại up -d |
| recipe-init thất bại | Xem log init và version bundle/index; không xóa volume để thử ngẫu nhiên, xem [vận hành index](ai/rag/README.md) |
| Muốn chạy lại sau reboot | Khởi động Docker rồi chạy lại lệnh Compose up -d; dữ liệu index nằm trong named volume |

Dừng stack, **giữ volume công thức**:

```bash
docker compose -p cooklens-phase4-local \
  -f deploy/compose/recipes.phase2.yml \
  -f deploy/compose/backend.phase3.yml \
  -f deploy/compose/frontend.phase4.yml down
```

Không thêm --volumes nếu muốn giữ index. Khi sửa source, build lại image service đã sửa rồi chạy up -d. Các lệnh trên chỉ tác động project cooklens-phase4-local, không dừng stack Phase 2/3 đang chạy riêng.

## Swagger và phát triển từng service

Stack frontend chỉ publish cổng web; các AI, Qdrant và backend ở mạng nội bộ. Swagger không được publish qua frontend. Nếu cần test API trực tiếp, chạy stack Phase 3 theo [backend README](backend/README.md), mở http://127.0.0.1:8080/swagger-ui/index.html; khi cùng máy có port 8080 đang dùng, kiểm tra service đang chạy trước.

Chạy Vite riêng, cấu hình proxy, sinh TypeScript từ OpenAPI và các lệnh test nằm tại [frontend README](frontend/README.md). Không dùng Vite preview làm production server.

## Kiến trúc và tài liệu

```text
Browser → Nginx frontend → Spring Boot /api → Vision EfficientNet-B2
                                         → Recipes E5 → Qdrant
```

| Thư mục/tài liệu | Nội dung |
| --- | --- |
| ai/cv/inference | CV inference, validation ảnh và taxonomy |
| ai/rag | Embedding, ingestion, retrieval và API công thức |
| backend | Public gateway, orchestration, DTO, lỗi và limits |
| frontend | React/TypeScript, upload/nhận diện/công thức |
| deploy | Dockerfiles, Compose, proxy, artifact scripts và CI |
| [Kế hoạch hiện hành](docs/plans/top3-recipes-docker-mvp.md) | Phase 0–7, checklist, Docker Hub và release v2.0.0 |
| [Báo cáo Phase 4](docs/phases/phase-4.md) | Đối chiếu Stitch, kiểm thử thật, Docker và giới hạn |
| [Nguồn thiết kế đúng](docs/frontend-reference/stitch/README.md) | Snapshot, tokens, screenshots và phần thay đổi chức năng |
| [Contract v1](docs/contracts/mvp-v1.md) | Endpoint/schema/version/error và quy tắc xếp hạng |
| [Dữ liệu công thức](data/recipes/README.md) | Nguồn/license/attribution và AI-authored provenance |
| [Tài liệu chung](docs/README.md) | CV, data, kiến trúc và roadmap dài hạn |

Trước PR phải rà file/test tạm, build output, secrets và mọi literal mã/hash bị cấm trong code, tài liệu, lockfile và bundle. Không commit trọng số/dataset lớn, key/token, log hay dữ liệu người dùng. Giữ test hồi quy có mục đích. Agent tạo PR, người dùng review/merge từng phase; chưa chuyển Phase 6 khi PR Phase 5 chưa được merge.
