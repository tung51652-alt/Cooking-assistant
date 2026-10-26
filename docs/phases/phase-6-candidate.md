# Phase 6 — Candidate CI khi hoãn Docker Hub

Ngày: 2026-10-26. Nhánh `codex/phase6-release-ci`, nền `develop` đã có Phase 5. Người dùng cho phép tiếp tục phần candidate và kiểm thử, hoãn repository/secrets/push-pull Docker Hub. Chưa đánh dấu hoàn tất Phase 6–7 hoặc phát hành ứng dụng `v2.0.0`.

## Thay đổi

- Workflow Docker có job kiểm tra source trước build: manifest/full coverage, data/deploy tests, Java tests, frontend build/bundle audit và Playwright. Job standalone chỉ chạy khi job này đạt.
- Đóng gói Compose đã resolve tên/tag image từ chính cấu hình build; giữ override `HOST_PORT` và để project name tiếp tục cô lập network/volume. Không chấp nhận bind mount, service nội bộ public, version không đồng bộ hoặc metadata bị cấm.
- Gói gồm Compose, `candidate.json`, runbook, notes và 10 tài liệu notices/provenance; không có image/model binary, source, credential hoặc output debug. Docker Hub không cần secret và không có bước publish.
- Harness nhận `--compose` để test chính file trong gói, lấy version từ image thay vì ghi cứng. Giữ tests fresh seed/repeated init, nâng corpus/rollback, bundle sai, down/up giữ volume, dừng/phục hồi dependency và offline.
- `--samples 100` chạy 100 mẫu tuần tự/API sau warm-up. P95 theo nearest rank chỉ có khi đủ mẫu; gate vision ≤10 giây, search ≤3 giây. Không dùng ảnh smoke để báo accuracy hoặc coi máy CI là cấu hình tối thiểu.
- Artifact Actions `cooklens-candidate` chỉ upload khi kiểm thử thành công, có `verification.json` cùng version/image tags. Artifact là gói cấu hình và report, không tự chạy được khi chưa có image build/load trên máy Docker khác.

## Kiểm chứng

Local dùng Python 3.12.14 đi kèm công cụ, không cài Docker hoặc môi trường AI trên máy người dùng:

- 22 test deploy đạt, gồm 6 test mới cho đóng gói, từ chối cấu hình không an toàn/không tương thích, giữ file người dùng, cô lập project và cách báo P95.
- 7 test data đã chạy đạt; manifest và validator full coverage đạt 33 recipe/30 món.
- Scanner tracked source và các file mới, whitespace, Python syntax và liên kết tài liệu được kiểm tra trước push.
- Chưa có Docker trên host local; chưa chạy lại Java/browser/Docker runtime tại host. Kết quả CI của thay đổi mới còn chờ, sẽ ghi bổ sung sau khi workflow chạy.

Không dùng kết quả CI Phase 5 cũ làm bằng chứng rằng workflow mới đã pass. [Preflight đầu vào](phase-6-preflight.md) lưu kết quả bước 1–2 trước thay đổi candidate.

## Cách chạy trên máy CI/developer có Docker

```sh
docker compose -f deploy/compose/compose.release.yaml -f deploy/compose/compose.dev.yaml build
docker pull qdrant/qdrant:v1.19.2
docker compose -f deploy/compose/compose.release.yaml config --format json > /tmp/cooklens-compose.json
python deploy/scripts/prepare_candidate_bundle.py --compose-json /tmp/cooklens-compose.json --output /tmp/cooklens-candidate
python deploy/scripts/smoke_release_stack.py --compose /tmp/cooklens-candidate/compose.release.yaml --samples 100 --report /tmp/cooklens-candidate/verification.json
```

Trước build phải stage checkpoint/embedding và dựng recipe vector bundle theo README. Thư mục output phải mới; script không ghi đè thư mục đang có. Workflow tự chuẩn bị artifact trên runner. Hướng dẫn cho người nhận gói tại [runbook candidate](../runbooks/candidate.md).

## Rà soát cuối

| Phạm vi | Nội dung |
| --- | --- |
| files | Chỉ workflow, harness, script đóng gói, tests cần thiết và tài liệu. Không đưa model/staging, bundle mẫu, cache hoặc output CI vào Git. |
| tests | Unit checks local đã đạt; kiểm thử build/browser/runtime của thay đổi mới phải xác nhận bằng CI trước bàn giao PR sẵn sàng merge. |
| secrets/hashes | Scanner không in giá trị; kiểm tra source/file mới, commit sẽ push và nội dung bundle. Không xuất raw Docker inspect/history hoặc mã xác thực vào artifact. |
| build/image | Runtime image không đổi business logic; CI build và test candidate. Quyền push registry, pull trên runner sạch và audit bộ image phát hành vẫn hoãn. |

## Phần còn lại

Docker Hub repositories/secrets, publish, clean pull và bộ release chính thức vẫn thuộc Phase 6. Phase 7 còn accuracy trên tập ảnh có quyền, review công thức, các gate release thực và phần thiết bị phù hợp phạm vi bàn giao. Expo trên điện thoại thật vẫn chưa nghiệm thu; Actions không cung cấp backend thường trực cho điện thoại.

Agent chỉ bàn giao PR; người dùng review/merge. Không tự merge hoặc bật auto-merge.
