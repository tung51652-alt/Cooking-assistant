# Phase 5 — Compose độc lập và runtime offline

Đang thực hiện trên `feature/docker-release` từ `develop` sau khi PR Phase 4 #14 đã merge. Candidate kỹ thuật `2.0.0-rc.1`, chưa phát hành ứng dụng `v2.0.0`, chưa push Docker Hub và chưa chuyển sang Phase 6. Mobile Expo vẫn là mốc sau MVP web theo kế hoạch.

## Thay đổi

- `compose.release.yaml` độc lập, chỉ image có tag; không source/build/bind mount bắt buộc, chỉ frontend loopback 8080. Qdrant dùng volume riêng, các AI/backend chỉ network internal.
- `compose.dev.yaml` dùng build/Watch; cổng debug chỉ qua profile tường minh. Các Dockerfile AI pin Python patch; giữ user non-root, một worker/model và read-only/tmpfs.
- Init phụ thuộc Qdrant healthy, recipes phụ thuộc init exit 0, backend chờ hai AI ready, frontend chờ backend healthy. Service dài hạn có restart policy; init không restart vô hạn.
- Gate CI mới build candidate, chạy từ thư mục tạm ngoài repo, kiểm tra dữ liệu/version/persistence/failure/offline và xuất report số đo đã rà metadata.
- [Runbook](../runbooks/docker.md) ghi build, chạy, dev/debug, di chuyển image, volume, upgrade/rollback, offline và giới hạn.

## Bằng chứng

Local: 13 deploy tests pass; YAML release/dev parse được, scanner metadata và whitespace pass. Không có Docker CLI trên host Windows này; Docker build/runtime phải xác minh trên Ubuntu CI trước khi ghi hoàn tất.

Đang chờ gate `Docker standalone candidate / standalone-and-offline`. Chưa ghi nhận số đo hoặc đánh dấu kiểm thử runtime đã pass trước khi có kết quả thực.

## Giới hạn

Phase 5 dùng image build local có tag candidate. Fresh volume và Compose ngoài source không chứng minh pull từ registry trên máy sạch; push/pull Docker Hub và bộ release chính thức thuộc Phase 6. Không công bố cấu hình máy tối thiểu hoặc P95 chỉ từ mẫu CI. Quyền phân phối và giới hạn provenance model/corpus giữ nguyên trong manifest/notices.

Chỉ người dùng review/merge PR; agent không merge hoặc tự bắt đầu Phase 6.
