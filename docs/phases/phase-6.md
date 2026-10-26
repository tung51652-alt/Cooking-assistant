# Phase 6 — Registry public và gói chạy độc lập

Ngày triển khai: 2026-10-26. Nhánh `codex/phase6-release-ci`, tiếp tục [PR #19](https://github.com/tung51652-alt/Cooking-assistant/pull/19) theo yêu cầu người dùng hoàn thiện rồi merge vào develop. Đã đồng bộ develop có Phase 5 và Expo #17. Trạng thái hiện tại: **đủ gate kỹ thuật Phase 6: build/push, pull ẩn danh trên runner sạch và gói prerelease đã được kiểm chứng; PR #19 được người dùng yêu cầu merge vào develop sau rà soát**.

## Phạm vi và phiên bản

Phase 6 phát hành ứng viên `v2.0.0-rc.2`, bốn image public `trantung2006/cooklens-vision`, `cooklens-recipes`, `cooklens-backend`, `cooklens-frontend` cùng tag `2.0.0-rc.2`; Qdrant giữ repository/version chính thức. Chỉ Linux amd64/CPU đã nằm trong phạm vi kiểm chứng. Model/corpus/embedding giữ version riêng.

Điều chỉnh thứ tự trong kế hoạch để giữ yêu cầu ban đầu: chỉ công bố ứng dụng `v2.0.0` khi Phase 7 hoàn tất. Phase 6 phải có registry/pull/gói chạy thật dưới tag ứng viên; Phase 7 dùng chính bộ đó để nghiệm thu, rồi promote bộ image đã đạt sang `2.0.0` mà không rebuild và kiểm tra lại bộ Compose cuối. Không gọi việc CI xanh hoặc có image là hoàn tất nghiệm thu chất lượng.

## Pipeline

1. PR và branch push chạy candidate CI, không dùng quyền push registry. Chỉ explicit Git tag `v2.0.0-rc.N` kích hoạt publish; từ chối final tag tại phase này. Không cần đưa workflow lên main để thử phát hành.
2. Kiểm tra source trước build: manifest/taxonomy/corpus, data/deploy tests, Java, shared client contracts, frontend build/static policy và Playwright.
3. Stage model qua downloader kiểm tra toàn vẹn trong bộ nhớ, tạo recipe vector bundle, build cả bốn image. Chạy lifecycle/offline và 100 warm samples/API bằng chính Compose trong gói ngoài source.
4. Chỉ sau khi candidate đạt mới đăng nhập Docker Hub bằng Actions secrets và push image. Kiểm tra namespace, visibility public và tag chưa tồn tại; từ chối ghi đè. Repository chưa có được Docker Hub tạo qua lần push đầu, sau đó kiểm tra public.
5. Runner Ubuntu khác, không có image ứng dụng, dùng Docker config rỗng để pull ẩn danh. Chạy lại chính Compose trong gói, fresh seed/persistence, version/index upgrade/rollback, từ chối bundle sai, dependency stop/recovery, offline và 100 mẫu warm/API. So sánh metadata model/taxonomy/corpus/embedding với manifest.
6. Chỉ report có đủ gate và registry pull thật mới được đóng gói: Compose pin tên/tag, candidate metadata, verification report, runbook tiếng Việt, notes và notices. GitHub prerelease cùng file tải chỉ được tạo sau gate runner sạch thành công.

`registry_release.py` không lưu/in credential, digest, request ID hoặc raw registry output. Scanner bổ sung nhận diện Docker Hub PAT; fixture kiểm tra dùng chuỗi sinh trong bộ nhớ. Gói không kèm source, test output, image archive hoặc model binary riêng; Docker pull image đã đóng gói đầy đủ artifact.

## Kiểm chứng

- Deploy unit tests bao gồm chặn tag/namespace sai, tag tồn tại/private repo, report local giả nhận registry, thiếu gate/version/P95 và archive không được ghi đè.
- 28 deploy tests và 7 data tests pass local; manifest/full coverage, Python syntax, workflow YAML, Compose release/dev và scanner source/commit đều pass.
- [Pipeline tag v2.0.0-rc.2](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/40299980821) đã pass đủ source-checks, release-settings, standalone-and-offline, clean-registry-pull và publish-prerelease. Có login/push thật, pull ẩn danh trên runner mới và tạo GitHub prerelease; không dùng report candidate cũ thay bằng chứng này.
- Đã tải gói từ [GitHub prerelease](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/v2.0.0-rc.2), đối chiếu với artifact đã kiểm chứng và rà toàn bộ text bên trong. [Report registry thật](evidence/phase-6-registry.json), [metadata bộ image/artifact](evidence/phase-6-release.json). Gói tải public không yêu cầu source hoặc model riêng.
- Source Compose mặc định pin namespace/tag public đã test. Dev overlay vẫn dùng tên/tag local, tránh build developer thay image registry trên máy theo mặc định.

| Số đo trên runner pull sạch | Kết quả |
| --- | --- |
| Platform | Linux x86_64, CPU; image Linux amd64 |
| Pull ẩn danh, năm image duy nhất | 53.258 giây |
| Startup, không gồm pull | 30.051 giây |
| Init | 0.833 giây |
| Warm samples/API | 100, concurrency 1 |
| P95 vision | 0.1016 giây; mục tiêu ≤10 giây |
| P95 search | 0.1013 giây; mục tiêu ≤3 giây |

Metadata model/taxonomy/corpus/embedding khớp manifest. Toàn bộ 30 món có recipe, lifecycle/offline, seed/version/rollback và dependency recovery đều pass. Peak RAM là cực đại theo service qua các instance, không phải peak đồng thời toàn stack.

## Rà soát cuối phase

- [x] Diff/file mới/commits, notices và gói tải đã rà; chỉ giữ regression tests/report có mục đích. Source/runtime không chứa build output hoặc archive thử.
- [x] Scanner tracked/new files, outgoing commits và toàn bộ text của gói tải pass; không ghi secret, SHA/hash/digest, request ID hoặc raw registry logs vào evidence.
- [x] Build rồi pull/test đúng bộ image public; gói Compose, metadata, runbook và notices khớp phiên bản ứng viên. Runtime không cần model/key trên host.
- [x] Người dùng trực tiếp yêu cầu agent hoàn thiện và merge PR #19 vào develop sau khi gates đạt. Phase 7 và công bố chính thức v2.0.0 còn mở.

## Giới hạn

Số đo trên fixture smoke không chứng minh CV accuracy, chất lượng công thức, cấu hình máy tối thiểu hoặc mọi điện thoại. Phase 7 còn tập ảnh/evaluation/review và kiểm thử bản cuối. User đã xác nhận upload ảnh Expo trên một điện thoại; nghiệm thu đầy đủ Android/iOS vẫn mở. Phạm vi image audit tập trung cấu hình/lịch sử do dự án quản lý và static artifact frontend, không tuyên bố audit mọi binary/layer upstream.

Runbook người nhận: [Docker Hub](../runbooks/registry.md). Snapshot trước triển khai: [preflight](phase-6-preflight.md), [candidate local](phase-6-candidate.md).
