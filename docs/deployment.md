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
(ví dụ `HOST_BIND=192.168.1.10 docker compose up -d`). `.env.example` ghi các biến tùy chọn.
PowerShell đặt biến bằng `$env:HOST_BIND = '192.168.1.10'` trước lệnh `up`.

## Theo dõi, dừng và chạy offline

```sh
docker compose logs --tail=80 recipe-init recipes vision backend frontend
docker compose down
docker compose up -d --pull never --wait --wait-timeout 240
```

Giữ cùng project `cooklens` để dùng lại volume. `down` giữ index; `down -v` xóa
volume và không dùng trong vận hành thường ngày. Không chạy nhiều init job đồng thời.
Sau khi pull đủ image, nhận diện/tra công thức không tải model hoặc cần Internet; mở link nguồn và chat LLM tùy chọn cần mạng.

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
Schema 3/egress Phase 10 đã qua smoke Linux Docker local với backend/frontend build từ source; không áp kết quả này cho image public cũ.

`docker compose down` giữ cả index và phiên; `down -v` xóa cả hai nên không dùng để rollback.
Khi backup, dừng backend và sao lưu toàn bộ volume `assistant-sessions` bằng công cụ quản trị volume, giữ bản riêng trước mỗi nâng schema.
Khôi phục bằng cách dừng backend, phục hồi nguyên volume cùng quyền UID/GID, rồi chạy đúng image/schema tương thích.
Không copy riêng file database khi backend đang ghi.
Source hiện dùng schema 3, migrate từ schema 1/2 trong một transaction.
Schema chưa hỗ trợ bị từ chối tại API phiên, không tự xóa/hạ schema hoặc làm hỏng readiness ảnh/công thức.
Khi rollback về image cũ chưa hỗ trợ phiên, giữ nguyên backup/volume để nâng lại; không tuyên bố image cũ có thể đọc phiên.

## LLM trong source Phase 10

Build image source theo [development.md](development.md); tag mặc định `2.0.0-rc.2` chưa chứa trợ lý và không được ghi đè/promote chỉ vì Compose đã đổi.
Compose forward `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TIMEOUT_SECONDS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_MAX_INPUT_TOKENS` chỉ vào backend.
Dùng biến môi trường runtime hoặc `.env` không track, theo `.env.example`; key mặc định trống và không đưa vào Dockerfile/build args/client.
Chỉ backend nối bridge `llm-egress`; frontend giữ bridge `browser`, còn vision/recipes/recipe-init/Qdrant chỉ nối `application` internal.
Không publish thêm cổng; egress bridge cho phép backend kết nối HTTPS, không phải firewall chỉ cho phép một domain.
Adapter/pricing hiện chọn trial NVIDIA đúng endpoint/model; không tự fallback và không bật endpoint trả phí chưa có policy giá đã xác minh.

Sau khi đổi biến môi trường, dùng `docker compose up -d --force-recreate backend` với cùng biến image/project đang chạy để tạo lại container có config mới.
`docker compose restart backend` giữ environment của container cũ, không đọc lại key/model mới từ `.env`.
Kiểm tra cấu hình bằng `docker compose config --quiet`; output config/inspect đầy đủ có thể chứa key runtime, không chia sẻ output đó.
Candidate packaging từ chối key đã expand và giữ các placeholder `LLM_*` để gói công khai không chứa credential.

Thiếu key, provider lỗi/429/timeout hoặc egress mất chỉ ảnh hưởng chat; ảnh/công thức, readiness và cooking actions không cần LLM.
Proxy assistant chờ tối đa 25 s, provider tối đa 20 s; các route ảnh/công thức giữ timeout proxy 20 s.
SQLite volume giữ cả conversation/operation, rate attempts và ledger chi phí qua restart; ledger không bị xóa khi purge phiên.
Schema 3 không downgrade tự động; backup nguyên volume khi backend đã dừng trước khi nâng hoặc rollback schema.

Kiểm chứng local Phase 10 đã qua Compose config, Java 21 process restart với upstream giả và ba smoke Linux container trên Docker Desktop.
Đã kiểm tra non-root/read-only, schema 3/volume/restart, mạng internal/egress và full offline flow.
Baseline Ultra không đạt latency; candidate Super đã qua 50/50 HTTP/state, latency và usage, còn chờ human review và PR/CI; không coi đây là nghiệm thu chat hoàn tất.
Tag local `phase10-local/cooklens-<service>:2.0.0-rc.16` đang chạy với selector Super qua NVIDIA và key chỉ backend; các tag cũ giữ baseline/thử model, không phải release mới.
Backend/frontend build source mới, AI giữ nội dung image public `2.0.0-rc.2`; không push/promote các tag này thành release.
