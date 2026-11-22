# Phase 8 — Chốt nền tảng và contract

Trạng thái: nền Docker/contract/SQLite đã kiểm chứng xanh trên CI (PR #21) và 4 quyết định Phase 8 đã chốt; chưa đóng vì còn chờ review và merge PR #21 vào `develop`.
Đầu vào: bản ảnh/công thức và [thiết kế trợ lý](assistant.md).

## Mục tiêu

Có nền chạy ổn định và contract rõ ràng trước khi triển khai trợ lý.

## Thực hiện

- [ ] Rà, tích hợp phần docs/Docker đang sửa và kết quả nghiệm thu ảnh/công thức; xử lý PR còn mở.
- [x] Giữ một `compose.yaml`, project `cooklens`, Dockerfile từng phần và image có sẵn.
- [x] Chốt request/response cho tạo/đọc phiên, messages, actions và lỗi; giữ API cũ tương thích.
- [x] Chốt action, quy tắc bước đầu/cuối, đổi recipe, gửi trùng và response muộn.
- [x] Chốt SQLite/schema, recipe version gắn phiên, tuổi phiên và giới hạn lịch sử/body.
- [x] Chọn provider/model đầu tiên, timeout, giới hạn output và ngân sách gọi API thật.
- [x] Chốt hệ điều hành/thiết bị Expo bàn giao; chốt bộ tình huống, kỳ vọng từng ca, số mẫu và ngưỡng latency/usage của trợ lý trước khi đo.

## Kiểm thử

- [x] Chạy deploy/data tests, build web và kiểm tra contract client hiện tại.
- [x] Bật Docker, chạy `docker compose up`; kiểm tra readiness và luồng ảnh → recipe → detail.
- [x] Kiểm tra seed mới, restart giữ index và chỉ cổng web được publish.
- [x] Đối chiếu từng route/action với tình huống hợp lệ, lỗi và yêu cầu bảo toàn state.
- [x] Rà link tài liệu, diff, secrets và đầu vào artifact; không dùng số đo cũ thay test mới.

## Điều kiện hoàn thành

- [x] Nền Docker chạy thật, hồi quy cũ qua; contract và các giới hạn đã ghi rõ.
- [x] Provider/model và phạm vi mobile đã chốt; key được cấu hình riêng, không ghi vào plan/Git.
- [ ] PR/CI đã review và tích hợp; đủ đầu vào cho [Phase 9](phase-09-sessions.md).

## Quyết định cần chốt

Các quyết định bên dưới đã được người dùng chốt ngày 2026-11-22 (+07):

Provider/model:

- Người dùng chọn dùng trước NVIDIA Nemotron 3 Ultra (free tier / endpoint tương thích OpenAI); Anthropic `claude-haiku-5-5` ($0.10/$0.50 mỗi 1M tokens, trả phí) là lựa chọn trả phí đã phê duyệt.
- Chính sách: chỉ kích hoạt một provider tại một thời điểm qua cấu hình runtime (không tự động fallback âm thầm sang provider khác); `LLM_API_KEY` chỉ cấp qua biến môi trường runtime ngoài Git, tài liệu plan, layer Docker image và client. Mẫu cấu hình mặc định cho NVIDIA Nemotron 3 Ultra đã được ghi trong [`.env.example`](../../.env.example) với `LLM_API_KEY=` để trống.

Giới hạn phiên, request và ngân sách (Option 2A):

- Phiên 24 giờ cố định, tối đa 100 action (slot cuối dành cho kết thúc), tối đa 10.000 record.
- SQLite schema 1, snapshot recipe/corpus version; body 8 KiB, nhận JSON trong 5 s, message không blank tối đa 2.000 UTF-16 code units; chưa gửi ra provider hoặc lưu hội thoại trong Phase 9. Quy tắc đầy đủ ở [contract](../contracts/mvp-v1.md#phiên-trợ-lý-phase-89).
- Timeout và output LLM: `LLM_TIMEOUT_SECONDS=20` phía backend (2 s connect; client `POST /messages` timeout 25 s); `LLM_MAX_OUTPUT_TOKENS=512`.
- Lịch sử hội thoại: tối đa 30 lượt chat mỗi phiên 24 giờ (60 message records; gửi 6 lượt gần nhất / 12 messages, trần cửa sổ ngữ cảnh ~2.500 tokens).
- Rate limit: 4 request nghiệp vụ đồng thời/instance + 12 requests/phút/phiên.
- Ngân sách tháng: tối đa $10/tháng (cảnh báo tại $5, chặn cứng tại $10).

Nền tảng/thiết bị mobile (Option 3A):

- Chỉ bàn giao trên thiết bị Android thật (Android 10+ / API 29+, khuyến nghị Android 12+) qua Expo Go SDK 58 (React Native 0.88.1).
- iOS không được đánh giá/nghiệm thu trong MVP; không dùng browser mobile emulation để thay bằng chứng thiết bị thật.

Bộ tình huống và ngưỡng đánh giá trợ lý trước khi đo (Option 4A Standard MVP):

- 30 ca single-turn thuộc 6 nhóm (8 hướng dẫn bước nấu bình thường trên >=4 công thức trong corpus, 5 thiếu dữ liệu/mơ hồ, 5 ngoài phạm vi/prompt injection, 4 an toàn thực phẩm/dị ứng, 4 đổi công thức/toàn vẹn state, 4 response muộn/trùng/tiêm lỗi) + 3 hội thoại multi-turn (~50 lượt gọi API thật tổng cộng).
- Ngưỡng latency: `p50 <= 2.5 s`, `p95 <= 6.0 s` (trần cứng `<= 8.0 s`).
- Ngưỡng pass rate: `100%` ở nhóm an toàn/state/bảo mật; `>= 90%` ở hỏi đáp thường (0 trường hợp bịa định lượng/nguồn như sự thật của công thức).
- Ngưỡng usage: input trung bình `<= 4.000 tokens/lượt` (`p95 <= 6.000`), output trung bình `<= 350 tokens/lượt` (trần cứng `<= 512`).

## Kết quả kiểm tra

2026-11-22: đã đọc toàn bộ 46 Markdown và fixture trong docs trước khi sửa.
PR mở hướng về develop còn #4 (`hung/rag`, notebook RAG), ngoài scope; không sửa hoặc merge PR này.
Contract trợ lý, DTO/controller/OpenAPI và type/client chung đã đồng bộ; API ảnh/công thức giữ nguyên.
`python -X utf8 -m unittest discover -s deploy/tests -q`: 31 ca, 3 skip theo suite; data: 7/7 qua.
Lệnh Python mặc định ban đầu lỗi cp1252 trên Windows; chạy chế độ UTF-8 qua, không sửa test/config hoặc code ngoài scope.
Client regression 9/9, web build/typecheck, corpus validation 33 recipe/30 món, public metadata scanner và frontend bundle check đều qua.
`npm --prefix frontend run test:e2e`: 20/20 qua sau khi cài Chromium đúng phiên bản Playwright; không sửa test/config.
Đã rà 40 link file nội bộ trong tài liệu thay đổi, không có đích thiếu; diff không có test/snapshot hay secrets.
Kiểm chứng HTTP backend/SQLite thật với upstream recipe giả lập ghi tại [Phase 9](phase-09-sessions.md#kết-quả-kiểm-tra).
Môi trường Windows: Maven 3.9.11 tạm, JDK 24 biên dịch target 21, Node 22.18, Python 3.14.
Chưa có Docker executable nên không chạy Compose/readiness/seed mới/restart index và luồng AI thật.
Artifact manifest/provenance đã đọc; chưa có kiểm chứng build/runtime model trong lần này.
Không dùng số đo nghiệm thu cũ thay thế lần kiểm chứng này.
Provider/model/ngân sách, thiết bị Expo và tiêu chí đánh giá LLM vẫn chờ quyết định; PR/CI/tích hợp chưa thực hiện trong phạm vi bàn giao.

2026-11-22 (cập nhật CI trên PR #21):
- Toàn bộ 9/9 CI jobs hoạt động đều PASS (2 job prerelease-tag `clean-registry-pull` và `publish-prerelease` bỏ qua theo điều kiện tag):
  - `Backend public API / gateway-and-real-stack`: PASS ([run 44997906884](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906884/job/137132897383)) — `mvn test` 27/27 trên JDK 21, `docker compose up --wait`, luồng ảnh → recipe → detail thật, `only_frontend_published_on_loopback: true`, `ai_services_only_internal_networks: true`, kiểm chứng SQLite volume/restart và `generate_frontend_contract.sh` + `git diff --quiet -- frontend/src/generated/api.d.ts` (0 drift).
  - `Docker standalone candidate / source-checks` & `standalone-and-offline`: PASS ([source-checks](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906939/job/137132888769), [standalone-and-offline](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906939/job/137133290149)) — `smoke_release_stack.py` xác nhận seed `recipe-init` mới/lặp/nâng cấp/rollback, `docker compose down`/`up` giữ nguyên volume `recipe-index`, chỉ cổng web `frontend` publish trên `127.0.0.1`, và luồng offline 100 mẫu.
  - `Frontend design and real API / browser-and-docker`: PASS ([run 44997906862](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906862/job/137132902183)) — Playwright mocked + real API trên Compose stack.
  - `Recipes runtime / cpu-runtime`: PASS ([run 44997906857](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906857/job/137132824120)); `Mobile Expo / contracts-and-native-bundles`: PASS ([run 44997906872](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906872/job/137132824325)) sau khi cập nhật patch pins Expo SDK 58; `MVP input artifacts / verify-inputs`: PASS ([run 44997906890](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906890/job/137132824140)); `Recipe corpus / validate`: PASS ([run 44997906922](https://github.com/tung51652-alt/Cooking-assistant/actions/runs/44997906922/job/137132824254)).
- Rà tài liệu & bảo mật: 87 link nội bộ trong `docs/` hợp lệ (0 broken); `deploy/scripts/check_public_metadata.py` và `deploy/scripts/verify_mvp_inputs.py` PASS. PR #4 (`hung/rag`, `fea:add notebook rag`) vẫn mở ngoài scope — không sửa/merge.
- Quyết định Phase 8 đã chốt (2026-11-22 +07): chọn dùng trước NVIDIA Nemotron 3 Ultra (free, OpenAI-compatible; đã cung cấp mẫu trong `.env.example` với `LLM_API_KEY=` rỗng) cùng lựa chọn trả phí đã phê duyệt Anthropic `claude-haiku-5-5` (một provider/lần qua runtime config, key ngoài Git/plan/image/client), Option 2A (timeout/output/lượt chat/rate limit/ngân sách $10/tháng), Option 3A (Android 10+ thật qua Expo Go SDK 58, không nghiệm thu iOS/emulation) và Option 4A Standard MVP (30 ca single-turn + 3 multi-turn, ngưỡng latency/pass rate/usage).
- Gates còn mở: GitHub review/approval và merge PR #21 vào `develop` (chưa đóng Phase 8 cho đến khi merge).
