# Docker — candidate Phase 5

Bản kiểm tra tích hợp: `2.0.0-rc.1`, Linux/amd64, CPU. Chưa phát hành ứng dụng `v2.0.0`, chưa công bố image candidate trên Docker Hub. Không chạy `pull` với tên image dưới đây như thể chúng đã được phát hành. Phase 6 sẽ kiểm chứng push/pull và bộ phát hành trên máy sạch; hiện developer build image hoặc chuyển image bằng `docker save`/`docker load`.

Theo yêu cầu ngày 2026-10-26, Docker Hub được hoãn; CI tiếp tục build/test candidate và đóng gói cấu hình, notices, version metadata cùng báo cáo. Xem [runbook gói candidate](candidate.md). Gói artifact CI không chứa image và không cung cấp server thường trực cho Expo; Phase 6–7 chưa được đánh dấu hoàn tất từ kết quả candidate.

## Chuẩn bị cho developer

Cần Docker Engine/Desktop chạy Linux containers, Compose 2.24.4 trở lên và Internet khi build. Chuẩn bị checkpoint/embedding/bundle theo [README gốc](../../README.md), không đổi môi trường train đang có. Python chỉ phục vụ chuẩn bị artifact, Node/JDK/Maven nằm trong build stage.

Từ root source, build candidate:

```sh
docker compose -f deploy/compose/compose.release.yaml \
  -f deploy/compose/compose.dev.yaml build
docker pull qdrant/qdrant:v1.19.2
```

Dev overlay thêm `build` và Compose Watch; `up --watch` rebuild image khi source thay đổi. Frontend có thể dùng Vite riêng theo [hướng dẫn frontend](../../frontend/README.md) để cập nhật giao diện nhanh. Thay corpus/model phải tạo lại bundle trước build, rồi chạy một init job với các dependency đang hoạt động; không trông chờ Watch tự tạo vector hoặc đổi index đang dùng.

Chỉ khi cần debug, thêm `--profile debug` và `up -d debug` sau hai tùy chọn `-f`. Profile này mở loopback gateway ở 8081, vision ở 8000, recipes ở 8001, Qdrant ở 6333 qua proxy riêng. Release không có profile này, không mount config/source và không mở cổng nội bộ. Dừng debug bằng cùng cấu hình và `stop debug`.

## Chạy ngoài source

Sau khi image đã có trên máy, chép duy nhất `deploy/compose/compose.release.yaml` sang một thư mục trống, chạy tại thư mục đó:

```sh
docker compose -f compose.release.yaml up -d --wait --wait-timeout 240
```

Mở **http://127.0.0.1:8080/**; kiểm tra **http://127.0.0.1:8080/api/health**. Không cần repo, model riêng, Python/Node/JDK hoặc API key trên host runtime. `recipe-init` kết thúc với exit code 0 là đúng; năm service còn lại cần healthy. Không chạy nhiều init job đồng thời.

Mặc định tag `2.0.0-rc.1` dùng tên local `cooklens-vision`, `cooklens-recipes`, `cooklens-backend`, `cooklens-frontend`. Các biến tùy chọn `HOST_PORT`, `COOKLENS_IMAGE_PREFIX`, `COOKLENS_IMAGE_TAG` có giá trị mặc định; không bắt buộc `.env`. Khi Phase 6 công bố image, bộ release phải pin đúng tên/tag được nghiệm thu. Không tự chọn `latest` hoặc ghi digest/hash vào cấu hình.

Để chuyển image sang máy Docker khác mà chưa dùng registry, trên máy build:

```sh
docker save -o cooklens-candidate-images.tar \
  cooklens-vision:2.0.0-rc.1 cooklens-recipes:2.0.0-rc.1 \
  cooklens-backend:2.0.0-rc.1 cooklens-frontend:2.0.0-rc.1 \
  qdrant/qdrant:v1.19.2
```

Chuyển archive cùng Compose sang máy đích, `docker load -i cooklens-candidate-images.tar`, rồi chạy lệnh `up` trên. Archive là output tạm ngoài Git, không phải bản phát hành chính thức. Quy trình save/load chưa thay bằng chứng pull registry trên máy sạch của Phase 6.

## Vòng đời và xử lý lỗi

```sh
docker compose -f compose.release.yaml ps -a
docker compose -f compose.release.yaml logs --tail=80 recipe-init recipes vision backend frontend
docker compose -f compose.release.yaml down
docker compose -f compose.release.yaml up -d --wait --wait-timeout 240
```

`down` giữ named volume `recipe-index`; cùng project name mới dùng lại volume cũ. Không thêm `--volumes` trong vận hành thường ngày. `restart: unless-stopped` phục hồi các service dài hạn khi Docker chạy lại; init là job một lần, không restart vô hạn. Đổi cổng bằng `HOST_PORT`, không mở bind toàn mạng mặc định.

