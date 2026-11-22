# Phase 9 — Phiên và điều khiển bước nấu

Trạng thái: đã triển khai, bổ sung unit tests và kiểm chứng Docker SQLite/volume/restart xanh trên CI (PR #21); các quyết định Phase 8 đã chốt; chưa đóng vì còn chờ review và merge PR #21 vào `develop`.
Phụ thuộc [Phase 8](phase-08-foundation.md).

## Mục tiêu

Backend quản lý phiên và bước nấu chính xác, không phụ thuộc LLM để chuyển bước.

## Thực hiện

- [x] Tạo/đọc phiên từ recipe ID hợp lệ; backend lấy công thức từ corpus và gắn version.
- [x] Lưu SQLite trong volume backend, có schema/version và quyền ghi cho user non-root.
- [x] Triển khai bắt đầu, tiếp, trước, nhắc lại, kết thúc; thống nhất index API/UI.
- [x] Giới hạn bước đầu/cuối, tuổi phiên và kích thước lịch sử; xử lý phiên mất/hết hạn.
- [x] Xử lý request trùng, đồng thời và version state; đổi công thức tạo phiên mới.
- [x] Bổ sung controller/DTO/OpenAPI và type/client dùng chung, giữ envelope/request ID.

## Kiểm thử

- [x] Unit tests cho mọi action, trạng thái kết thúc và các biên bước.
- [x] Integration tests với SQLite thật: database mới, đọc/ghi, hết hạn và khôi phục sau restart.
- [x] Hai phiên hoạt động song song không trộn công thức, bước hoặc hội thoại.
- [x] Gửi trùng/đồng thời không làm tăng bước hai lần hoặc ghi đè state mới.
- [x] Recipe ID sai/không có/version không phù hợp trả lỗi rõ; không nhận recipe giả từ client.
- [x] Chạy backend/client contract tests và kiểm tra type sinh lại không lệch API.

## Điều kiện hoàn thành

- [x] Phiên/bước hoạt động và lưu bền vững, kể cả khi chưa cấu hình API LLM.
- [ ] Tests qua, PR/CI tích hợp; sẵn sàng cho [Phase 10](phase-10-llm.md).

## Kết quả kiểm tra

2026-11-22: đã triển khai source theo [contract](../contracts/mvp-v1.md#phiên-trợ-lý-phase-89).
SQLite có migration schema 1, transaction writer, snapshot recipe/version, volume backend UID/GID 10001 và native library ngoài `/tmp` noexec.
Chưa chạy Docker nên mục volume/non-root vẫn mở; không coi kiểm tra Windows là nghiệm thu Linux container.

Giữ nguyên mọi test/snapshot/cấu hình test theo yêu cầu người dùng; không bổ sung unit/integration test vào repository.
Thay vào đó script tạm ngoài repo đã chạy backend HTTP và SQLite thật, upstream recipe giả lập từ corpus.
179 HTTP checks qua: mọi action/biên/trạng thái kết thúc, hai phiên độc lập, replay sau action mới/kết thúc/restart,
operation trùng khác payload, concurrent cùng operation, concurrent khác operation/stale version,
JSON lỗi/field lạ/coercion/UUID/body quá lớn, recipe không tồn tại/corpus sai, lịch sử 100 không trim,
hết hạn, restart JVM thật và từ chối schema không hỗ trợ.
Kiểm chứng bổ sung: đủ 10.000 record trả 503; dọn record hết hạn trên 7 ngày cho phép tạo mới và giữ giới hạn sức chứa.
Messages trả 503 chưa cấu hình, không mutate phiên; không tuyên bố có hội thoại/LLM.
13 kiểm tra client tạm qua: mapping, ID/version/corpus sai, history/recipe/step lỗi, mã lỗi phiên và response muộn khi hủy.
Các kiểm tra tạm không thay thế bộ regression mới được lưu bền vững; mục unit tests còn mở.

`mvn -B -q -f backend/pom.xml compile` qua trên JDK 24, target Java 21.
Baseline backend trước mở rộng API qua 13/13; sau mở rộng 12/13 qua.
`GatewayIntegrationTest.detailsOpenApiAndCorsFollowPublicContract` dòng 178 hardcode đúng 5 OpenAPI paths, hiện đúng 9 nên thất bại.
Không sửa test, ẩn route hoặc đổi cấu hình để né assertion; backend suite chưa green.
OpenAPI lấy từ backend đang chạy, sinh bằng openapi-typescript 7.13.0; sinh lại không lệch file type.
`node --experimental-strip-types --test packages/cooklens-api/client.test.mjs`: 9/9 qua.
`npm --prefix frontend run build`: typecheck/build qua.
`npm --prefix frontend run test:e2e`: 20/20 desktop/mobile với API mô phỏng qua; không thay thế kiểm chứng Docker hoặc thiết bị Expo thật.
Chưa đóng Phase 8: thiếu Docker/thiết bị/provider; PR/CI/tích hợp chưa thực hiện.

Sau review local: đã tái hiện P2 bằng DB tạm sửa offline rồi restart JVM: bản trước trả bước -2 và action next ghi bước -1/version 2.
Đã thêm validation snapshot/state/history trước read/replay/write; kiểm tra kiểu dữ liệu lưu không ép kiểu, UUID, recipe ID/source/bước,
corpus version có giới hạn, version/history/action/operation và timestamp liên kết; dữ liệu sai trả storage 503 và rollback.
40 nhóm dữ liệu sai qua 208 HTTP checks sau sửa, gồm GET/create replay/action mới/action replay/messages và đối chiếu DB không mutate khi bị từ chối.
Snapshot corpus cũ, timestamp lùi do chỉnh đồng hồ và restart vẫn đọc/chuyển bước hợp lệ.
P3 đã tái hiện client từ chối response thành công khi UUID phiên viết hoa; đã chuẩn hóa UUID trước gửi/đối chiếu.
Kiểm chứng tạm UUID cho create/get/action/message qua, response khác session vẫn bị từ chối; client cũ 9/9 và 13 ca client tạm vẫn qua.
Build/typecheck, web 20/20, deploy/data và scanner sau sửa qua; persistence hồi quy 179 HTTP checks và giới hạn 10.000 record/dọn hết hạn cũng qua.
Backend vẫn 12/13, chỉ lỗi assertion số OpenAPI paths 5 so với 9 đã ghi ở trên; review độc lập lần cuối không còn finding đã xác nhận trong phạm vi đã rà.
Không đổi schema/retention hoặc lưu khóa replay vô hạn; contract làm rõ dedup chỉ trong thời gian giữ record.
Review độc lập lại xác nhận hai lỗi gốc đã sửa, đồng thời phát hiện P3 về thứ tự lỗi trên create replay của record hết hạn.
Đã tách validation dữ liệu lưu khỏi kiểm tra hết hạn: corrupted record trả 503 trước, retained key khác payload trả 409, cùng payload hết hạn trả 410.
Tái hiện trước sửa trả 410 sai cho payload khác; sau sửa 16 HTTP checks live/expired/corrupt/purged qua và dữ liệu không đổi khi request lỗi.
Sau sửa R1 đã chạy lại 208 HTTP checks dữ liệu sai và 179 HTTP checks hồi quy, đều qua.
Reviewer độc lập xác minh bằng đọc code và script, không chạy app/test hoặc sửa dữ liệu; kết quả runtime ở trên do worker thực hiện.
Docker, JDK 21 runtime, provider/mobile và PR/CI vẫn là các gate chưa đóng, không được suy ra đã đạt từ verdict review local.

2026-11-22 (cập nhật unit tests & CI trên PR #21):
- Đã cập nhật assertion số OpenAPI paths `5 → 9` tại `GatewayIntegrationTest.java:178` và `deploy/scripts/smoke_backend_stack.py:102`, đồng thời bổ sung 2 file unit test bền vững trong repo: `PersistedSessionValidatorTest.java` (5 ca) và `AssistantServiceTest.java` (9 ca) phủ mọi action, biên bước, trạng thái kết thúc, 100-action limit, dedup/conflict/concurrent, expiry/precedence/purge, corrupt DB/schema và cách ly phiên song song.
- `Backend public API / gateway-and-real-stack` ([run 44997906884](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906884/job/137132897383)): PASS trên JDK 21 (`mvn test` 27/27) và real Compose stack (`deploy/scripts/smoke_backend_stack.py`):
  - Xác nhận container `backend` chạy `id -u`/`id -g` = `10001:10001`, root filesystem read-only (từ chối ghi `/app/ro-check`), volume `assistant-sessions` gắn RW tại `/app/data`.
  - Xác nhận `/app/data/assistant.sqlite` thuộc `10001:10001`, `PRAGMA user_version = 1` (`assistant_sqlite_schema_version: 1`, `assistant_sqlite_volume_persisted: true`).
  - Xác nhận phiên tạo và chuyển bước `start` trước `docker compose restart backend` đọc lại nguyên vẹn sau restart và chuyển tiếp `next` lên version 2 (`assistant_restart_survived: true`).
  - Xác nhận `POST /api/assistant/sessions/{id}/messages` khi chưa cấu hình LLM trả 503 `ASSISTANT_NOT_CONFIGURED` và không mutate state/history/messages (`assistant_messages_unconfigured_503_no_mutation: true`).
  - Xác nhận `generate_frontend_contract.sh` + `git diff --quiet -- frontend/src/generated/api.d.ts` đạt 0 drift.
- `Docker standalone candidate / source-checks` ([run 44997906939](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906939/job/137132888769)) và `Mobile Expo / contracts-and-native-bundles` ([run 44997906872](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906872/job/137132824325)): PASS (shared client 9/9, web build/e2e, Expo contracts).
- Gates còn mở: GitHub review/approval và merge PR #21 vào `develop` (các quyết định Phase 8 đã chốt ngày 2026-11-22 +07; chưa đóng Phase 9 cho đến khi merge).
