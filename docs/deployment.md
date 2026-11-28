# Triển khai và vận hành CookLens

## Yêu cầu

Cần Docker Engine/Desktop chạy Linux containers, Compose ≥2.24.4.
Bộ image đã kiểm chứng trên Linux amd64/CPU; ARM chưa được kiểm chứng.
Một project `cooklens` gồm frontend, backend, vision, recipes, Qdrant và job khởi tạo dữ liệu.
Image public đã chứa model/corpus/vector; không cần cài toolchain trên host.
Các version mặc định được pin trong Compose.

## Khởi động

Chạy từ thư mục có `compose.yaml`:

```sh
docker compose up -d --wait
docker compose ps -a
```

Mở **http://localhost:8080/**; readiness tại **http://localhost:8080/api/health**.
`recipe-init` kết thúc 0 là bình thường; các service dài hạn cần healthy.
Lần đầu cần chờ tải image và seed index.

Nếu cổng bận, đặt `HOST_PORT=8090`.
Để dùng Expo Go trong mạng riêng, đặt `HOST_BIND` thành IP LAN của máy Docker
(ví dụ `HOST_BIND=192.168.1.10 docker compose up -d`; PowerShell: `$env:HOST_BIND = '192.168.1.10'`).
Kiểm tra `/api/health` từ trình duyệt điện thoại rồi mở Expo Go theo [hướng dẫn mobile](../mobile/README.md).
Các biến tùy chọn ghi trong `.env.example`.

## Cấu hình trợ lý

Sao chép `.env.example` thành `.env` (không track) và điền Google AI Studio key vào `LLM_API_KEY`.
Mặc định: `LLM_PROVIDER=openai`, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `LLM_MODEL=gemini-3.5-flash-lite`, `LLM_TIMEOUT_SECONDS=8`.
Compose chỉ forward bảy biến `LLM_*` vào backend; key không vào Dockerfile, build args, client hoặc log.
Bảng biến, giới hạn và policy giá ở [backend README](../backend/README.md).

Sau khi đổi `.env`, chạy `docker compose up -d --force-recreate backend`;
`docker compose restart backend` giữ environment cũ.
Output `docker compose config` hoặc `inspect` có thể chứa key, không chia sẻ.
Thiếu key, provider lỗi/429/timeout hoặc mất mạng chỉ ảnh hưởng chat; ảnh, công thức, readiness và nút bước nấu vẫn hoạt động.

## Theo dõi, dừng và chạy offline

```sh
docker compose logs --tail=80 recipe-init recipes vision backend frontend
docker compose down
docker compose up -d --pull never --wait --wait-timeout 240
```

`down` giữ volume index và phiên; `down -v` xóa cả hai, không dùng trong vận hành hay rollback.
Sau khi pull đủ image, nhận diện/tra công thức không cần Internet; mở link nguồn và chat cần mạng.

## Dữ liệu phiên và backup

Volume `assistant-sessions` gắn tại `/app/data` của backend (UID/GID 10001, quyền 0700, rootfs read-only).
SQLite lưu phiên, hội thoại, operation, rate limit và ledger chi phí qua restart.
Schema hiện tại là 3, tự migrate từ 1/2 trong một transaction và không tự hạ schema.

- Backup: dừng backend, sao lưu nguyên volume, giữ một bản trước mỗi lần nâng schema.
  Không copy riêng file database khi backend đang ghi.
- Khôi phục: dừng backend, phục hồi nguyên volume cùng quyền UID/GID, chạy image hỗ trợ schema đó.
  Thử trên volume riêng trước và xác nhận GET phiên trả đủ công thức, bước, hội thoại và version.

## Nâng cấp và rollback

Giữ gói/image cũ và backup phiên trước khi nâng. Dùng cùng project/volume và chạy một init job:

```sh
docker compose pull
docker compose stop recipes backend
docker compose run --rm --no-deps recipe-init
docker compose up -d --pull never --wait --wait-timeout 240
```