| Hiện tượng | Cách xử lý |
| --- | --- |
| Image chưa có | Build hoặc load đủ candidate; chưa có public pull để thay bước này |
| Cổng 8080 đã dùng | Đặt `HOST_PORT` sang cổng trống trước `up`; mở URL theo cổng mới |
| Init thất bại | Kiểm tra bundle/index version; sửa đầu vào hoặc tạo version mới, không xóa volume để thử |
| Health 503 | Chờ load model, kiểm tra dependency và giới hạn RAM; container running chưa bảo đảm sẵn sàng |
| Chạy lại báo version index không khớp | Không sửa bytes dưới version cũ; build bundle mới và chạy đúng một init job |

Nâng corpus: stage bundle có version mới, build image recipes candidate tương ứng, dừng recipes và backend, chạy `docker compose -f compose.release.yaml run --rm --no-deps recipe-init` với Qdrant đang healthy, rồi `up -d --force-recreate recipes backend`. Init kiểm tra collection trước khi chuyển alias nguyên tử; không ghi đè collection version đang có. Model/manifest gateway phải tương thích với bộ artifact mới; không nâng riêng corpus nếu gateway còn yêu cầu version cũ. Không dùng quy trình này để tự thay model/version trong bản đã phát hành.

Rollback dùng bộ image và manifest tương thích cũ, chạy lại init từ image recipes cũ rồi recreate recipes/backend. Collection cũ được giữ; nếu version cũ hỏng, dừng để điều tra thay vì tự ghi đè. Các collection không active được giữ cho rollback, không tự xóa.

## Offline và mobile

Vision, recipes, init, backend và Qdrant chỉ trên network internal. Frontend có bridge để Docker publish loopback; bridge này không phải firewall chặn Internet. CI tháo bridge của frontend, xác nhận mọi service chỉ còn mạng internal và chạy luồng ảnh → Nginx → gateway → CV/recipes → chi tiết. Font/icon ở image frontend, model/tokenizer/corpus/vector ở image AI; không cần tải lúc startup. Người dùng cần mạng nếu mở nguồn công thức bên ngoài.

Mobile dùng **Expo**, cùng API/server, được triển khai riêng ở [PR #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17) theo yêu cầu cùng đợt Phase 5. Compose release vẫn không mở cổng LAN mặc định; PR mobile có cấu hình LAN dev tường minh và hướng dẫn Expo Go. Điện thoại vẫn cần kết nối server, dù server chạy không cần Internet. Xem [kế hoạch Expo](../plans/top3-recipes-docker-mvp.md).

## Kiểm chứng và tài nguyên

Chạy từ root source có Docker và image candidate:

```sh
python deploy/scripts/smoke_release_stack.py --report /tmp/cooklens-phase5.json
```

Để kiểm tra chính Compose đã đóng gói và đo ít nhất 100 mẫu warm cho mỗi API, truyền `--compose` trỏ file trong gói và `--samples 100`. Report lấy version từ image trong Compose; chỉ ghi P95 khi có đủ 100 mẫu và kiểm tra mục tiêu vision ≤10 giây/search ≤3 giây. Đây là latency với fixture smoke, chưa phải đánh giá accuracy hoặc nghiệm thu release registry.

Script tự tạo project/volume riêng, chép Compose ngoài source, xác minh đầy đủ 30 món, chọn dự đoán thứ hai, lấy recipe/detail, seed mới/lặp lại, nâng version/rollback, từ chối bundle sai, giữ volume qua `down/up`, dừng/phục hồi từng dependency và luồng offline. Chỉ project test do script tạo được thu dọn cả volume. CI xuất report đã rà metadata; không lưu raw inspect/history/log, mã truy cập hoặc giá trị hash vào báo cáo.

Report ghi cold-start không gồm build/pull, thời gian init, kích thước từng image, peak RAM theo service và 10 mẫu tuần tự vision/search. Đã chạy trên Linux/x86_64, 4 logical CPU, khoảng 15,6 GiB RAM, Compose 2.38.2: startup 30,018 giây, init 0,857 giây. Peak lấy lớn nhất giữa các container instance được lấy mẫu, không cộng thành peak đồng thời toàn stack. Không coi 10 mẫu là P95 nghiệm thu hoặc benchmark accuracy. Đây là cấu hình đã kiểm chứng, chưa phải khẳng định cấu hình thấp nhất; [báo cáo Phase 5](../phases/phase-5.md) nêu đầy đủ kết quả và giới hạn.

Thứ tự boot dùng healthcheck và `service_completed_successfully` theo [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/). Các điều kiện đó chỉ quản lý startup; service vẫn phải xử lý timeout/reconnect khi dependency hỏng sau đó.
