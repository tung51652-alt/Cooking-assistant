# CookLens — gói candidate chưa phát hành registry

Gói này dành cho máy có Docker Engine/Desktop chạy Linux containers và Docker Compose 2.24.4 trở lên. Máy người đang phát triển hoặc review PR không cần cài Docker nếu chỉ chạy CI. GitHub Actions chạy stack tạm để kiểm thử, không cung cấp server thường trực cho Expo.

## Nội dung và trạng thái

- `compose.release.yaml`: cấu hình đã chốt tên/tag image, chỉ gateway loopback 8080; không mount source hoặc model từ host.
- `candidate.json`: version ứng dụng candidate, API/model/taxonomy/corpus/embedding và tên image.
- `RELEASE_NOTES.md`, `notices/`: phạm vi candidate và thông tin nguồn/giấy phép liên quan.
- `verification.json`: CI chỉ thêm sau khi kiểm tra lifecycle, offline và latency thành công; xem cấu hình máy, số mẫu và giới hạn trong report.

**Gói không chứa image hoặc model binary.** Docker Hub và pull registry được hoãn. Chưa phải application release `v2.0.0`, chưa nghiệm thu Expo trên điện thoại thật. Không chạy `pull` như thể các image local đã được công bố.

## Chuẩn bị image

Trên máy có source và Docker, chuẩn bị model/vector theo README repository, rồi build bằng release/dev Compose. Tên/tag phải trùng `candidate.json`. Có thể chuyển image từ máy build sang máy Docker khác bằng `docker save`/`docker load`; lấy đủ sáu service trong metadata, trong đó recipes và recipe-init dùng chung image nên chỉ cần năm image duy nhất. Giữ cùng bộ version, không ghi đè image dưới tag đã phát hành.

Archive image cần được chuyển riêng; artifact CI của gói cấu hình không tự chứa archive đó. Khi có Docker Hub, bộ release sau sẽ thêm tên registry và bằng chứng pull; không dùng kết quả candidate thay nghiệm thu đó.

## Khởi động từ thư mục gói đã giải nén

Sau khi đủ image trên máy:

```sh
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
docker compose -f compose.release.yaml ps -a
```

Mở `http://127.0.0.1:8080/`; health tại `http://127.0.0.1:8080/api/health`. Job recipe-init kết thúc 0 là đúng, các service dài hạn phải healthy. Lần đầu Qdrant tự seed từ bundle trong image; không cần tải checkpoint hoặc cài Python/Java/Node trên host runtime. Link nguồn công thức cần Internet khi mở.

Nếu cổng 8080 bận, đặt `HOST_PORT` trước khi chạy. PowerShell:

```powershell
$env:HOST_PORT = '8090'
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
```

Khi đó mở `http://127.0.0.1:8090/`. Không mở thêm cổng AI hoặc Qdrant để thử Expo. Gateway loopback không truy cập được từ điện thoại; mobile cần cấu hình LAN/HTTPS riêng và vẫn đang chờ kiểm chứng thiết bị.

## Logs, dừng và khởi động lại

```sh
docker compose -f compose.release.yaml logs --tail=80 recipe-init recipes vision backend frontend
docker compose -f compose.release.yaml down
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
```

Giữ cùng thư mục/project name để dùng lại volume. `down` giữ dữ liệu index; `down -v` xóa volume và lần sau phải seed lại, không dùng trong vận hành thường ngày. Không chạy nhiều init job đồng thời. Health 503 có thể do model/index chưa ready hoặc version sai; kiểm tra dependency và logs trước khi thử lại, không xóa volume để né lỗi.

## Nâng cấp và rollback

Giữ gói cấu hình cùng bộ image cũ trước khi nâng. Chỉ dùng bộ image/model/corpus/embedding tương thích. Dừng recipes/backend, với Qdrant đang healthy chạy đúng một init job từ image recipes của bộ mới, rồi recreate recipes/backend:

```sh
docker compose -f compose.release.yaml stop recipes backend
docker compose -f compose.release.yaml run --rm --no-deps recipe-init
docker compose -f compose.release.yaml up -d --pull never --force-recreate recipes backend
```

Nếu init lỗi, dừng nâng cấp và kiểm tra bundle/version; không sửa dữ liệu dưới version cũ. Rollback bằng gói cấu hình và image cũ, giữ project/volume, chạy lại init cũ rồi recreate các service. Collection cũ được giữ để rollback; không tự xóa collection đang phục vụ. CI thử thay corpus version trong volume test riêng; đó chưa phải bằng chứng upgrade giữa hai bản ứng dụng đã phát hành.
