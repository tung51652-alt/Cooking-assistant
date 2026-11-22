# Triển khai và vận hành CookLens

## Yêu cầu và gói chạy

Cần Docker Engine/Desktop chạy Linux containers, Compose ≥2.24.4.
Bộ image đã kiểm chứng trên Linux amd64/CPU; ARM chưa được kiểm chứng.
Chạy từ thư mục gốc có `compose.yaml`. Một project `cooklens` gồm frontend,
backend, vision, recipes, Qdrant và job khởi tạo dữ liệu. Không cần `.env` để chạy mặc định.
Image ứng dụng public đã chứa model/corpus/vector; không cần cài toolchain hoặc key LLM trên host.
Các version mặc định được pin trong Compose.

## Khởi động

```sh
docker compose up
docker compose ps -a
```

Mở **http://localhost:8080/**; readiness tại **http://localhost:8080/api/health**.
`recipe-init` kết thúc 0 là bình thường; service dài hạn cần healthy.
Compose khởi động theo readiness của dependency; lần đầu cần chờ tải image và seed index.

Chạy nền bằng `docker compose up -d`. Nếu cổng bận, đặt `HOST_PORT=8090`.
Mặc định chỉ frontend publish trên loopback; AI/backend/Qdrant không mở cổng host.
Để dùng Expo Go trong mạng riêng, đặt `HOST_BIND` thành IP LAN của máy Docker
(ví dụ `HOST_BIND=192.168.1.10 docker compose up -d`). `.env.example` ghi hai biến tùy chọn.
PowerShell đặt biến bằng `$env:HOST_BIND = '192.168.1.10'` trước lệnh `up`.

## Theo dõi, dừng và chạy offline

```sh
docker compose logs --tail=80 recipe-init recipes vision backend frontend
docker compose down
docker compose up -d --pull never --wait --wait-timeout 240
```

Giữ cùng project `cooklens` để dùng lại volume. `down` giữ index; `down -v` xóa
volume và không dùng trong vận hành thường ngày. Không chạy nhiều init job đồng thời.
Sau khi pull đủ image, runtime không tải model hoặc gọi Internet; mở link nguồn bên ngoài vẫn cần mạng.

## Nâng cấp và rollback

Giữ gói/image cũ trước khi nâng. Dùng cùng project/volume, giữ Qdrant healthy và chạy một init job:

```sh
docker compose pull
docker compose stop recipes backend
docker compose run --rm --no-deps recipe-init
docker compose up -d --pull never --wait --wait-timeout 240
```

Nếu init lỗi, dừng nâng cấp và kiểm tra version/bundle; không xóa volume hoặc sửa
nội dung dưới version cũ. Rollback bằng gói/image cũ, cùng project/volume, chạy lại
init cũ rồi `up`. Collection cũ được giữ để phục hồi index tương thích.

## Xử lý sự cố

| Hiện tượng | Kiểm tra |
| --- | --- |
| Pull thất bại | Kết nối, quota Docker Hub và tag; không tự đổi sang `latest` |
| Running nhưng chưa dùng được | `/api/health`, trạng thái dependency và log init |
| Init lỗi hoặc version không khớp | Version image, bundle/index và log `recipe-init` |
| Thiếu RAM/disk | Docker settings; số đo ở `docs/acceptance.md` trong source hoặc `verification.json` trong gói chạy |
| Điện thoại không truy cập được | Địa chỉ LAN/HTTPS, firewall; Metro/QR là kết nối riêng |

Giữ notices khi phân phối. Không đưa ảnh gốc, credential hoặc log chưa rà soát lên issue.

Gói `2.0.0-rc.2` đã phát hành trước đợt tổ chức này còn dùng tên file
`compose.release.yaml`; chạy bằng `docker compose -f compose.release.yaml up` trong gói cũ.

## SQLite phiên nấu trong source mới

Image `2.0.0-rc.2` chưa chứa API phiên; cần build backend từ source theo [development.md](development.md) để thử phần này.
Compose vẫn một project `cooklens`, thêm volume `assistant-sessions` tại `/app/data` của backend.
Dockerfile tạo thư mục với UID/GID 10001 và quyền 0700; root filesystem giữ read-only.
`ASSISTANT_DB_PATH=/app/data/assistant.sqlite` do Compose cấp, không publish thêm cổng.
Native SQLite library nằm ở `/app/sqlite`, load bằng `org.sqlite.lib.path`, không giải nén thư viện vào `/tmp` noexec.
Các điều kiện Linux/non-root/volume này chưa được chạy Docker trong lần triển khai local Phase 8–9 vì máy thiếu Docker.

`docker compose down` giữ cả index và phiên; `down -v` xóa cả hai nên không dùng để rollback.
Khi backup, dừng backend và sao lưu toàn bộ volume `assistant-sessions` bằng công cụ quản trị volume, giữ bản riêng trước mỗi nâng schema.
Khôi phục bằng cách dừng backend, phục hồi nguyên volume cùng quyền UID/GID, rồi chạy đúng image/schema tương thích.
Không copy riêng file database khi backend đang ghi.
Schema hiện tại là 1; schema khác bị từ chối tại API phiên, không tự xóa/hạ schema hoặc làm hỏng readiness ảnh/công thức.
Khi rollback về image cũ chưa hỗ trợ phiên, giữ nguyên backup/volume để nâng lại; không tuyên bố image cũ có thể đọc phiên.