Nếu init lỗi, dừng nâng cấp và kiểm tra version/bundle; không xóa volume.
Rollback bằng gói/image cũ trên cùng project/volume, chạy lại init cũ rồi `up`; collection cũ được giữ để phục hồi.
Nếu image cũ chỉ hỗ trợ schema cũ hơn, dùng backup phiên tương ứng và giữ volume schema mới riêng.

## Xử lý sự cố

| Hiện tượng | Kiểm tra |
| --- | --- |
| Pull thất bại | Kết nối, quota Docker Hub và tag; không tự đổi sang `latest` |
| Running nhưng chưa dùng được | `/api/health`, trạng thái dependency và log init |
| Init lỗi hoặc version không khớp | Version image, bundle/index và log `recipe-init` |
| Trợ lý báo chưa cấu hình | `LLM_API_KEY` trong `.env`, đã recreate backend chưa |
| Thiếu RAM/disk | Docker settings; số đo ở [acceptance.md](acceptance.md) hoặc `verification.json` trong gói |
| Điện thoại không truy cập được | Địa chỉ LAN/HTTPS, firewall; Metro/QR là kết nối riêng |

Giữ notices khi phân phối. Không đưa ảnh gốc, credential hoặc log chưa rà soát lên issue.

## Phát hành

Phát hành gồm hai workflow; mỗi bước đều không rebuild image đã nghiệm thu.

1. **Docker candidate and registry release** (`.github/workflows/docker-release.yml`) chạy khi push tag `vX.Y.Z-rc.N`:
   source/Expo checks, smoke Compose, push image, pull ẩn danh trên runner sạch, đánh giá CV và retrieval.
   Run thành công lưu artifact `cooklens-phase13-candidate` (`bundle/`, `identity.json`, `vision.json`, `flow.json`).
2. **Promote accepted MVP release** (`.github/workflows/final-release.yml`) chỉ chạy từ `main`.
   Luồng kiểm tra gói prerelease khớp artifact, gate nghiệm thu và source, từ chối tag final đã tồn tại.
   Bốn image được promote theo manifest digest; runner pull ẩn danh, chạy smoke 100 mẫu/API, restart/backup/restore rồi mới tạo tag và GitHub release.

Trước candidate cuối, PR release đồng bộ version ở Compose, `backend/pom.xml`, `frontend`/`mobile` package và `mobile/app.json`.
Candidate phải build trên đúng commit `main` sẽ phát hành; source đổi thì nghiệm thu lại.

Hồ sơ nghiệm thu đầy đủ (`acceptance_summary`) gồm `identity`, `assistant` từ evaluator ([testing.md](testing.md#đánh-giá-trợ-lý)) và các cờ sau, chỉ đặt `true` khi kiểm tra tương ứng đạt:

| Trường | Bằng chứng |
| --- | --- |
| `android` | `device`, `version`, `expo_sdk`, `passed` từ Expo Go trên thiết bị thật |
| `web_live` | Trình duyệt thật hoàn tất flow nhiều lượt và resume trên cùng ứng viên |
| `provider_recovery` | Chat báo lỗi khi key/egress/provider hỏng, luồng ảnh còn chạy và chat hồi phục |
| `session_restore_rollback` | Backup/khôi phục phiên và rollback image/index/schema đã qua |
| `bundle_review` | Đã rà cấu hình, secret, log, notices và tệp trong gói |
| `reviewed` | Người review xác nhận tổng hợp, gồm rubric nội dung đã chấm |

Ngoại lệ `release_mode=known-limitations` (dùng cho `2.0.0`) nhận trực tiếp run tag candidate đã qua kiểm tra tự động,
đối chiếu các mục hoãn trong `deploy/artifacts/mvp-release-policy.json` và giữ `release_acceptance_complete=false` trong gói.

Nếu lỗi sau khi đã promote một phần, giữ các tag đã tạo và điều tra; không xóa/ghi đè tag.
Khi cả bộ image đã promote đúng digest nhưng smoke/publish bị gián đoạn, dispatch lại với `resume_promoted_images=true`;
chế độ này chỉ cho phép khác biệt ở tooling CI, tests và docs.
