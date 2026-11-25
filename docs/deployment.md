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
Máy chạy Expo/Metro chỉ cần Node và một gateway LAN/HTTPS từ máy khác.
Kiểm tra `/api/health` từ trình duyệt điện thoại và mở Expo Go theo [hướng dẫn mobile](../mobile/README.md).

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
Mặc định dùng Google AI Studio key với `https://generativelanguage.googleapis.com/v1beta/openai` và `gemini-3.1-flash-lite`; `LLM_PROVIDER=openai` chỉ định adapter tương thích.
Policy Google dùng trần giá Standard paid kể cả free tier; reservation/usage và giới hạn $10/tháng ở [backend/README.md](../backend/README.md).
NVIDIA trial vẫn dùng được khi đặt đúng endpoint/model; không tự fallback hoặc bật model chưa có policy giá.

Sau khi đổi biến môi trường, dùng `docker compose up -d --force-recreate backend` với cùng biến image/project đang chạy để tạo lại container có config mới.
`docker compose restart backend` giữ environment của container cũ, không đọc lại key/model mới từ `.env`.
Kiểm tra cấu hình bằng `docker compose config --quiet`; output config/inspect đầy đủ có thể chứa key runtime, không chia sẻ output đó.
Candidate packaging từ chối key đã expand và giữ các placeholder `LLM_*` để gói công khai không chứa credential.

Thiếu key, provider lỗi/429/timeout hoặc egress mất chỉ ảnh hưởng chat; ảnh/công thức, readiness và cooking actions không cần LLM.
Proxy assistant chờ tối đa 25 s, provider tối đa 20 s; các route ảnh/công thức giữ timeout proxy 20 s.
SQLite volume giữ cả conversation/operation, rate attempts và ledger chi phí qua restart; ledger không bị xóa khi purge phiên.
Schema 3 không downgrade tự động; backup nguyên volume khi backend đã dừng trước khi nâng hoặc rollback schema.
Khôi phục vào volume thử và xác nhận GET của cùng phiên trả đủ công thức, bước, hội thoại và version trước khi dùng bản backup.
Nếu image rollback chỉ hỗ trợ schema cũ, dùng snapshot SQLite tương thích đi cùng gói image/index cũ và giữ volume schema mới riêng.

Kiểm chứng local Phase 10 đã qua Compose config, Java 21 process restart với upstream giả và ba smoke Linux container trên Docker Desktop.
Đã kiểm tra non-root/read-only, schema 3/volume/restart, mạng internal/egress và full offline flow.
Baseline Ultra không đạt latency; candidate Super đã qua 50/50 HTTP/state, latency và usage, còn chờ human review và PR/CI; không coi đây là nghiệm thu chat hoàn tất.
Lần kiểm chứng trước dùng tag local `phase10-local/cooklens-<service>:2.0.0-rc.16` với selector Super qua NVIDIA và key chỉ backend; không phải release mới.
Backend/frontend build source mới, AI giữ nội dung image public `2.0.0-rc.2`; không push/promote các tag này thành release.

## Ứng viên Phase 13

Sau khi source được duyệt, đẩy một tag ứng viên mới theo dạng `v2.0.0-rc.N`.
Workflow **Docker candidate and registry release** chạy source/Expo checks, smoke Compose, push image, pull ẩn danh trên runner sạch, đánh giá CV và retrieval.
Run thành công lưu `cooklens-phase13-candidate` có `bundle/`, `identity.json`, `vision.json` và `flow.json`.
Giữ lại run ID và hồ sơ identity để đối chiếu đúng image khi chuẩn bị live UI và review.

Trên host chạy live, pull và chạy `bundle/compose.yaml` bằng cùng image và cấu hình runtime.
Từ source đã checkout của tag, dùng `registry_release.py identity --compose BUNDLE/compose.yaml --tag TAG --source-sha SHA --output identity-local.json` sau khi pull để so sánh với `identity.json`.
Thêm key riêng cho backend và chạy ca Android, web, recovery và bộ LLM theo [kế hoạch Phase 12–13](plan/2026-11-23-phase12-13-completion.md) và [hướng dẫn kiểm thử](testing.md).

Khi mọi gate đạt, maintainer dispatch workflow đã nêu từ `develop` hoặc nhánh mặc định với `candidate_run_id`, `candidate_tag` và `acceptance_summary`.
Summary JSON dùng `identity` từ lần kiểm chứng, `assistant` từ `--release-summary`, và các trường sau theo kết quả đã được review.

