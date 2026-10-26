# Phase 6 — Registry public và gói chạy độc lập

Ngày triển khai: 2026-10-26. Nhánh `codex/phase6-release-ci`, tiếp tục [PR #19](https://github.com/tung51652-alt/Cooking-assistant/pull/19) theo yêu cầu người dùng hoàn thiện rồi merge vào develop. Đã đồng bộ develop có Phase 5 và Expo #17. Trạng thái hiện tại: **đã triển khai pipeline, đang kiểm tra trước publish; chưa đánh dấu hoàn tất Phase 6**.

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
- Source scanner, file mới, Python syntax và whitespace được kiểm tra trước push.
- Bằng chứng build/push, pull trên runner sạch và download prerelease chỉ được ghi sau khi chạy thật; chưa dùng report candidate cũ thay thế.

## Giới hạn

Số đo trên fixture smoke không chứng minh CV accuracy, chất lượng công thức, cấu hình máy tối thiểu hoặc mọi điện thoại. Phase 7 còn tập ảnh/evaluation/review và kiểm thử bản cuối. User đã xác nhận upload ảnh Expo trên một điện thoại; nghiệm thu đầy đủ Android/iOS vẫn mở. Phạm vi image audit tập trung cấu hình/lịch sử do dự án quản lý và static artifact frontend, không tuyên bố audit mọi binary/layer upstream.

Runbook người nhận: [Docker Hub](../runbooks/registry.md). Snapshot trước triển khai: [preflight](phase-6-preflight.md), [candidate local](phase-6-candidate.md).
