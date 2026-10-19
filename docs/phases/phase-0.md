# Phase 0 — Contract và đầu vào có thể tái lập

Ngày: 2026-10-19. Nhánh: `feature/mvp-contracts`, đã đồng bộ `origin/develop` sau khi PR #5 và #7 được người dùng merge. Trạng thái: **phần triển khai Phase 0 sẵn sàng review, chờ người dùng merge PR #6**. Chưa bắt đầu Phase 1/2 phụ thuộc; chưa phát hành ứng dụng/Docker image.

## Kết quả có thể review

| Phần | Kết quả và bằng chứng |
| --- | --- |
| Public/internal API | [Contract v1](../contracts/mvp-v1.md): endpoints, DTO, versions, upload limits, confirmation, filtering/ranking, health, errors và deadlines |
| Taxonomy | Ordered labels 30 lớp đối chiếu checkpoint trong [manifest](../../deploy/artifacts/manifest.json); mapping dùng chung nhập/chuẩn hóa ở Phase 1, không tự thay thứ tự lớp |
| UI | Ba [HTML nguồn](../frontend-reference/README.md) giữ fingerprint; khung web và bốn screenshot baseline trong `frontend/docs/` đã merge qua PR #7. CSS mới được ghi đúng provenance, chưa nghiệm thu với backend thật. Mobile sau dùng Expo, hiện tại web responsive; không APK/chatbot |
| Checkpoint | EfficientNet-B2, 31.434.209 bytes, SHA-256 đã kiểm tra; Phạm Hoàng Minh train; [permission/provenance](../../deploy/artifacts/vision-model-v1.md) ghi quyền public do người dùng xác nhận |
| Nguồn CI | [Release vision-model-v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/vision-model-v1), checkpoint + SHA256SUMS + provenance + torchvision notice. URL/version cố định, không dùng `latest` |
| Transfer | [Hướng dẫn artifact](../../deploy/artifacts/README.md); script tải atomic, kiểm tra size/hash; workflow CI read-only dùng cùng script, không cần token tải checkpoint public |
| Embedding | multilingual-e5-small revision cố định, 384d, MIT theo model card; checksum từ upstream LFS, chưa tải/benchmark weights |
| Recipe source | Chọn Wikibooks text với attribution/share-alike theo từng revision; 0 recipe nhập, coverage hiện 0/30, không giả là đủ corpus |
| Gates | [Quyết định runtime](../decisions/mvp-runtime.md) chốt metrics, CPU/RAM mục tiêu và concurrency; không trình bày mục tiêu như benchmark đã đạt |
| Registry | `trantung2006`, public, `linux/amd64` đã chốt; quyền push và image digest kiểm chứng ở Phase 6 |

## Kiểm tra và giới hạn

- Local checkpoint và ba HTML fingerprints đạt verifier; giữ nguyên bytes của file nguồn, không commit checkpoint.
- Transfer regression: 4 tests đạt, gồm tải đúng/dùng lại cache, cùng size sai hash, tải thiếu/dư, mất kết nối sau một phần bytes và bảo toàn file đích đang có sai nội dung. Test dùng bytes nhỏ có chủ đích, tempfile tự dọn; không cần torch hoặc model tải mạng trong unit tests.
- Public download round-trip: đang ghi kết quả sau khi publish release; không dùng local copy thay bằng chứng mạng.
- GitHub Actions workflow được thêm để chạy cùng regression và tải thật ở môi trường CI. Kết quả run từ xa phải được xem riêng, không suy từ kết quả local.
- Không chạy lại E2E frontend vì mã UI không đổi so với PR #7; runtime CV/recipes/backend, Docker/offline full stack và các benchmark chưa thuộc Phase 0.

## Việc tiếp theo đã phân phase

| Mốc | Việc cần làm |
| --- | --- |
| Phase 1 | Chuẩn hóa mapping dùng chung từ nhánh data, triển khai CV Top-3, Dockerfile giữ model notices |
| Phase 2 | Review recipe từng món, bổ sung nguồn được phép cho lớp thiếu; tối thiểu 1 recipe/món; tải/bundle embedding và đánh giá retrieval |
| Phase 4 | Nghiệm thu frontend với backend/AI thật và đối chiếu giao diện; Expo là mốc sau MVP web |
| Phase 5–7 | Đóng gói offline, đo tài nguyên/latency, kiểm tra quyền push và pull Docker Hub, nghiệm thu image release |

Các việc trên không bị đánh dấu đã hoàn thành trong Phase 0. Quyền public checkpoint được ghi theo xác nhận của người dùng; không gán license torchvision cho dataset/checkpoint hoặc công bố đã audit độc lập toàn bộ dataset.

## Cổng bàn giao PR

- [x] Contract, taxonomy metadata, nguồn artifact/model/corpus policy và tiêu chí nghiệm thu đã có quyết định/bằng chứng trong phạm vi Phase 0.
- [x] Rà files/test fixtures: chỉ source/config/docs/notice/verifier và regression transfer cần giữ. File tạm/tải dở tự dọn; staging, cache và checkpoint không commit. Môi trường/file local của người dùng ở working tree chính được bảo toàn.
- [x] Rà secrets/hash nhạy cảm trong diff/commit thuộc PR; SHA/revision/checksum và lockfile integrity có mục đích được giữ. Phạm vi không bao gồm audit toàn lịch sử/nhánh upstream.
- [x] Static review Git/Docker ignore, staging và workflow permissions; chưa có image/layer để scan, sẽ làm ở phase đóng gói. Không đưa dataset, token hoặc test suite vào runtime image.
- [x] PR #6 có bảng kết quả/giới hạn để review; không auto-merge.
- [ ] Người dùng merge PR #6; agent fetch xác nhận trên `origin/develop` trước Phase 1/2 phụ thuộc.