| Trường | Bằng chứng |
| --- | --- |
| `android` | Object gồm `device`, `version` (số phiên bản Android), `expo_sdk` và `passed`, đối chiếu với ca Expo Go trên thiết bị thật. |
| `web_live` | Trình duyệt thật hoàn tất flow nhiều lượt và resume trên cùng ứng viên. |
| `provider_recovery` | Chat báo lỗi khi key/egress/provider không khả dụng, luồng cũ còn chạy và chat hoạt động sau khôi phục. |
| `session_restore_rollback` | Bản sao/khôi phục có phiên chat và rollback tương thích image/index/schema đã qua. |
| `bundle_review` | Đã rà cấu hình, bí mật, log, notices và tệp trong gói. |
| `reviewed` | Người review xác nhận tổng hợp cùng ứng viên, gồm rubric nội dung đã chấm. |

Các cờ đơn chỉ điền `true` khi kiểm tra tương ứng đạt. Summary giữ số đo và kết quả, tránh đưa key, transcript, session ID hoặc SQLite vào workflow.
Job publish đối chiếu run tag và hồ sơ image trước khi đóng gói và công bố GitHub prerelease.

## Phát hành chính thức

Luồng **Promote accepted MVP release** trong `.github/workflows/final-release.yml` chỉ chạy từ `main`.
Trước khi tạo candidate cuối, PR release cần pin Compose, Maven artifact, web/mobile package và Expo app về `2.0.0`, đồng bộ lockfile và tài liệu.
Pipeline candidate vẫn dùng tag `rc.N` qua biến môi trường; chưa đổi mặc định source đang dùng sang tag final chưa tồn tại.

Tạo và nghiệm thu candidate trên đúng commit `main` đó; dispatch publish prerelease cũng từ cùng commit.
Run publish thành công lưu artifact `cooklens-accepted-candidate` trong 30 ngày, chứa đầy đủ đầu vào đã đối chiếu gate.
Dispatch luồng final với `accepted_run_id` là run publish này, không phải run build candidate.
Nếu source thay đổi, cần nghiệm thu lại ứng viên theo source mới.

Ngoại lệ MVP được người dùng chốt ngày 25/11/2026: dispatch `release_mode=known-limitations` và `accepted_run_id` là run tag candidate đã qua toàn bộ kiểm tra tự động.
Luồng này dùng artifact `cooklens-phase13-candidate`, đối chiếu quyết định trong `deploy/artifacts/mvp-release-policy.json`, không yêu cầu summary giả cho các mục thủ công còn thiếu.
Gói giữ `release_acceptance_complete=false`, công bố danh sách mục hoãn và chỉ số tự động riêng; các lỗi/hạng mục thiếu được theo dõi bằng GitHub issues sau release.

Luồng final kiểm tra gói prerelease đã công bố khớp artifact, gate nghiệm thu và source; từ chối tag final đã tồn tại.
Bốn image được promote bằng manifest digest đã nghiệm thu, không rebuild; Qdrant giữ phiên bản riêng.
Runner pull ẩn danh, chạy smoke 100 mẫu/API với volume mới, kiểm tra restart/backup/restore và đối chiếu digest trước khi đóng gói.
Chỉ sau khi đạt mới tạo tag `v2.0.0` và GitHub release cùng `cooklens-2.0.0.tar.gz`.
Gói giữ notices, thêm `.env.example` có key trống và model selector đã nghiệm thu.

Nếu lỗi sau khi đã promote một phần, giữ nguyên các tag đã tạo và điều tra; không xóa/ghi đè tag để chạy lại tự động.
Nếu cả bộ final đã được promote đúng digest nhưng smoke/publish bị gián đoạn, có thể dispatch lại với `resume_promoted_images=true`.
Luồng chỉ kiểm tra image hiện hữu, không ghi registry; source ứng dụng phải giữ nguyên so với candidate, chỉ cho phép khác tooling CI/tests/docs.
Tag release vẫn trỏ đến source đã build image, kể cả khi workflow khôi phục chạy từ commit sửa tooling.
Nếu source tag đã tạo nhưng bước GitHub release lỗi, dùng artifact final đã kiểm chứng để khôi phục bước công bố, không rebuild.
Link và số đo phát hành chỉ bổ sung vào [acceptance.md](acceptance.md) khi run thật hoàn tất.
