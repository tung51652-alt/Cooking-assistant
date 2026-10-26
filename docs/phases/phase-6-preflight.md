# Phase 6 — Kiểm tra đầu vào trước phát hành

Ngày kiểm tra: 2026-10-26. Phạm vi lượt này chỉ gồm **bước 1: tạo nhánh** và **bước 2: rà đầu vào phát hành**. Chưa triển khai workflow publish, tạo repository registry, cấu hình secret, push image hoặc phát hành ứng dụng.

Đây là snapshot trước thay đổi candidate; tiến độ CI tiếp theo được ghi tại [báo cáo candidate](phase-6-candidate.md).

## 1. Nhánh và nền tích hợp

- Nhánh làm việc: `codex/phase6-release-ci`, tạo từ `origin/develop` sau khi fetch.
- Đã kiểm tra bằng GitHub API rằng [PR Phase 5 #16](https://github.com/tung51652-alt/Cooking-assistant/pull/16) đã merge vào `develop`, và xác nhận merge nằm trong lịch sử `origin/develop`.
- Working tree sạch trước khi chuyển nhánh. Thay đổi duy nhất của lượt này là báo cáo này; không sửa runtime, Dockerfile hoặc workflow.
- PR Expo #17 vẫn riêng; không đưa mã Expo chưa merge vào nhánh Phase 6. Không yêu cầu cài Docker hoặc môi trường AI trên máy người dùng.

## 2. Kết quả đầu vào

| Hạng mục | Kết quả và giới hạn |
| --- | --- |
| Manifest | `verify_mvp_inputs.py` đạt; 30 nhãn duy nhất, cấu hình E5 384 chiều/cosine và nguồn artifact đúng manifest. |
| Taxonomy/corpus | Validator full coverage đạt: 33 công thức, phủ 30/30 món. Version taxonomy/corpus và số lượng khớp giữa hai manifest. 7 test dữ liệu đạt. |
| Vision artifact | Tải thật checkpoint từ release `vision-model-v1` bằng downloader của repo thành công; kích thước 31.434.209 bytes. Kiểm tra toàn vẹn dùng metadata upstream trong bộ nhớ. Chưa load checkpoint bằng PyTorch trong lượt này. |
| Embedding artifact | Tải thật từ release public `embedding-model-v1` và qua kiểm tra toàn vẹn của downloader. Asset ZIP 492.797.971 bytes khớp manifest; staging có đúng 6 file, weights 470.641.600 bytes và config `hidden_size=384`. Chưa load model bằng Transformers trong lượt này. |
| Model local | Artifact tải vào `deploy/artifacts/staging/`, đã kiểm tra Git ignore. Không đưa model vào commit. Chưa cài torch/transformers hoặc dựng vector bundle mới trên máy này. |
| Notices | Dockerfile vision copy provenance và notice torchvision; recipes copy provenance E5, notice MIT và tài liệu nguồn/tác giả corpus. Frontend copy public assets/notices qua build stage. Đây là rà source đóng gói, chưa audit image mới. |
| Dockerfile | Cả bốn image có runtime user riêng và healthcheck. Vision/recipes copy artifact local; recipes bật offline cho Hugging Face/Transformers. Backend/frontend dùng build stage; runtime không cần source trên host. |
| Release Compose | Rà source: dùng image/tag, không có build hoặc source bind mount; Qdrant có named volume, init phải hoàn tất trước recipes; AI/backend nằm trên mạng internal. Chỉ frontend publish loopback 8080. Chưa chạy lại `docker compose config` hoặc runtime tại máy này. |
| CI nền | Các checks `browser-and-docker`, `validate`, `gateway-and-real-stack`, `verify-inputs` trên develop hiện tại đều success lúc kiểm tra GitHub API. Đây là kết quả CI có sẵn, không phải workflow vừa dispatch trong lượt này. |
| Gate Phase 5 | `standalone-and-offline` của PR #16 success. Đã dùng Git diff xác nhận Dockerfiles, Compose, harness standalone, Docker workflow và dockerignore không thay đổi giữa đầu PR đó và develop hiện tại. Không thay bằng chứng này cho nghiệm thu registry Phase 6. |

[Gate standalone Phase 5 đã kiểm tra](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/39246372917/job/118039173536). Bằng chứng số đo được lưu sẵn tại [phase-5-docker.json](evidence/phase-5-docker.json).

Quyền public checkpoint đã được chủ dự án xác nhận trong [provenance](../../deploy/artifacts/vision-model-v1.md); không yêu cầu xác nhận lại. Giới hạn còn giữ: quyền dataset chưa được audit độc lập; corpus có 21 record Wikibooks và 12 record AI-authored, chưa thử nấu hoặc review bên ngoài. Các kết quả cấu trúc không thay thế đánh giá chất lượng ở Phase 7.

## 3. Các việc còn thiếu trước publish

1. **Workflow phát hành registry:** workflow Docker hiện tại chỉ build và smoke candidate local; chưa login/push Docker Hub, chưa có job pull lại trên runner sạch, chưa đóng gói bộ release chính thức.
2. **Cổng kiểm thử trước publish:** Java tests, CV/recipes và browser/contract checks đang ở các workflow riêng. Workflow phát hành phải xác minh đủ kết quả cho đúng source phát hành hoặc chạy các gate bắt buộc trước push; không coi riêng deploy unit tests là đủ.
3. **Tên image và version:** Compose mặc định vẫn dùng tên image local `cooklens-*` và tag `2.0.0-rc.1`. Bộ release cần chứa namespace/tag đã nghiệm thu, đồng bộ bốn image, không yêu cầu người dùng tự sửa và không ghi đè bản đã phát hành.
4. **Metadata của harness:** `smoke_release_stack.py` còn ghi cứng `application_candidate` và giới hạn báo cáo của Phase 5. Khi tái sử dụng cho release phải truyền/đối chiếu version thật và phân biệt build local với pull registry; hiện chưa sửa vì ngoài phạm vi bước 1–2.
5. **Artifact recipes sinh lúc build:** model đã có nguồn tải; corpus/vector bundle vẫn phải được tạo trên CI rồi validate trước Docker build. Không yêu cầu developer tạo bundle trên máy này để hoàn tất preflight.
6. **Registry và quyền push:** manifest mới ghi namespace public `trantung2006` đã được chọn; chưa kiểm chứng quyền push. Việc kiểm tra/tạo đủ repository và thiết lập CI secrets thuộc bước sau, chưa làm trong lượt này.
7. **Bộ bàn giao:** runbook hiện mô tả candidate local/save-load, chưa phải bộ pull registry. Cần Compose đã chốt image, release notes, config mặc định, notices và hướng dẫn pull/start/restart/upgrade/rollback có bằng chứng tương ứng.

Application release `v2.0.0` chưa tồn tại trong danh sách release GitHub lúc kiểm tra; hiện chỉ có hai release artifact model. Chưa đánh dấu Phase 6 hoặc Phase 7 hoàn tất.

## 4. Kiểm tra đã chạy

Dùng Python 3.12.14 có sẵn trong runtime công cụ, không cài Python/ML dependencies lên môi trường dự án. Các lệnh dưới đây ghi bằng tên `python` để tái lập với Python tương thích:

```sh
python deploy/scripts/verify_mvp_inputs.py
python data/recipes/validate.py --require-full-coverage
python -m unittest discover -s data/tests -v
python -m unittest discover -s deploy/tests -v
python deploy/scripts/check_public_metadata.py
python deploy/scripts/fetch_vision_checkpoint.py
python deploy/scripts/fetch_embedding_model.py
```

Ngoài ra đã đối chiếu manifest, source Dockerfile/Compose, Git ignore, lịch sử merge và check status qua GitHub API. Các kiểm tra source không thay thế YAML parsing bằng Docker Compose, build image, chạy inference hoặc smoke runtime.

## 5. Rà soát bàn giao bước 1–2

| Phạm vi | Kết quả |
| --- | --- |
| files | Chỉ thêm báo cáo preflight; artifact ở staging bị ignore. Không thêm script thử hoặc generated output vào Git. |
| tests | 7 test data và 16 test deploy đạt; manifest và full-coverage validator đạt. Không viết test mới cho báo cáo Markdown. |
| secrets/hashes | Scanner toàn bộ tracked text và báo cáo mới đạt trước bàn giao; kiểm tra whitespace và liên kết file nội bộ của báo cáo đạt. Không in/lưu giá trị kiểm tra toàn vẹn hoặc credential. |
| build/image | Chỉ rà source và đối chiếu bằng chứng CI Phase 5. Không build/push image, không chạy Docker hoặc audit layer mới trên máy này. |

Kết luận preflight: có nền tích hợp và đầu vào để chuẩn bị mã Phase 6. Những mục còn thiếu ở phần 3 là việc của các bước tiếp theo; preflight không phải phê duyệt phát hành.
