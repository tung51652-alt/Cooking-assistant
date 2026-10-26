# Docker — public registry và phát triển local

Bản ứng viên Phase 6 dùng image public `trantung2006/cooklens-*` tag `2.0.0-rc.2`, Linux amd64/CPU. Bản chính thức `v2.0.0` chờ Phase 7. Hướng dẫn người dùng tải gói và chạy không cần source tại [runbook registry](registry.md); số đo/bằng chứng tại [báo cáo Phase 6](../phases/phase-6.md).

## Người dùng chỉ chạy Docker

Tải và giải nén gói tại GitHub prerelease `v2.0.0-rc.2`, mở terminal trong thư mục có Compose và chạy:

```sh
docker compose -f compose.release.yaml up -d --pull always --wait --wait-timeout 240
```

Mở **http://localhost:8080/**. Không cần tự lấy trọng số, model embedding hoặc seed dữ liệu; image chứa artifact cần thiết, Qdrant dùng named volume. Chỉ frontend publish loopback; AI/backend/Qdrant ở mạng internal. Cần Internet cho bước pull; public image không cần đăng nhập. Runtime không cần Python/Java/Node hoặc API key LLM trên host.

Source `deploy/compose/compose.release.yaml` cũng mặc định dùng namespace/tag public này. Gói phát hành resolve tên/tag cố định từ cấu hình đã test; không yêu cầu sửa `.env`. Không dùng tag `latest`, không ghi digest/hash vào Compose.

## Developer build từ source

Cần Docker Engine/Desktop với Linux containers, Compose 2.24.4 trở lên và Internet khi build. Chuẩn bị checkpoint/embedding/vector bundle theo [README](../../README.md). Python phục vụ chuẩn bị artifact; Node/JDK/Maven nằm trong build stage. Không thay môi trường train đang có.

`compose.dev.yaml` override image sang tên local `cooklens-*` tag `2.0.0-rc.1` và thêm build/Watch; không ghi đè tag registry trên máy khi build developer theo mặc định. Dùng cùng hai file cho cả build lẫn up:

```sh
docker compose -f deploy/compose/compose.release.yaml -f deploy/compose/compose.dev.yaml build
docker pull qdrant/qdrant:v1.19.2
docker compose -f deploy/compose/compose.release.yaml -f deploy/compose/compose.dev.yaml up -d --wait --wait-timeout 240
```

Dev overlay có Watch để rebuild khi source thay đổi; chạy `up --watch` khi cần. Thay model/corpus phải tạo bundle và chạy đúng một init job; Watch không tự tạo vector hay thay index. Nếu tự đặt `COOKLENS_IMAGE_PREFIX`/`COOKLENS_IMAGE_TAG`, giữ cùng bộ tên/tag ở tất cả lệnh.

Debug dùng `--profile debug` cùng hai file rồi `up -d debug`. Profile chỉ mở loopback gateway 8081, vision 8000, recipes 8001, Qdrant 6333 qua proxy; release không có debug/source bind mount. Dừng debug bằng cùng cấu hình và `stop debug`.

Để chuyển candidate local giữa máy developer khi không dùng registry, xem [gói candidate lịch sử](candidate.md). Gói đó không chứa image archive và không thay bộ registry đã kiểm chứng.

## Vận hành, upgrade và rollback

Dùng gói Compose cùng project `cooklens`, không chạy nhiều init job đồng thời:

```sh
docker compose -f compose.release.yaml ps -a
docker compose -f compose.release.yaml logs --tail=80 recipe-init recipes vision backend frontend
docker compose -f compose.release.yaml down
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
```

`recipe-init` Exited (0) là bình thường; service dài hạn cần healthy. `down` giữ named volume. `down -v` xóa index và lần sau phải seed lại, không dùng trong vận hành thường ngày. Cùng project name mới dùng lại volume. Đổi cổng bằng `HOST_PORT`; không mở tất cả interface mặc định.

Nâng phiên bản: giữ gói/image cũ, pull bộ mới, dừng recipes/backend khi Qdrant vẫn healthy, chạy đúng một init job từ image recipes mới rồi `up` toàn stack. Nếu init lỗi, dừng nâng cấp và kiểm tra bundle/version; không sửa dữ liệu dưới version cũ hoặc xóa volume để né lỗi. Rollback bằng gói/image cũ, cùng project/volume, chạy lại init cũ rồi recreate service. Collection cũ được giữ để rollback; xem lệnh đầy đủ trong [runbook registry](registry.md).

## Offline và Expo

Sau khi pull đủ image/index, dùng `--pull never` để chạy không cần Internet. Model/tokenizer/corpus/vectors/font/icon ở trong image. CI tháo bridge frontend, xác nhận chỉ còn mạng internal rồi thử luồng ảnh → Nginx → gateway → CV/recipes → chi tiết. Link nguồn công thức ngoài hệ thống vẫn cần Internet khi mở.

Expo là client dùng chung API/server, không có model trên điện thoại và không build APK. Compose release mặc định loopback; LAN/HTTPS phải cấu hình tường minh, chỉ mở gateway. Metro/QR kết nối được chưa chứng minh API truy cập được. Người dùng đã xác nhận upload ảnh hoạt động qua Expo; nghiệm thu đầy đủ Android/iOS còn mở, xem [mobile README](../../mobile/README.md).

## Kiểm chứng

Workflow PR/branch chạy candidate local sau source checks. Chỉ tag `v2.0.0-rc.N` cho push registry; credentials từ Actions secrets, không dùng build ARG hoặc ghi token vào image. Runner sạch pull ẩn danh và kiểm tra chính Compose trong gói; chỉ đủ gate mới tạo archive/prerelease.

Harness tạo project/volume riêng và chỉ thu dọn project test đó: kiểm tra 30 món, chọn dự đoán thứ hai, search/detail, seed lặp lại, nâng corpus/rollback, bundle sai, giữ volume qua down/up, dừng/phục hồi dependency và offline. Với ít nhất 100 mẫu warm/API, P95 theo nearest rank phải đạt vision ≤10 giây/search ≤3 giây. Fixture smoke không phải tập accuracy; số đo CI không chứng minh cấu hình máy tối thiểu.

Báo cáo không lưu raw Docker inspect/history/log, request ID hoặc mã/hash. Image audit tập trung phần do dự án quản lý và artifact frontend, không tuyên bố audit toàn bộ binary/layer upstream. [Phase 5](../phases/phase-5.md) giữ report lịch sử candidate local; [Phase 6](../phases/phase-6.md) ghi riêng bằng chứng registry thật.
