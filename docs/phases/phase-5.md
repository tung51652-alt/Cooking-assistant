# Phase 5 — Compose độc lập và runtime offline

Đang thực hiện trên `feature/docker-release` từ `develop` sau khi PR Phase 4 #14 đã merge. Candidate kỹ thuật `2.0.0-rc.1`, chưa phát hành ứng dụng `v2.0.0`, chưa push Docker Hub và chưa chuyển sang Phase 6. Mobile Expo vẫn là mốc sau MVP web theo kế hoạch.

## Thay đổi

- `compose.release.yaml` độc lập, chỉ image có tag; không source/build/bind mount bắt buộc, chỉ frontend loopback 8080. Qdrant dùng volume riêng, các AI/backend chỉ network internal.
- `compose.dev.yaml` dùng build/Watch; cổng debug chỉ qua profile tường minh. Các Dockerfile AI pin Python patch; giữ user non-root, một worker/model và read-only/tmpfs.
- Init phụ thuộc Qdrant healthy, recipes phụ thuộc init exit 0, backend chờ hai AI ready, frontend chờ backend healthy. Service dài hạn có restart policy; init không restart vô hạn.
- Gate CI mới build candidate, chạy từ thư mục tạm ngoài repo, kiểm tra dữ liệu/version/persistence/failure/offline và xuất report số đo đã rà metadata.
- [Runbook](../runbooks/docker.md) ghi build, chạy, dev/debug, di chuyển image, volume, upgrade/rollback, offline và giới hạn.

## Bằng chứng

Local: deploy tests, YAML release/dev, scanner metadata và whitespace được kiểm tra trước commit. Không có Docker CLI trên host Windows này; Docker build/runtime xác minh trên Ubuntu CI.

CI đã build đủ image candidate, kiểm tra cấu hình release/dev, kiểm tra Nginx debug trên read-only/tmpfs và khởi động stack tới trạng thái healthy. Gate tiếp theo phát hiện phần rà history frontend quét cả layer upstream Nginx vì stage runtime không có WORKDIR. Đã sửa bằng cách xác minh và tách đúng suffix history của base image; test hồi quy vẫn chặn literal trong layer dự án và từ chối base history không khớp. Không nới scanner metadata chung.

Gate `Docker standalone candidate / standalone-and-offline` đã pass cả push và pull_request. [CI thành công](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/39234455124), [report đã rà metadata](evidence/phase-5-docker.json). Đã kiểm chứng 30 món, 10 luồng CV/chọn dự đoán thứ hai/search/detail, seed mới/lặp lại, upgrade/rollback, bundle sai bị từ chối, giữ volume qua down/up, dừng/phục hồi ba dependency và luồng offline qua Nginx. Scanner/history/artifact frontend đều pass.

Test nâng version đã sửa quyền file trong bản sao bundle tạm: image đóng gói JSON read-only, `copytree` giữ mode đó; chỉ chmod bản sao trong `/tmp`, không thay bundle gốc trong image.

Máy CI Linux/x86_64, 4 logical CPU, khoảng 15,6 GiB RAM, Compose 2.38.2. Cold-start không gồm build/pull: 30,018 giây; init 0,857 giây. Mười mẫu tuần tự: vision median/max 0,089/0,183 giây; search 0,075/0,584 giây. Đây không phải P95 hoặc cấu hình tối thiểu.

| Service | Image MiB | Peak RAM MiB |
| --- | ---: | ---: |
| Qdrant | 190,9 | 95,2 |
| Vision | 1096,5 | 338,7 |
| Recipes | 1652,3 | 611,2 |
| Backend | 300,9 | 217,8 |
| Frontend | 65,6 | 10,2 |

Peak là giá trị lớn nhất theo service giữa các instance lấy mẫu, không phải peak đồng thời toàn stack; image size gồm layer dùng chung, không cộng để suy ra disk thực. Image config/history chỉ rà phần nhóm quản lý và artifact frontend; chưa audit mọi binary/layer bên thứ ba.

## Giới hạn

Phase 5 dùng image build local có tag candidate. Fresh volume và Compose ngoài source không chứng minh pull từ registry trên máy sạch; push/pull Docker Hub và bộ release chính thức thuộc Phase 6. Không công bố cấu hình máy tối thiểu hoặc P95 chỉ từ mẫu CI. Quyền phân phối và giới hạn provenance model/corpus giữ nguyên trong manifest/notices.

Chỉ người dùng review/merge PR; agent không merge hoặc tự bắt đầu Phase 6.
