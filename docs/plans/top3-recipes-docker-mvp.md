# Kế hoạch MVP: ảnh → Top-3 món → công thức → Docker

Ngày lập: 2026-10-19. Cập nhật trạng thái gần nhất: 2026-10-26. Nhánh đích của PR tài liệu và các phase: `develop`.

Đây là kế hoạch triển khai, chưa phải danh sách tính năng đã hoàn thành. Các ô checklist chỉ được đánh dấu khi có mã, kiểm thử và bằng chứng tương ứng. Hiện trạng nhánh được xác định sau `git fetch origin` cùng ngày.

Trạng thái đã đối chiếu với mã và GitHub: Phase 0–5 đã merge vào `origin/develop`, gồm Phase 5 qua [PR #16](https://github.com/tung51652-alt/Cooking-assistant/pull/16). Phase 6–7 chưa hoàn tất; chưa phát hành `v2.0.0` hoặc push image ứng dụng lên Docker Hub. PR Expo [#17](https://github.com/tung51652-alt/Cooking-assistant/pull/17) vẫn mở riêng; thiết bị thật chưa nghiệm thu. Checklist đã tick mô tả công việc/bằng chứng đã đạt, không đồng nghĩa với phát hành toàn sản phẩm.

Bản hoàn thành toàn bộ Phase 0–7 của kế hoạch này là **CookLens phiên bản 2**, tag phát hành ứng dụng `v2.0.0`. Chỉ công bố khi luồng ảnh → Top-3 → xác nhận món → công thức chạy với service thật, đủ Docker images/Compose và đạt nghiệm thu Phase 7. Các phase và PR trung gian không được gọi là release v2 hoàn chỉnh. Version public API, taxonomy và artifact model được quản lý riêng; release trọng số `vision-model-v1` hiện có không phải phiên bản ứng dụng v1 hoặc v2.

## 1. Kết quả cần giao

Người dùng tải ảnh một món ăn lên giao diện web, nhận ba món có khả năng cao nhất kèm độ tin cậy, chọn hoặc sửa món, xem tối đa ba công thức liên quan nhất và mở chi tiết nguyên liệu, định lượng, bước nấu, nguồn.

Luồng mục tiêu:

```text
Ảnh → kiểm tra ảnh → CV Top-3 → người dùng xác nhận món
     → lọc recipe theo món → xếp hạng → danh sách recipe → chi tiết recipe
```

- Frontend cơ bản dựa trên nguồn Stitch chuẩn tại `/home/trantung/ict/stitch_giao_di_n_chatbot_m_th_c`, tận dụng tối đa bố cục, tên lớp, thành phần, tài nguyên và style của bản gốc. Dùng được trên desktop và điện thoại; có preview ảnh, trạng thái tải, lỗi và kết quả rỗng. Chi tiết tái sử dụng và phần tài nguyên đang thiếu nằm ở Phase 4.
- Web responsive vẫn phục vụ trình duyệt điện thoại. Theo yêu cầu cập nhật, app Expo/React Native được triển khai cùng Phase 5 trên nhánh riêng, dùng chung public API/types/validation; không tạo APK hoặc pipeline store. Nghiệm thu camera/permissions trên thiết bị thật được ghi riêng, không suy ra từ viewport web.
- Hỗ trợ 30 lớp của checkpoint hiện tại. Ảnh nhiều món và món ngoài bộ nhãn phải được giải thích là giới hạn của model; người dùng luôn sửa được lựa chọn.
- Runtime chuẩn dùng CPU, không cần CUDA, Python/Java/Node cài trên máy người dùng hay khóa API LLM.
- Sau khi lấy bộ phát hành gồm Compose và cấu hình mặc định, người dùng chạy một lệnh Docker để kéo image và khởi động toàn bộ stack. Không phải lấy checkpoint, model embedding hay seed database thủ công.
- Lần đầu cần Internet để kéo image. Sau khi image và dữ liệu đã có, luồng chính hoạt động khi không có Internet; link nguồn bên ngoài cần Internet nếu người dùng mở.
- Chat, LangGraph cooking assistant, tìm web trực tiếp, đăng nhập, lịch sử cá nhân và điều chỉnh khẩu phần thuộc giai đoạn sau. MVP này truy xuất recipe có sẵn; không cần LLM sinh công thức.

Tài liệu [chuẩn kỹ thuật](../technical-architecture.md), [data](../data/README.md) và [LangGraph](../langgraph/README.md) vẫn mô tả hướng phát triển dài hạn. Với lần giao này, dùng phạm vi và thứ tự trong kế hoạch này; cập nhật các tài liệu liên quan ở Phase 0 để phân biệt tính năng hiện tại và dự kiến.

## 2. Nhánh có thể tận dụng và cách đưa về develop

| Nhánh | Bằng chứng hiện có | Cách tận dụng cho lần này |
| --- | --- | --- |
| `main`, `develop` | Cùng commit; cấu trúc và tài liệu, chưa có ứng dụng backend/frontend | `develop` là nhánh tích hợp; đưa kết quả từng phase qua PR, không làm toàn bộ trên một nhánh lớn |
| `feature/make-data` | Tài liệu kiến trúc; đã nằm trong lịch sử `main/develop` | Dùng tài liệu hiện có, không cần merge lại |
| `minh/cv` | EfficientNet-B2, notebook, báo cáo, split manifest, FastAPI Top-1 và kiểm thử | Vào nhánh này, cập nhật từ `develop`, sửa Top-3, taxonomy và cấu hình model; nghiệm thu trước PR vào `develop` |
| `sida/data-30vnfoods-manifest` | Mapping 30 nhãn và nguồn dataset; đồng thời kế thừa thay đổi web-search | Chỉ tận dụng thay đổi mapping/data. Tạo `feature/data-recipes` từ `develop`, chọn riêng thay đổi data, chỉnh sửa rồi PR. Không cần kéo graph thử nghiệm vào runtime |
| `hung/rag` | `Food_to_Recipe.ipynb`: agent LLM, DDGS web search và prompt trả lời món quen từ kiến thức model | Chỉ tham khảo ý tưởng/query. Chưa có vector retrieval, corpus hay evaluation. Xây service có dữ liệu thật trên `feature/recipe-retrieval`; không coi notebook là RAG đã hoàn thành |
| `sida/langgraph-web-search` | Graph phân nhánh trả lời/tìm web, chưa có persistence hay nối CV–recipe | Giữ cho milestone chat sau; không là dependency của bản này |
| `tung/phas4-langgraph` | Chỉ thêm `ai/t.py` rỗng | Chưa có phần triển khai để sử dụng |
| `dangvinh23012006-art-patch-1` | Trên origin chỉ có `frontend/modules.xml` của IDE; HTML người dùng cung cấp nằm riêng ở `/home/trantung/ict/FrontEndCookLens` | Dùng HTML ngoài repo làm nền trên `feature/frontend-top3-recipes`, chuyển thành component giữ bố cục/style; không coi file IDE là mã UI |

Quy trình chung cho từng PR:

1. Kiểm tra working tree; bảo toàn file local, checkpoint và môi trường của người đang làm.
2. Với nhánh đã có mã hữu ích: chuyển vào nhánh, đồng bộ `develop`, sửa trên nhánh đó. Với service mới: tạo nhánh từ `develop`. Ngoại lệ cherry-pick commit data ở bảng trên nhằm tách dependency thử nghiệm.
3. Người dùng đã cho phép agent sửa các nhánh thành viên, commit/push thay đổi thuộc công việc này và tạo PR vào `develop`; không phải xin lại quyền cho từng thao tác thông thường. Bảo toàn công việc đang có, fetch trước push và xử lý thay đổi mới của người khác; không force-push, ghi đè hoặc viết lại lịch sử nhánh chia sẻ.
4. Hoàn thành kiểm thử và [cổng kết thúc phase](#phase-closeout) trước khi push/tạo PR sẵn sàng review. Mỗi PR ghi contract thay đổi, đường dẫn file, cấu hình, cách chạy, kiểm thử, artifact/version và kết quả rà soát file/secrets. PR tài liệu chỉ sửa docs thì kiểm tra Markdown/link/diff, không chạy suite ứng dụng không liên quan.
5. Agent gửi link PR cùng kết quả kiểm tra; **người dùng trực tiếp bấm merge**. Agent không tự merge hoặc bật auto-merge. Nếu có nhiều PR phụ thuộc trong một phase, ghi rõ thứ tự merge.
6. Sau khi người dùng merge, fetch `origin`, xác nhận commit đã có trên `origin/develop`, cập nhật local rồi mới bắt đầu phần phụ thuộc hoặc phase kế tiếp. Nếu PR cần sửa, tiếp tục sửa trên nhánh PR đó. Các nhánh cùng phase chỉ làm song song khi dependency đã được merge hoặc dùng contract/fixture độc lập.
7. Không commit weights, venv, secrets hoặc index sinh ra. Giải quyết `.gitignore` khác nhau giữa nhánh; bỏ tham chiếu kiểu `origin/minh/cv:...` trong tài liệu sau khi file đã có đường dẫn chung.

Nhận xét quan trọng: notebook trên `hung/rag` hiện dựa vào LLM/web search, khác yêu cầu recipe có corpus và nguồn. Khi tách mã phải loại cấu hình khóa/provider ghi trong notebook, kiểm tra cả outputs; không sao chép chúng vào image hoặc cấu hình mặc định.

<a id="phase-closeout"></a>

### Cổng kết thúc bắt buộc cho mọi phase

Mỗi phase bắt buộc chạy `python3 deploy/scripts/check_public_metadata.py`, kiểm tra PR/release notes và asset phát hành; CI phải chặn khi có vi phạm. Scanner chỉ báo file/vị trí, không in giá trị. Mỗi phase phải rà soát cả diff so với nhánh đích và file mới/untracked thuộc phạm vi phase, trước commit/push và trước khi bàn giao PR. Ghi kết quả đã kiểm tra và giới hạn kiểm tra trong PR; không chỉ đánh dấu checklist mà không chạy kiểm tra.

- **File thừa:** xem `git status`, danh sách file thay đổi và diff với `origin/develop`; loại file tạm, debug scripts, backup, IDE metadata, cache, logs, build/coverage outputs, bản chép HTML hoặc asset không còn dùng. Không xóa file local của người dùng chỉ vì chúng untracked; giữ ngoài commit/build context và báo rõ nếu ảnh hưởng việc chạy.
- **File test:** phân loại test hồi quy/contract/E2E còn cần, fixture có chủ đích và script thử một lần. Giữ test hữu ích ở đúng thư mục, xóa test tạm/trùng hoặc chỉ mirror implementation do phase tạo ra, bỏ generated reports/screenshots/video khỏi commit nếu không là bằng chứng được chọn. Không xóa sạch test để đạt tiêu chí “không có file test thừa”. Kiểm tra fixture/ảnh có quyền dùng, không chứa dữ liệu cá nhân; image production không copy test suite, fixture và output không cần cho runtime.
- **Secrets và hash nhạy cảm:** rà API keys, token, password, private key, connection string có credentials, cookie/session, chữ ký URL truy cập artifact và password/token hashes trong source, config, `.env`, notebook input/output, test fixture, docs, logs và bundle. Kiểm tra các commit sẽ push, không chỉ working tree; dùng secret scanner với output che giá trị khi có thể. Không đưa giá trị nhạy cảm vào báo cáo hoặc lệnh/tool output.
- **Cấm ghi giá trị mã/hash:** tuyệt đối không ghi giá trị SHA, commit hash, checksum, image digest, integrity hash, token/key hoặc mã truy cập vào code, tài liệu, manifest, config, lockfile, notebook, fixture, PR/release notes, log hay asset phát hành do nhóm quản lý. Không còn ngoại lệ cho hash kỹ thuật hoặc lockfile. Chỉ dùng tên nhánh, version/tag và URL không chứa mã hoặc thông tin truy cập. Các giá trị cần để kiểm tra toàn vẹn chỉ xử lý tạm trong bộ nhớ từ metadata upstream, không lưu hoặc in ra. Không dùng mã thật làm ví dụ. Định danh Git/registry do nền tảng tự quản lý không được sao chép vào nội dung dự án.
- **Đóng gói/phát hành:** kiểm tra `.gitignore`, `.dockerignore`, frontend build bundle, Docker build context và các layer/config/history của image trong phạm vi phase. Xóa secret trong layer sau không làm secret biến mất khỏi layer trước; phải build lại từ đầu vào sạch. Bản release không chứa credential dù registry private.
- **Nếu phát hiện rò rỉ:** ngừng push/publish phần bị ảnh hưởng, loại khỏi thay đổi mới và báo vị trí/loại dữ liệu mà không in giá trị. Credential đã bị commit/push phải được thu hồi/rotate; xóa file ở commit mới chưa xử lý hết lịch sử. Không tự rewrite lịch sử nhánh chung; phối hợp xử lý và chạy lại kiểm tra trước mở/đánh dấu PR sẵn sàng.

Đầu ra bắt buộc: bảng ngắn trong PR gồm `files`, `tests`, `secrets/hashes`, `build/image` (hoặc `không áp dụng` có lý do), công cụ/lệnh đã chạy, kết quả và phần còn tồn tại. Chỉ người dùng merge sau khi cổng này cùng điều kiện kỹ thuật của phase đạt.

## 3. Kiến trúc và nguyên tắc chung giữa service

```text
Browser
  → frontend (static React + Nginx, cổng host 8080)
      /api/* → backend (Spring Boot)
                  → vision (FastAPI/PyTorch)
                  → recipes (FastAPI/embedding/retrieval)
                                    → qdrant
                 recipe-init → qdrant (job seed một lần cho mỗi version)
```

`recipe-init` dùng cùng image với `recipes`, khác lệnh chạy. Bản mặc định không cần PostgreSQL vì chưa lưu tài khoản, hội thoại hoặc lịch sử; thêm persistence ứng dụng khi có use case cụ thể. Qdrant lưu vector và payload recipe vào named volume.

| Thành phần | Nơi đặt mã | Trách nhiệm và dependency |
| --- | --- | --- |
| `frontend` | `frontend/` | Render upload, Top-3, chọn món, list/detail recipe. Chỉ gọi `/api` qua cùng origin |
| `backend` | `backend/` | API public, validation, DTO, gọi typed HTTP client đến hai service AI, timeout và error mapping |
| `vision` | `ai/cv/inference/` | Load checkpoint một lần, tiền xử lý cố định, Top-3 softmax, mapping nhãn; độc lập recipe |
| `recipes` | `ai/rag/` | Tra recipe đã validate; exact metadata filter trước xếp hạng; embedding chạy local |
| `recipe-init` | `ai/rag/ingestion/` | Kiểm tra corpus/vector manifest, seed Qdrant idempotent; kết thúc 0 khi version sẵn sàng |
| `qdrant` | Cấu hình trong `deploy/compose/` | Lưu vector/payload, không public ra trình duyệt; dùng image chính thức được pin |

Các nguyên tắc áp dụng ở mọi phase:

- **Một taxonomy:** `class_id` giữ 0-based và đúng thứ tự checkpoint; `normalized_dish` lấy từ mapping có version. Tên hiển thị tiếng Việt là trường riêng.
- **Một nguồn công thức:** recipe phải đạt schema và có provenance. Không suy nguyên liệu từ ảnh, không tự tạo định lượng, không fallback sang LLM khi thiếu recipe.
- **Người dùng xác nhận:** trả Top-3 để lựa chọn; chỉ tìm công thức chính thức bằng `confirmed_dish` sau thao tác chọn/sửa. Chọn món lập tức kích hoạt tìm kiếm, không cần ô chat.
- **Ranh giới service:** frontend → backend → AI. Backend không import Python, AI không import Java; chỉ trao đổi qua HTTP DTO có version. Không gọi Qdrant trực tiếp từ frontend/backend.
- **Cấu hình:** địa chỉ service và model path qua environment; trong Docker dùng tên service, không dùng `localhost` để gọi container khác. Không đưa token vào image, Git hay frontend bundle.
- **Vòng đời:** phân biệt process sống và sẵn sàng phục vụ. Readiness vision chỉ thành công sau load model; readiness recipes chỉ thành công khi corpus/index đúng version. Cấu hình timeout và giới hạn tài nguyên.
- **Lỗi thống nhất:** public error gồm `request_id`, `code`, `message`; HTTP 400/413/415/422 cho đầu vào theo contract, 404 cho ID không tồn tại, 503/504 khi dependency chưa sẵn sàng/timeout. Không trả stack trace.
- **Vận hành:** request ID truyền xuyên service, log thời gian và version; không log ảnh gốc, token hoặc nội dung upload. Ảnh chỉ xử lý trong bộ nhớ, không lưu mặc định.
- **Kiểm thử:** unit/contract theo service, integration giữa dependency thật, smoke test từ image phát hành. Kiểm thử bằng mock không thay thế kiểm thử model/index thật.

### Hợp đồng dự kiến, chốt ở Phase 0

| API public | Đầu vào | Kết quả |
| --- | --- | --- |
| `POST /api/vision/predict` | Multipart `file`, ảnh tối đa 10 MiB | `request_id`, `model_version`, `taxonomy_version`, `predictions[3]`: `rank`, `class_id`, `normalized_dish`, `display_name`, `confidence` |
| `GET /api/dishes` | Không | Danh sách 30 món để sửa lựa chọn; cùng taxonomy với CV/recipes |
| `POST /api/recipes/search` | `confirmed_dish`, `top_k` 1–3 mặc định 3; tùy chọn `query` ngắn | `corpus_version`, `recipes[]`: `id`, `title`, `normalized_dish`, preview, source và thông tin xếp hạng |
| `GET /api/recipes/{id}` | Recipe ID | Recipe chi tiết theo schema chuẩn, bao gồm nguyên liệu/bước nấu/nguồn; giá trị chưa biết là `null` |
| `GET /api/health` | Không | Trạng thái sẵn sàng phục vụ và version của dependency; HTTP 503 nếu thiếu dependency bắt buộc |

Confidence là xác suất softmax trên toàn bộ 30 lớp; không chuẩn hóa lại riêng ba kết quả. Thứ tự giảm dần, tie-break bằng `class_id`. Không diễn giải retrieval score thành phần trăm độ tin cậy và không cộng trực tiếp score với confidence CV.

OpenAPI public được sinh từ Spring controllers; dùng contract đó để tạo/cập nhật frontend types. FastAPI cung cấp schema nội bộ; kiểm tra tương thích DTO bằng contract tests, không duy trì hai bản public spec bằng tay.

### Bố trí file mục tiêu

```text
ai/cv/inference/          main.py, model.py, inference.py, schemas.py, tests/
ai/cv/experiments/        metadata, classes, metrics; không chứa weights trong Git
ai/cv/requirements.txt    dependency runtime CV khóa phiên bản tương thích
ai/rag/api/              main.py, schemas.py, health.py
ai/rag/ingestion/         validate.py, build_index.py, seed.py
ai/rag/embeddings/        adapter local, config/version model
ai/rag/retrieval/         filters.py, ranker.py, repository.py
ai/rag/evaluation/        query set, relevant IDs, báo cáo
ai/rag/tests/             unit, integration, contract tests
ai/rag/requirements.txt   dependency runtime retrieval khóa phiên bản
data/raw/                source manifests, hướng dẫn lấy artifact
data/processed/          30vnfoods-label-map.json, corpus manifest
data/recipes/            schema và corpus JSON có quyền phân phối
backend/                 pom.xml, src/main/java/com/cooklens/{controller,
                         service,client,dto,config,exception}, src/test/
frontend/                package.json, lockfile, src/{components,features,
                         lib,types}, public/
deploy/docker/           Dockerfile.vision, Dockerfile.recipes,
                         Dockerfile.backend, Dockerfile.frontend, nginx.conf
deploy/compose/          compose.release.yaml, compose.dev.yaml
deploy/env/              .env.example với cấu hình không nhạy cảm
deploy/scripts/          build/release/smoke scripts
deploy/artifacts/        manifest artifact build; binary tải vào staging bị ignore
docs/plans/              kế hoạch này
docs/runbooks/           cách chạy, version release, xử lý lỗi
.github/workflows/       kiểm thử, build, phát hành image
```

Dockerfile chỉ mô tả đóng gói, không chứa business logic. Schema đặt cạnh service sở hữu; notebook chỉ phục vụ thí nghiệm. Kết quả/fixtures kiểm thử đủ nhỏ và hợp pháp được version-control; không copy toàn bộ dataset vào repo hoặc build context.

## 4. Phase 0 — Chốt phạm vi, contract và đầu vào

Nhánh: `feature/mvp-contracts` từ `develop`. Service tham gia: tất cả; chưa thay runtime.

Trạng thái: Phase 0 đã được người dùng merge qua PR #6; agent đã fetch xác nhận trên `origin/develop`. Bằng chứng tại [báo cáo Phase 0](../phases/phase-0.md). Corpus coverage và benchmark thực tế vẫn thuộc các phase triển khai.

Nguyên tắc phối hợp: CV và recipe thống nhất mapping trước khi viết DTO frontend/backend; chọn version corpus/model là một phần của release, không chốt riêng từng service.

- [x] Chốt các API và error/status semantics, đường dẫn public/nội bộ trong [contract v1](../contracts/mvp-v1.md).
- [x] Chốt UI: upload → ba lựa chọn → xác nhận → danh sách/chi tiết; luôn sửa món được, kể cả confidence cao; chưa có chatbot.
- [x] Audit nguồn và chốt hướng xử lý style: đã lưu ba HTML/metadata, ghi CSS/JS thiếu; người dùng cho phép dựng CSS/JS từ khung HTML. Làm khung độc lập sớm trên nhánh frontend và PR riêng để duyệt baseline desktop/mobile, chưa thay nghiệm thu Phase 4.
- [x] Chốt gate/thiết bị mục tiêu, concurrency và policy luôn chọn/sửa món trong [runtime decisions](../decisions/mvp-runtime.md); không tự xác nhận bằng threshold 0.30. Chưa tuyên bố benchmark đã đạt.
- [x] Hoàn tất checkpoint supply: đã load/đối chiếu metadata thật trong [artifact manifest](../../deploy/artifacts/manifest.json); đã chọn GitHub Release `vision-model-v1`, URL public cố định và script tải/xác minh cho developer/CI.
- [x] Chọn baseline multilingual-e5-small với version bundle, chiều vector, license claim và cách đóng gói offline trong manifest; kiểm tra chất lượng trên bộ query nghiệm thu thuộc Phase 2, chưa đánh dấu đạt retrieval gate.
- [x] Chọn policy Wikibooks text có attribution/license theo từng revision và corpus tối thiểu 1 recipe/món; ghi rõ chưa nhập/review, coverage 0/30 và nghĩa vụ bổ sung lớp thiếu ở Phase 2.
- [x] Ghi provenance checkpoint: Phạm Hoàng Minh huấn luyện EfficientNet-B2; người dùng xác nhận quyền public/phân phối và chọn GitHub Releases ngày 2026-10-19. Lưu permission record và license torchvision riêng, không gán license code cho ảnh/checkpoint hoặc phân phối dataset.
- [x] Chốt registry: namespace `trantung2006`, public, kiến trúc ban đầu `linux/amd64`; kiểm tra quyền push/repositories ở Phase 6 trước publish, chưa công bố `arm64`.
- [x] Chuẩn hóa `.gitignore`/`.dockerignore`: `venv/`, checkpoint local, outputs, secrets, notebook caches; chỉ staging đã xác minh được cấp artifact build, không whitelist toàn bộ máy chủ. Nguồn artifact CI là GitHub Releases theo manifest.
- [x] Cập nhật docs tổng thể: phân biệt milestone này với chat/LangGraph/PostgreSQL sau này.

### Kết thúc Phase 0

- [x] Chạy `python3 deploy/scripts/check_public_metadata.py`; không chấp nhận giá trị mã/hash trong tracked files.

- [x] Rà file thừa và file test/fixture theo [cổng chung](#phase-closeout); tài liệu/asset nguồn chỉ giữ phần có mục đích, không thêm test ứng dụng cho thay đổi thuần docs.
- [x] Rà secrets và mọi giá trị mã/hash trong diff, commit, notebook và artifact manifest; không giữ lại giá trị mã/hash dưới bất kỳ ngoại lệ nào.
- [x] Tạo PR #6 kèm contract, manifest, verifier và báo cáo kiểm tra để người dùng review.
- [x] Người dùng merge PR #6; agent đã fetch xác nhận `origin/develop` trước Phase 1/2 phụ thuộc.

Điều kiện ra phase: contract, taxonomy và artifact manifest được review; có nguồn corpus hợp lệ, model runtime được chọn và tiêu chí nghiệm thu đã chốt. Người dùng merge PR vào `develop` làm nền cho các service.

## 5. Phase 1 — CV Top-3 và taxonomy dùng chung

Nhánh: chỉnh sửa `minh/cv` sau khi cập nhật từ `develop`; đồng thời chuẩn bị `feature/data-recipes` bằng phần thay đổi data riêng. Hai PR ghi rõ thứ tự phụ thuộc mapping.

Trạng thái: đã hoàn tất và merge mapping #8 rồi CV #9; Phase 2–5 cũng đã merge. Xem [báo cáo Phase 1](../phases/phase-1.md) và giới hạn kiểm chứng accuracy.

Nguyên tắc phối hợp: CV sở hữu prediction; mapping là artifact dùng chung, không tự viết lại class list trong frontend/backend. Mọi service kiểm tra `taxonomy_version` tương thích.

- [x] Data: nhập mapping 30 lớp; đối chiếu từng index/nhãn với `classes` trong checkpoint và manifest split. Có display name tiếng Việt, alias được kiểm tra, version và provenance.
- [x] CV: thay Top-1 thành Top-3, sort ổn định trên 30 lớp rồi lấy ba mục đầu với confidence gốc, rank ổn định; `eval()` và `inference_mode()`, giữ nguyên deterministic transform training/evaluation.
- [x] CV: model load đúng một lần mỗi process; `FOOD_MODEL_PATH` hỗ trợ đường dẫn `/opt/cooklens/models/efficientnet_b2_best.pt`; thiếu/sai checkpoint thì startup thất bại rõ ràng.
- [x] CV: giữ kiểm tra ảnh lỗi, RGB/grayscale/RGBA, ảnh quá lớn/decompression bomb; thống nhất lỗi MIME và giới hạn 10 MiB với backend.
- [x] CV: endpoint `/health/live`, `/health/ready`, prediction nội bộ và model/taxonomy version; không tự tải pretrained weights lúc startup.
- [x] Backend contract: fixture đúng shape Top-3; quyết định tương thích endpoint `/predict` cũ trong nội bộ và route public `/api/vision/predict` ở Spring.
- [x] Kiểm thử: 3 class duy nhất, đúng thứ tự, confidence trong [0,1], tổng Top-3 ≤ 1; mapping khớp checkpoint; ảnh thật và ảnh không hợp lệ; lỗi inference không lộ nội bộ.
- [x] Đối chiếu Top-1 mới với inference cũ và báo cáo Top-3 trên split cố định; ghi latency CPU và peak RAM, không dùng latency T4 trong báo cáo làm cam kết CPU. Metric test split là báo cáo huấn luyện đã có, chưa chạy lại trên máy hiện tại vì không có ảnh gốc; nghiệm thu release phải kiểm tra lại theo Phase 7.
- [x] Thêm Dockerfile CV sớm để kiểm tra loader/transform trong image CPU; trọng số staging lấy theo manifest, không commit file `.pt`.

### Kết thúc Phase 1

- [x] Rà file thừa, test/fixture tạm, outputs notebook, cache và checkpoint local theo [cổng chung](#phase-closeout); giữ test hồi quy hữu ích, loại dữ liệu không cần khỏi image.
- [x] Rà secrets và mọi giá trị mã/hash trong diff/commit, notebook, cấu hình và image CV; xác nhận checkpoint vào đúng artifact, không vào Git.
- [x] Chuẩn bị PR CV/data mapping kèm bằng chứng, báo cáo file/test/policy/image.
- [x] Người dùng đã merge mapping → CV; agent fetch và xác nhận develop trước Phase 2.

Điều kiện ra phase: image thử nghiệm nhận ảnh và trả Top-3 đúng contract, health chỉ ready sau load; mapping dùng được từ mọi service; PR CV/data mapping đạt kiểm thử và được người dùng merge vào `develop`.

## 6. Phase 2 — Corpus và service công thức có xếp hạng

Triển khai/kiểm thử kỹ thuật đã hoàn tất; người dùng đã merge data #10 → service #11, agent đã fetch xác nhận local develop đồng bộ origin/develop. Corpus có 33 recipe, phủ 30/30 món: 21 Wikibooks và 12 AI biên soạn theo quyền chủ dự án cấp. Bộ 204 query đã qua cổng kỹ thuật, gồm 18 contrastive holdout; xem [báo cáo Phase 2](../phases/phase-2.md). Review bên ngoài và thử nấu chưa được thực hiện, tiếp tục là gate Phase 7; không nhận đã có reviewer thứ hai hoặc công thức đã được nấu kiểm chứng.

Nhánh: tiếp tục `feature/data-recipes` cho dữ liệu, `feature/recipe-retrieval` cho service mới từ `develop`. Dùng notebook `hung/rag` như tài liệu tham khảo; không đưa agent/LLM vào critical path.

Nguyên tắc phối hợp: data pipeline chịu trách nhiệm tính đúng của corpus; recipes chỉ phục vụ corpus/index cùng version. Một recipe document tương ứng một vector/payload để giảm phức tạp khi corpus còn nhỏ.

- [x] Data: validator theo schema trong `docs/data/README.md`: ID duy nhất, món chuẩn, language/cuisine, servings/thời gian hợp lệ hoặc `null`, nguyên liệu, thứ tự bước, source/license.
- [x] Data: tối thiểu một recipe đã review cho từng món trong 30 lớp; mục tiêu ba recipe/biến thể mỗi món khi có nguồn hợp lệ. Ít hơn ba thì trả số thật, không nhân bản cho đủ. Chủ dự án đã cho phép AI biên soạn món còn thiếu; phải ghi rõ nguồn AI, license, định lượng gợi ý và trạng thái chưa nấu kiểm chứng, không giả tác giả hoặc nguồn bên ngoài.
- [x] Data: chuẩn hóa Unicode/alias, loại trùng và link hỏng; ghi corpus version, số recipe mỗi món, source manifest, version và kết quả review.
- [x] Embeddings: chạy model local trong bundle release có version, lưu cùng `embedding_version`, chiều vector và cách dựng text; build vectors ở giai đoạn phát hành, không tính lại toàn corpus mỗi lần boot.
- [x] Retrieval: filter cứng `normalized_dish`, `language=vi`, `cuisine=vietnamese` rồi vector search; hỗ trợ query ngắn về biến thể để phân biệt các recipe cùng món. Nếu chỉ tên món thì dùng tên chuẩn làm query.
- [x] Retrieval: xếp hạng theo similarity trong tập đã lọc, có tie-break ID; loại bản trùng. Nếu thêm reranker thì benchmark trước khi bật, không tạo thêm dependency LLM mặc định.
- [x] Recipes API: search trả tối đa `top_k`, list preview và endpoint lấy chi tiết; món hợp lệ chưa có recipe trả danh sách rỗng, món không nằm taxonomy báo validation error; ID không có trả 404.
- [x] Qdrant/init: tạo payload index cho metadata, import vector/payload theo ID cố định; job idempotent, không nhân bản khi restart.
- [x] Qdrant/init: collection gắn corpus/embedding version, validate nội bộ/count/dimension trước chuyển alias active; không ghi đè collection đang phục vụ khi import lỗi. Thu dọn version cũ bằng thao tác riêng.
- [x] Recipes readiness: đối chiếu alias active/version với bundle; thiếu/sai version trả not ready, không trả kết quả từ index bất tương thích.
- [x] Evaluation kỹ thuật: query/relevance được review theo nội dung ở lượt riêng, tách khỏi cấu hình; đo Hit@1, Hit@3, MRR, lẫn món và contrastive holdout, bật gate CI. Cùng agent thực hiện, chưa có review bên ngoài; người dùng review khi duyệt PR và bổ sung nghiệm thu độc lập ở Phase 7.
- [x] Dockerfile recipes chứa model embedding, tokenizer/config, corpus đã validate và vectors; job seed dùng cùng image, không yêu cầu model/recipe tải từ web khi chạy.

### Kết thúc Phase 2

- [x] Rà file thừa, test/query/recipe trùng, download/index tạm và output đánh giá theo [cổng chung](#phase-closeout); giữ bộ evaluation/fixtures có nguồn rõ ràng.
- [x] Rà secrets và mọi giá trị mã/hash trong source URL, notebook outputs, corpus, config, commit và image recipes; không mang API key/provider từ notebook vào runtime.
- [x] Tạo/cập nhật PR và báo cáo đủ coverage, test, policy, image.
- [x] Người dùng đã merge data #10 trước service #11; agent fetch xác nhận local develop đồng bộ `origin/develop`. Review độc lập và thử nấu vẫn thuộc Phase 7.

Điều kiện ra phase: corpus phủ đủ 30 món hoặc phải công bố phạm vi hẹp hơn trước phát hành; bộ query đạt gate Phase 7, search/detail chạy thật với Qdrant, init chạy lại không tạo thêm dữ liệu. Người dùng merge PR data trước PR service phụ thuộc dữ liệu.

## 7. Phase 3 — Backend tích hợp API public

Nhánh: `feature/backend-top3-recipes` từ `develop` đã có Phase 0–2 và bản sửa audit. Đã triển khai, kiểm thử với AI thật và được người dùng merge qua PR #13; develop đã được cập nhật trước Phase 4. Xem [báo cáo Phase 3](../phases/phase-3.md) và [hướng dẫn backend](../../backend/README.md).

Nguyên tắc phối hợp: backend làm cổng public duy nhất, điều phối HTTP và chuẩn hóa lỗi. CV và recipes triển khai độc lập; không có dependency hai chiều, không giữ ảnh qua request.

- [x] Khởi tạo Spring Boot theo cấu trúc `controller/service/client/dto/config/exception`; dependency/build version được pin, có cấu hình local và Docker.
- [x] Viết typed clients vision/recipes; connect/read timeout, request ID, payload limit. Không tự retry upload/inference vô hạn; chỉ retry hữu hạn thao tác idempotent theo policy.
- [x] Hiện thực `/api/vision/predict`, `/api/dishes`, `/api/recipes/search`, `/api/recipes/{id}` và OpenAPI public.
- [x] Chặn `confirmed_dish` ngoài taxonomy; giữ nguyên tên món xác nhận khi gọi retrieval. Không lấy món thứ hai thay món đã chọn vì vector score cao hơn.
- [x] Map lỗi nội bộ sang error DTO chung, phân biệt dependency chưa ready, timeout, invalid image và empty recipe; không trả 200 với lỗi nằm trong body.
- [x] Actuator/liveness riêng; readiness tổng hợp dependency với timeout và cache ngắn, tránh tạo tải kiểm tra quá lớn.
- [x] Cấu hình CORS dev theo allowlist nếu khác origin; release dùng reverse proxy `/api` cùng origin, trình duyệt không biết địa chỉ container AI.
- [x] Integration tests: CV thật → Top-3 → chọn món → search → detail, cộng case dependency dừng/timeout và model/corpus version sai.
- [x] Sinh contract frontend từ OpenAPI; ghi version API và fixture dùng chung, Dockerfile backend nhiều stage.

### Kết thúc Phase 3

- [x] Rà file thừa, test/stub tạm, build output và fixture theo [cổng chung](#phase-closeout); giữ contract/integration tests và không đưa chúng vào runtime image.
- [x] Rà secrets và mọi giá trị mã/hash trong config, connection strings, logs, commit và image backend; OpenAPI/error response không chứa credential hoặc dữ liệu nội bộ nhạy cảm.
- [x] Người dùng review/merge PR Phase 3; agent fetch xác nhận trước frontend nghiệm thu với backend thật.

Điều kiện ra phase: Swagger backend kiểm thử được toàn luồng với CV/recipes thật; contract và lỗi ổn định; PR được người dùng merge vào `develop`.

## 8. Phase 4 — Frontend theo nguồn Stitch và tích hợp thật

Nhánh triển khai: `feature/frontend-phase4` từ develop đã có Phase 0–3, tận dụng frontend React/TypeScript/Vite đã merge. Ngày 2026-10-19 người dùng xác nhận gửi nhầm nguồn trước đó: **nguồn chuẩn thay bằng `/home/trantung/ict/stitch_giao_di_n_chatbot_m_th_c`**, gồm `code.html` và `screen.png`. `/home/trantung/ict/FrontEndCookLens` và snapshot Phase 0 chỉ còn là lịch sử, không dùng làm baseline màu/font/bố cục cho lần thiết kế này.

### Bước bổ sung: kiểm kê và thiết kế lại từ nguồn đúng

- [x] Đọc code.html, xem screen.png; lưu bản tham chiếu trong docs/frontend-reference/stitch, không đưa HTML demo/chat vào runtime.
- [x] Trích tokens nền kem #FAF0E1, primary cam #C84B00, nút camera xanh #2B8A3E, card #FFFDF8, border #EADBC8, font Epilogue/Plus Jakarta Sans, bo góc và bố cục hai panel upload/preview.
- [x] Thiết kế lại upload/nhận diện/list-detail theo cùng style; giữ brand CookLens, routes đã dùng và label tiếng Việt. Không biến UI thành một template khác.
- [x] Dùng font/icon local có notices/license, bỏ Tailwind/Google Fonts CDN và JS demo khỏi app. Đối chiếu screenshot nguồn và triển khai; phân biệt phần có ảnh nguồn với màn hình được mở rộng từ tokens.
- [x] Loại nav/chat, tài khoản, lưu bộ sưu tập, thông báo và cooking assistant chưa có chức năng. Panel trợ lý trong nguồn chuyển thành hướng dẫn luồng hiện có; không giả trạng thái AI online hoặc sinh món/công thức demo.

Nguyên tắc phối hợp: frontend chỉ gọi public /api cùng origin, dùng contract sinh từ OpenAPI đã kiểm tra snake_case và schema 200. Confidence CV và cosine retrieval là hai khái niệm khác nhau; state xác nhận nằm tại UI, mọi thay đổi ảnh/món vô hiệu kết quả cũ. Backend chỉ sửa phần OpenAPI phát hiện chưa khớp wire contract, không đổi API version hoặc domain.

- [x] Tách upload/predictions/recipes, API client/types và CSS tokens; tận dụng logic validation/cancel/reset đã có thay vì chép JS demo.
- [x] Dùng type sinh từ OpenAPI đầy đủ; kiểm tra api_version, request ID, shape/version metadata, Top-3/rank/score, danh mục và món đã xác nhận ở runtime.
- [x] Upload JPG/PNG tối đa 10 MiB/25 triệu pixel, xem trước/xóa/chụp/đổi ảnh; loading, disabled, lỗi và retry rõ ràng.
- [x] Hiển thị đúng ba ứng viên, tên tiếng Việt/confidence, chưa chọn mặc định. Xác nhận một món hoặc sửa trong danh mục 30 món; tự tìm recipe cho lựa chọn đó.
- [x] Recipe list/detail có title/preview/nguồn/license/attribution/nguyên liệu/bước nấu và dữ liệu thời gian/khẩu phần trung thực; query tùy chọn chỉ xếp hạng trong món xác nhận.
- [x] Escape text, chỉ link HTTP(S) không credential; không render HTML nguồn. Hiển thị AI-authored provenance và null/empty đúng dữ liệu thật.
- [x] Hủy/bỏ qua response cũ khi đổi ảnh/món hoặc điều hướng, giải phóng object URL; không giữ recipe cũ dưới tên món mới, không lưu ảnh vào storage.
- [x] Responsive desktop/mobile, focus/keyboard/radio labels/screen reader, reduced motion và không overflow; đây là kiểm thử web; Expo được triển khai/nghiệm thu riêng ở phần mobile bên dưới, không APK.
- [x] Chụp/upload so sánh cùng viewport, giữ ảnh nguồn và baseline triển khai được chọn; ghi rõ phần giữ và phần thay vì bỏ chatbot/khác chức năng. Không coi source có sẵn các màn recognition/detail khi chỉ cung cấp một trang.
- [x] Nginx static + reverse proxy backend theo service name; /api cùng origin, upload/deadline/error JSON/request ID thống nhất. Không dùng Vite cho production, không cache asset cũ hoặc phụ thuộc CDN lúc runtime.
- [x] Dockerfile frontend nhiều stage và overlay Compose Phase 4 chạy cùng AI thật, chỉ publish frontend; không bake địa chỉ máy thành viên.
- [x] E2E desktop/mobile với backend/CV/recipes thật và tests giả lập lỗi/race/empty/timeout/escape/đổi ảnh; kiểm tra Nginx lỗi chủ động, font/assets offline và schema sinh lại không lệch.

### Kết thúc Phase 4

- [x] Rà HTML/CSS/JS/file/IDE/build output/test/screenshots thừa, giữ tests/baseline có mục đích; không COPY docs/reference/tests vào image.
- [x] Rà secrets và mọi literal mã/hash/SHA/checksum/digest trong source, lockfile, fixtures, env, tài liệu, PR và static bundle. Không đưa source maps hoặc giá trị xác thực vào image; asset filenames dùng tên ổn định, không gắn mã hash.
- [x] Tạo PR/báo cáo kèm bằng chứng đối chiếu thiết kế và test; người dùng đã merge PR #14 và `origin/develop` được xác nhận trước Phase 5.

Điều kiện ra phase: người dùng mới hoàn thành ảnh → Top-3 → chọn/sửa món → recipe list/detail trên giao diện Docker với AI thật, không cần Swagger/console. Giao diện theo nguồn Stitch đúng, không chatbot; người dùng review/merge PR.

### Mobile bằng Expo — cùng domain, triển khai cùng Phase 5 theo yêu cầu cập nhật

Mobile là một client khác của CookLens, giữ nguyên luồng **chụp/chọn ảnh → Top-3 → xác nhận/sửa món → tối đa ba công thức → chi tiết nguyên liệu/bước nấu/nguồn**, taxonomy 30 món và giới hạn model. Không thêm chatbot, đăng nhập, lịch sử hoặc service AI riêng để làm mobile. Người dùng yêu cầu triển khai Expo ngay cùng Phase 5; mã trên `feature/mobile-expo`, báo cáo và kiểm chứng thiết bị tách khỏi nghiệm thu web/Docker. Xem [PR Expo #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17), [báo cáo Expo trên nhánh triển khai](https://github.com/tung51652-alt/Cooking-assistant/blob/feature/mobile-expo/docs/phases/mobile-expo.md) và [hướng dẫn chạy Expo Go](https://github.com/tung51652-alt/Cooking-assistant/blob/feature/mobile-expo/mobile/README.md).

Nguyên tắc chung:

- **Tổ chức mã:** `mobile/` chứa Expo/React Native trên nhánh `feature/mobile-expo` từ `develop` đã tích hợp. `packages/cooklens-api` chứa types/validation/transport thuần dùng thật ở cả hai client; schema vẫn sinh từ OpenAPI, không chép taxonomy. Adapter upload/navigation riêng từng nền tảng; giữ màu sắc, typography và cấu trúc luồng với component native.
- **Cùng backend:** dùng public API version hiện có, cùng `normalized_dish`, schema lỗi và ý nghĩa confidence/retrieval score; không gọi thẳng vision, recipes hoặc Qdrant. Model, corpus và trọng số vẫn ở Docker trên máy chủ; điện thoại không tải model hoặc chạy inference cục bộ. “Offline sau khi pull image” là khả năng của stack server; điện thoại vẫn cần kết nối tới server đó.
- **Địa chỉ truy cập:** web tiếp tục gọi `/api` cùng origin; Expo cần base URL tuyệt đối tới public gateway `/api`. Điện thoại thật dùng IP LAN của máy chạy Docker hoặc URL HTTPS truy cập được; `127.0.0.1` trên điện thoại là chính điện thoại. Compose mặc định bind loopback; PR Expo bổ sung cấu hình LAN dev tường minh và chỉ mở gateway, không mở service nội bộ. QR/Metro kết nối được chưa chứng minh API truy cập được.
- **Cách chạy:** PR Expo chọn Expo Go với SDK/dependency tương thích. Không thêm pipeline APK/AAB, EAS Build hoặc phát hành store trong phạm vi này. Nếu có dependency buộc dùng development build, phải rà lại lựa chọn thư viện và cập nhật phương án với người dùng trước khi đổi cách chạy đã thống nhất.
- **Ảnh và state:** xin quyền camera/thư viện đúng lúc, xử lý từ chối/hủy chọn và có lựa chọn thay thế. Chuyển ảnh điện thoại sang JPEG/PNG khi cần, giữ đúng orientation và giới hạn upload của API; không mở rộng định dạng phía server ngầm. Dùng multipart qua adapter native; đổi ảnh/món, điều hướng Back, retry hoặc app quay lại foreground không được làm response cũ ghi đè kết quả mới.
- **Cấu hình:** base URL là cấu hình public; không đưa secret vào `EXPO_PUBLIC_*`, bundle hoặc QR/logs. Quy tắc biến môi trường theo [Expo environment variables](https://docs.expo.dev/guides/environment-variables/); cách chạy trên thiết bị theo [Expo start developing](https://docs.expo.dev/get-started/start-developing/). PR #17 pin Expo SDK 58 và dependency tương thích; cần kiểm tra lại tương thích khi nâng SDK.

Checklist khi bắt đầu và nghiệm thu mốc Expo:

- [x] Chốt SDK/dependencies hỗ trợ Expo Go, vị trí mã và adapter dùng chung; bổ sung hướng dẫn cài dependency/start/scan QR, không yêu cầu người dùng build APK.
- [x] Dùng chung API contract/types/validation, taxonomy/model/corpus metadata và backend với web; sáu client contract tests và CI web/server thật đã pass, không nhân bản backend hoặc dữ liệu cho mobile.
- [ ] Kiểm tra từ điện thoại thật tới gateway LAN/HTTPS, native multipart và metadata versions; chưa có thiết bị kết nối để nghiệm thu.
- [x] Triển khai camera/thư viện, permission denied/cancel, preview/đổi ảnh, validation/chuyển định dạng và upload; không lưu lịch sử ảnh. Typecheck/bundle đã pass; hành vi camera/HEIC trên thiết bị còn chờ kiểm chứng ở mục dưới.
- [x] Triển khai Top-3, xác nhận/sửa món, danh sách/chi tiết và nguồn; loading/empty/error/retry, hủy request và chặn kết quả cũ. Client contract dùng chung được kiểm thử; chưa coi là nghiệm thu native trên thiết bị thật.
- [ ] Kiểm thử trên thiết bị thật Android và iOS theo phạm vi bàn giao đã chốt; kiểm tra safe area, chữ lớn, screen reader, nút Back và chuyển nền/quay lại app. Báo rõ nền tảng chưa được kiểm chứng; không dùng test viewport web thay bằng chứng Expo.
- [x] Web build, 20 Playwright desktop/mobile và sáu client contract tests pass sau tách client. Tám checks PR #17, gồm gateway/browser/Docker/CV/recipes thật và Expo bundle, đã pass; không dùng kết quả này thay bằng chứng Expo trên thiết bị.
- [x] Rà file/test tạm, cache Metro, generated outputs, source/config/lockfile và nội dung commit; scanner metadata cùng web bundle đã pass. Native export chỉ dùng kiểm tra bundling, không commit/publish output. PR #17 đã sẵn sàng review, mô tả nêu rõ phần chưa kiểm chứng trên điện thoại; không coi đây là nghiệm thu native release.
- [ ] Người dùng review/merge PR Expo; nghiệm thu thiết bị thật trước khi xác nhận hoàn tất mốc mobile. Không tự merge hoặc bật auto-merge.

## 9. Phase 5 — Docker Compose và artifact đầy đủ

Nhánh: `feature/docker-release` từ `develop`; Dockerfile từng service đã được chuẩn bị ở phase sở hữu service. Phase này tích hợp, đo tài nguyên và hoàn thiện hành vi khởi động.

Nguyên tắc phối hợp: mỗi image chứa đúng mã/dependency/artifact của service; release Compose chỉ dùng `image:`, không có `build:` hay bind mount bắt buộc từ source/máy phát triển. `compose.dev.yaml` dành riêng cho build/hot reload.

### Trọng số và mô hình nằm ở đâu?

- Image `cooklens-vision` chứa checkpoint khoảng 30 MiB hiện tại tại `/opt/cooklens/models/`, kèm taxonomy và manifest version/kích thước. Docker build lấy artifact đã kiểm chứng từ staging do pipeline chuẩn bị, không lấy đường dẫn tuyệt đối của laptop.
- Image `cooklens-recipes` chứa model embedding/tokenizer/config, corpus và vectors đã precompute. Chế độ offline được bật khi runtime; không gọi model hub, pip, Maven hay npm lúc container khởi động.
- Qdrant dùng image chính thức; `recipe-init` tự đưa bundle từ image recipes vào named volume. Không phát hành image Qdrant chứa cả thư mục dữ liệu mutable.
- Image backend/frontend chứa bản build và cấu hình mặc định. Không image nào cần mount `venv`, source tree, file `.pt` hay API key từ máy người dùng.
- Quyền phân phối model/corpus và attribution là điều kiện phát hành artifact thật, do hiện provenance dataset còn cần xác minh. Đây là hạn chế đã có trong manifest, cần giải quyết ở Phase 0.

### Khởi động có thứ tự

```text
qdrant healthy → recipe-init completed successfully → recipes ready
vision ready ────────────────────────────────────────┐
recipes ready ────────────────────────────────────────┴→ backend ready → frontend
```

Compose phải dùng `healthcheck` cùng `depends_on` condition phù hợp. Container đang chạy chưa có nghĩa là model/index đã sẵn sàng; `recipe-init` kết thúc 0 là hành vi thành công, không đặt restart vô hạn cho job này. Restart của dependency sau startup vẫn cần timeout/reconnect trong service, không dựa riêng vào thứ tự boot.

- [x] Tạo release/dev Compose tách biệt, cùng cấu hình service names, version và ports. Chỉ frontend bind `127.0.0.1:8080` mặc định; chỉ mở cổng debug AI/Qdrant trong dev profile.
- [x] Healthchecks dùng công cụ có thật trong image, có `start_period` đủ thời gian load model/seed; timeout/retries hữu hạn. `recipe-init` phải thất bại rõ ràng khi bundle không vượt kiểm tra toàn vẹn nội bộ/version.
- [x] Image chạy user không phải root khi khả thi, dependency/runtime khóa version, build nhiều stage, `.dockerignore` không gửi secrets/venv lên build context.
- [x] Pin Qdrant, runtime base và image ứng dụng bằng version/tag dễ đọc; release manifest không ghi giá trị mã/hash. Không dùng `latest` làm định danh tái lập.
- [x] Volume Qdrant tồn tại qua restart; `up` lần hai không seed trùng; volume mới tự seed đúng, volume cũ upgrade theo collection version/alias.
- [x] Default CPU đủ chạy model, giới hạn worker/concurrency và memory theo số đo. Không tự tạo nhiều bản model vì worker count mặc định cao; GPU chỉ là profile sau này.
- [x] Build context cung cấp checkpoint qua quy trình artifact có version và kiểm tra toàn vẹn nội bộ; secret lấy artifact dùng build secret/CI secret, không `ARG`/`ENV` chứa token trong layer.
- [x] Chạy stack từ Compose chép riêng ngoài thư mục source, volume mới và không mount cache/model/source; mọi artifact nằm trong image, runtime không cần Python/Java/Node trên host. Image candidate build trên CI; cold pull registry trên máy sạch vẫn thuộc Phase 6.
- [x] Chặn outbound Internet của runtime sau khi có image và kiểm thử luồng chính; host vẫn cần Internet ở bước pull và mở link nguồn.
- [x] Ghi measured cold-start, seed time, image size, peak RAM và latency; runbook nêu cấu hình 4 logical CPU/khoảng 16 GiB đã kiểm chứng, chưa suy ra cấu hình thấp nhất hoặc P95 nghiệm thu.

### Kết thúc Phase 5

- [x] Rà file thừa, test scripts, bundle thử, logs và build contexts theo [cổng chung](#phase-closeout); test data không cần thiết nằm ngoài các image production.
- [x] Rà secrets/mã/hash trong nội dung dự án, Compose/env, scripts, report CI và history layer do dự án tạo; scanner không nới policy. Metadata upstream do Docker quản lý không sao chép vào nội dung dự án; không tuyên bố audit toàn bộ binary/layer bên thứ ba.
- [x] Tạo PR #16 kèm bằng chứng CI volume mới/Compose ngoài source; cold pull registry còn ở Phase 6.
- [x] Người dùng review/merge PR Phase 5 #16; đã fetch xác nhận trên `origin/develop` trước khi chuẩn bị Phase 6. Không tự merge hoặc bật auto-merge.

Điều kiện kỹ thuật đã đạt trên CI cho image candidate và Compose ngoài source. Điều kiện pull bộ phát hành từ registry trên máy sạch thuộc Phase 6, không tuyên bố đã đạt ở Phase 5.

Đối chiếu phần còn lại: cơ chế runbook, restart và rollback đã có bằng chứng ở candidate Phase 5; các checklist Phase 6–7 vẫn chưa tick vì chưa phát hành/pull bộ image từ registry hoặc nghiệm thu trên chính bộ release. Không dùng smoke candidate thay nghiệm thu release.

## 10. Phase 6 — Phát hành Docker Hub và runbook

Cập nhật yêu cầu ngày 2026-10-26: người dùng hoãn các bước Docker Hub/repository/secrets/push-pull. Tiếp tục chuẩn bị candidate trên CI, bộ Compose/notices/runbook và kiểm thử sớm bằng image build local; không yêu cầu Docker trên máy người dùng. Xem [preflight](../phases/phase-6-preflight.md) và [runbook candidate](../runbooks/candidate.md). Không tick hoàn tất Phase 6 hoặc nghiệm thu Phase 7 bằng candidate; giữ gate registry và nghiệm thu trên bộ phát hành cho đợt sau.

Nhánh: tạo nhánh Phase 6 từ `develop` đã có PR #16; có thể dùng `feature/release-ci` nếu cần tách CI/release thành PR độc lập.

Docker Hub được chọn làm registry cho lần phát hành này. Docker không bắt buộc dùng Docker Hub: có thể dùng registry khác hoặc `docker save/load`; nhưng muốn người dùng pull bản build sẵn, nhóm cần công bố image trong một registry truy cập được. Không tự đặt tên tài khoản như thể repository đã tồn tại.

| Image dự kiến | Nội dung |
| --- | --- |
| `trantung2006/cooklens-vision:2.0.0` | CV code + CPU runtime + checkpoint + taxonomy |
| `trantung2006/cooklens-recipes:2.0.0` | API retrieval + embedding model + corpus/vector bundle; cũng dùng cho init |
| `trantung2006/cooklens-backend:2.0.0` | Spring Boot API đã build |
| `trantung2006/cooklens-frontend:2.0.0` | React build + Nginx/reverse proxy |

Bốn image ứng dụng dùng tag `2.0.0` đồng bộ với release ứng dụng `v2.0.0`; file Compose và runbook phải chứa version đã nghiệm thu, không yêu cầu người dùng tự sửa. Qdrant tham chiếu repository chính thức và version/tag đã test, không push bản sao vào namespace nhóm.

- [ ] CI chạy kiểm thử/contract trước build; tải artifact qua kiểm tra toàn vẹn nội bộ, build cả bốn image và lưu manifest API/model/taxonomy/corpus/embedding versions.
- [ ] Image gắn release tag dễ đọc; Compose dùng version/tag đã nghiệm thu, không dùng commit/hash làm tag và không ghi đè nội dung release đã phát hành.
- [ ] Cấu hình quyền push bằng CI secret; public pull không cần token nếu đã đáp ứng quyền phân phối. Private release ghi rõ cần `docker login` một lần, không hứa chạy ẩn danh.
- [ ] Push vào Docker Hub và xác minh pull lại theo release tag trên máy/CI sạch. Publish là bước phát hành sau khi có namespace/quyền và artifact hợp lệ; viết kế hoạch này chưa thực hiện push.
- [ ] Kiểm tra version phát hành thống nhất: GitHub application release `v2.0.0`, bốn image ứng dụng `2.0.0`, Compose và runbook; giữ version API/model/taxonomy/corpus riêng, không đổi theo số phiên bản app một cách máy móc.
- [ ] Giao bộ release: `compose.release.yaml`, config mặc định không nhạy cảm, release notes, attribution/licenses và runbook tiếng Việt.
- [ ] Runbook nêu URL `http://localhost:8080`, readiness/cold-start, cách xem logs, restart, upgrade, rollback và xử lý model/index không tương thích.
- [ ] Giải thích `docker compose down` giữ named volume; `down -v` xóa dữ liệu index, lần sau phải seed lại. Không đưa lệnh xóa volume vào bước chạy thường ngày.
- [ ] Gate CI cuối cùng chạy bằng chính image từ registry, không dùng source bind mount hoặc image build local chưa push.

Lệnh mục tiêu sau khi tải bộ release:

```bash
docker compose -f compose.release.yaml up -d --pull always --wait
```

Runbook phải ghi phiên bản Compose đã test có hỗ trợ các option này và timeout cold-start đủ thực tế; nếu cần `--wait-timeout`, đưa giá trị được đo vào lệnh phát hành. Đây là giao diện chạy dự kiến, chưa phải file Compose đã được tạo trong lần viết kế hoạch.

### Kết thúc Phase 6

- [ ] Rà file thừa, release archive/test output và script thử theo [cổng chung](#phase-closeout); chỉ giao file Compose/config/attribution/runbook cần thiết.
- [ ] Rà secrets và mọi giá trị mã/hash trong commits, workflows, logs, manifest, registry image và bundle tải về; không ghi giá trị mã/hash, login token hoặc URL ký tạm thời.
- [ ] Tạo PR kèm image version/tag và kết quả pull thật; chờ người dùng merge rồi fetch xác nhận trước phase nghiệm thu cuối.

Điều kiện ra phase: release có image thật, version/tag đã kiểm chứng, tải/chạy được từ máy không có repo hoặc artifact local; người dùng chỉ cần bộ release và Docker, thêm login nếu dùng registry private; PR được người dùng merge vào `develop`.

## 11. Phase 7 — Nghiệm thu end-to-end

Nhánh: `feature/mvp-acceptance` từ `develop` đã tích hợp; bug sửa tại nhánh service tương ứng và PR lại. Chỉ hoàn tất milestone sau test từ image phát hành.

Nguyên tắc phối hợp: nghiệm thu bằng một bộ version tương thích, cùng thiết bị CPU và tập dữ liệu đã ghi nhận. Các ngưỡng dưới đây là mục tiêu đề xuất để chốt ở Phase 0; thay đổi phải có lý do và được ghi trước chạy nghiệm thu cuối.

| Hạng mục | Gate dự kiến |
| --- | --- |
| CV | Top-3 ≥ 95% trên clean test split cố định; báo cáo Top-1/Macro F1 và so sánh baseline; fixture giữ Top-1 tương đương inference gốc |
| Taxonomy | 30/30 class khớp checkpoint/mapping/API, không trùng index hoặc `normalized_dish` |
| Corpus | Ít nhất 1 recipe có nguồn và được review cho mỗi món hỗ trợ; 100% recipe đạt schema, không bịa đủ số lượng |
| Retrieval | Bộ ít nhất 150 query được gán relevant IDs (5 query/món); Hit@1 ≥ 0.90, Hit@3 ≥ 0.95; báo cáo MRR; 0 kết quả sai món đã xác nhận |
| Dữ liệu rỗng | Món không có recipe không fallback sang món khác; trả rỗng rõ ràng; ID không có trả 404 |
| Latency | Mục tiêu P95 request dự đoán ≤ 10 giây, search ≤ 3 giây, concurrency 1, model/index đã warm; ghi CPU/RAM và ít nhất 100 lần đo mỗi API |
| Tài nguyên | Mục tiêu runtime CPU trên máy 4 logical cores/8 GiB RAM với ngân sách Docker được ghi rõ; công bố RAM/disk tối thiểu bằng số đo, không dùng mục tiêu như bằng chứng đã đạt |
| Khởi động | Máy sạch pull và up thành công; cold start/seed có số đo riêng, readiness không báo thành công sớm |
| Offline | Sau pull, không cần API LLM, model hub hoặc tải checkpoint ngoài image để upload/chọn món/tra recipe |

- [ ] Chạy tối thiểu 30 ảnh đại diện có quyền dùng, lưu expected assertions; kiểm thử upload → Top-3 → đổi món → recipe → detail.
- [ ] Kiểm thử confidence thấp/món ngoài miền, ảnh nhiều món, file giả/ảnh lỗi/quá lớn; UI không tuyên bố model đã phát hiện món ngoài 30 lớp.
- [ ] Kiểm thử đổi ảnh liên tục, response về sai thứ tự, retry, món rỗng và tên alias; không giữ kết quả cũ dưới lựa chọn mới.
- [ ] Dừng/restart vision, recipes và Qdrant; backend/UI trả lỗi rõ ràng và hoạt động lại sau dependency hồi phục.
- [ ] Khởi động volume mới, restart giữ volume, nâng corpus version, lỗi seed và rollback về release trước; kiểm chứng cặp image/index tương thích khi rollback.
- [ ] Kiểm tra không lộ token, path máy dev, ảnh gốc trong logs, checkpoint trong Git hoặc runtime tải model ngầm.
- [ ] Lưu báo cáo CV/retrieval/latency/resources, image version/tag và video/screenshot luồng UI trong tài liệu release.
- [ ] Cập nhật README/checklist theo bằng chứng đã có, hướng dẫn lấy artifact cho developer và lệnh chạy cho người dùng.

### Kết thúc Phase 7

- [ ] Rà tổng thể file thừa/test tạm và artifacts qua tất cả PR theo [cổng chung](#phase-closeout); giữ bộ test hồi quy và bằng chứng cần thiết, không xóa tài liệu/test hữu ích để làm sạch hình thức.
- [ ] Chạy lại rà secrets và mọi giá trị mã/hash trên phạm vi commit sẽ phát hành, source, docs, fixtures, bundles và image cuối; báo kết quả/giới hạn, không in giá trị bí mật.
- [ ] Tạo PR nghiệm thu và gửi báo cáo; người dùng merge, agent fetch xác nhận `origin/develop`, chỉ sau đó mới chuẩn bị PR release lên `main` để người dùng quyết định merge.

Điều kiện kết thúc: tất cả gate đã chốt đạt trên release thực; các hạn chế còn lại được ghi cụ thể. Người dùng merge PR để `develop` chứa phiên bản tích hợp đã nghiệm thu trước khi đề xuất release lên `main`.

## 12. Thứ tự thực hiện và việc có thể song song

```text
Phase 0: contract/taxonomy/artifact policy
  → Phase 1: CV Top-3 + mapping
  → Phase 2: corpus + recipes + Qdrant/init
  → Phase 3: backend tích hợp thật
  → Phase 4: frontend tích hợp thật
  → Phase 5: Compose và offline artifact hoàn chỉnh
  → Phase 6: push/pull registry và bộ release
  → Phase 7: nghiệm thu release → develop → đề xuất main
```

Sau Phase 0 đã được người dùng merge, CV và data/recipe có thể phát triển song song trong phạm vi dependency đã sẵn sàng; backend/frontend có thể dựng từ contract và fixture. Dockerfile được làm cùng service từ đầu. Các mũi tên biểu thị thứ tự nghiệm thu tích hợp. Kết thúc mỗi phase, agent bàn giao PR cùng báo cáo file/test/secrets rồi chờ người dùng merge; chỉ bắt đầu phase phụ thuộc tiếp theo sau khi xác nhận `origin/develop` đã chứa kết quả. Phase 3 chỉ được nghiệm thu khi có AI thật; Phase 4 chỉ được nghiệm thu với backend thật và bản đối chiếu giao diện nguồn; Phase 7 luôn chạy từ image đã publish.

## 13. Nguồn kỹ thuật cho quyết định Docker

- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): `service_healthy` và `service_completed_successfully`; process chạy chưa đồng nghĩa sẵn sàng.
- [Compose service reference](https://docs.docker.com/reference/compose-file/services/): `image`, `build`, `healthcheck`, `depends_on`, `pull_policy`, volume và ports.
- [Docker Hub repositories](https://docs.docker.com/docker-hub/repos/): nơi lưu và phân phối image; namespace/visibility phải được chốt khi phát hành.

Các nguồn trên được tham chiếu ngày 2026-10-19; việc lựa chọn bốn image ứng dụng, CPU mặc định và model/corpus đi kèm image là quyết định triển khai của kế hoạch này.
