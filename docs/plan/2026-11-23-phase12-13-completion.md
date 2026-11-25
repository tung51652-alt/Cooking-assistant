# Kế hoạch hoàn tất Phase 12 và 13

> Khi bắt đầu triển khai, dùng `superpowers:executing-plans` và xác minh từng mục trước khi đánh dấu hoàn tất.

**Mục tiêu** — Bàn giao trợ lý nấu ăn trên Expo Go Android thật và nghiệm thu cùng một ứng viên phát hành có trợ lý trên web và Android.

**Kiến trúc** — Expo và web dùng chung `packages/cooklens-api`, gateway và API phiên đã merge.
Backend sở hữu bước nấu, hội thoại và phiên bản trạng thái trong SQLite.
Ứng viên dùng Compose, các image và công cụ nghiệm thu hiện có của CookLens.

**Công nghệ** — Expo Go SDK 58, React Native 0.88.1, TypeScript, Spring Boot/Java 21, SQLite và Docker Compose trên Linux/amd64 CPU.

**Yêu cầu gốc** — [Phạm vi sản phẩm](../product.md), [lộ trình MVP](mvp.md), [thiết kế trợ lý](assistant.md), [quyết định Phase 8](phase-08-foundation.md), [Phase 12](phase-12-mobile.md), [Phase 13](phase-13-acceptance.md) và [contract MVP](../contracts/mvp-v1.md).
Dùng code đã merge để xác định cách tích hợp.
Khi ghi chú mới và checklist gốc khác nhau, giữ tiêu chí gốc và kiểm tra hành vi thực tế.
Tài liệu này thay phần việc còn lại trong [kế hoạch chuẩn bị ngày 22/11](2026-11-22-phase12-13-prep.md).

## Baseline và các điểm cần đối chiếu

| Mốc | Bằng chứng hiện có | Dùng cho Phase 12–13 |
| --- | --- | --- |
| Phase 1–7 | Image `2.0.0-rc.2` và [kết quả nghiệm thu](../acceptance.md) cho ảnh, Top-3, retrieval, công thức, offline và phát hành Docker | Giữ luồng và ngưỡng đã chốt. Chạy lại trên ứng viên có trợ lý. |
| Phase 8–9 | [PR #21](https://github.com/tung51652-alt/Cooking-assistant/pull/21) đã merge. Contract, capability phiên, TTL, SQLite, operation ID, bước nấu và volume đã có. | Tái sử dụng API và hành vi lưu phiên. Các dòng tài liệu còn ghi chờ merge đã cũ. |
| Phase 10–11 | [PR #22](https://github.com/tung51652-alt/Cooking-assistant/pull/22) đã merge vào `develop`. Source checks, Docker smoke, browser, backend và Expo bundle đều xanh trên commit merge. Hai job pull registry và publish bị skip. | Tái sử dụng chat, client, evaluator và UI web. Kết quả CI này xác nhận baseline đã merge. |
| Bằng chứng LLM | `Ultra` đã thử và trượt latency. `Super` đã được thử theo quyết định đổi model ở Phase 10, code hỗ trợ và lần chạy local đạt HTTP/state 50/50, latency và usage. Human review vẫn mở. | Chọn cấu hình runtime của lần nghiệm thu, ghi model selector và model trả về. Dùng Super cho ứng viên nếu tiếp tục quyết định runtime đã ghi ở Phase 10. Chạy và review trên đúng image ứng viên. |
| Groundwork Phase 12 | `codex/phase12-13-prep` đang dựa trên #21 và có thay đổi local cho điều khiển bước, lưu con trỏ phiên và resume. Chat còn thiếu. | Tích hợp groundwork với #22 sau khi bảo toàn thay đổi local. Chạy lại kiểm tra trên source tích hợp. |

`compose.yaml` và `.env.example` trên baseline vẫn mặc định Ultra.
Cấu hình Super qua `LLM_MODEL` ở runtime theo lựa chọn đã thực hiện trong Phase 10, ghi selector `nvidia/nemotron-3.5-super-vl-120b-a12b` và đối chiếu serving model trả về.
Chốt cấu hình hiệu lực của lần đo trước khi chạy. Duy trì một provider tại một thời điểm, không tự fallback khi lỗi.
Bản merge chỉ hỗ trợ adapter OpenAI-compatible và NVIDIA free đã được allowlist.
Anthropic là lựa chọn trả phí đã duyệt trong Phase 8. Phạm vi nghiệm thu yêu cầu một provider chạy thật, nên ứng viên NVIDIA không phụ thuộc vào adapter Anthropic.
Việc triển khai mobile có thể bắt đầu trên baseline đã merge. Trước khi đóng Phase 12, đối chiếu kết quả UI web và yêu cầu owner Phase 10–11 xác nhận tình trạng review còn mở.
Có thể hoàn tất review Phase 10 từ report hợp lệ đã có. Phase 13 cần bộ kết quả trên chính ứng viên mới.

## Ràng buộc đã chốt

- Android thật 10+ (API 29+, khuyến nghị Android 12+) qua Expo Go SDK 58. Giữ React Native 0.88.1 và dependency tương thích của repo.
  Công việc bàn giao thiết bị nằm trong Expo Go, không gồm APK, store release hay nghiệm thu iOS.
- Gateway LAN riêng hoặc HTTPS của cùng stack. Giữ một Compose project, một `docker compose up`, gateway là cổng public và chỉ backend giữ key/egress LLM trong các API service.
- Phiên hết hạn cố định sau 24 giờ. Khi tạo phiên, backend dọn bản ghi đã hết hạn trên 7 ngày.
  Tối đa 10.000 bản ghi phiên và 100 action mỗi phiên, với slot cuối dành cho kết thúc.
  Giữ 30 lượt chat/60 message records và tối đa 6 cặp gần nhất trong khoảng 2.500 token dành cho lịch sử.
  Giữ 12 provider attempts mới/phút/phiên (kể cả lỗi, replay và lệnh nấu không chiếm slot mới), 4 request nghiệp vụ đồng thời/instance, cảnh báo chi phí tháng UTC tại $5 và chặn tại $10.
- Backend timeout 20 s với connect 2 s, client chat 25 s và output cap 512 token.
  Giữ envelope và bất biến version/recipe của contract `1.0.0`. Session ID là quyền truy cập, không đưa vào URL chia sẻ, log, ảnh chụp hay báo cáo.
  Chỉ gửi dữ liệu recipe/bước và hội thoại hợp lệ cho provider chat; ảnh gốc không đi qua provider.
- Trợ lý giải thích theo công thức và bước đã lưu, hỏi lại khi thiếu dữ liệu và ghi rõ đâu là gợi ý bổ sung.
  Nút và lệnh nấu hợp lệ dùng cùng logic backend. Phạm vi bàn giao không yêu cầu thử nấu, voice, web search hay thay nguyên liệu phức tạp.
- Phát hành ứng viên mới từ source đã tích hợp với tag bất biến. Dùng image, corpus, model CV, embedding và cấu hình provider thực tế trong hồ sơ ứng viên.
  PR/CI và review là tiêu chí hoàn tất, thao tác publish thực hiện khi đã được giao quyền.

## Phase 12 — Expo Go Android

### 1. Tích hợp baseline và chạy kiểm tra ban đầu

- [ ] Bảo toàn thay đổi local trên `codex/phase12-13-prep`, đưa PR #22 vào nhánh triển khai rồi kiểm tra diff với `origin/develop`.
  Đọc `frontend/src/features/AssistantPage.tsx`, `packages/cooklens-api/index.ts`, contract và backend error codes để khớp hành vi chat.
  Giữ controller và SecureStore pointer hiện có của Expo.
- [ ] Xử lý xung đột giữa `mobile/package-lock.json` và `deploy/scripts/check_public_metadata.py` trước khi chốt gate.
  Groundwork thêm một npm SRI hợp lệ, còn scanner chặn toàn bộ chuỗi dạng SRI.
  Giữ integrity do npm sinh. Nếu maintainer duyệt thay đổi policy, nhận diện đúng trường `packages.*.integrity` trong lockfile npm hợp lệ, giữ mọi rule khác trên toàn file và kiểm tra scanner vẫn chặn cùng literal ở vị trí khác.
  Khi policy chưa được giải quyết, ghi gate metadata là blocked và tiếp tục công việc độc lập.

### 2. Nối chat vào controller phiên

- [ ] Mở rộng `mobile/src/assistant/session-controller.ts` với `sendMessage(text)` dùng `createApi().sessionMessage(id, { text, expected_version, operation_id }, signal)`.
  Dùng cùng cơ chế in-flight, abort và kiểm tra request hiện hành của create/action.
  Giữ nguyên body, UUID và version khi người dùng chủ động thử lại operation chưa rõ kết quả.
  Chỉ nhận snapshot đúng phiên, recipe/corpus và version. Một câu hỏi LLM thành công tăng version dù số action trong `history` giữ nguyên.
  Lệnh nấu nhập qua chat như `bước tiếp` có thể trả action trong `history` mà không thêm cặp message. Dùng snapshot đó để cập nhật bước và xóa draft đã gửi, giữ cách phân loại lệnh ở backend.
- [ ] Ánh xạ lỗi theo `ApiError.code`. Với version conflict, refresh và để người dùng quyết định gửi lại từ trạng thái mới.
  Với in-progress, timeout hoặc kết quả chưa xác định, cho đọc lại bằng GET trước, rồi chỉ cho replay cùng operation khi contract cho phép.
  Phân biệt timeout của client với `ASSISTANT_PROVIDER_TIMEOUT` và `ASSISTANT_OUTCOME_UNKNOWN` đã chốt ở server. Hai lỗi cuối giữ kết quả lỗi của operation cũ; chỉ tạo operation mới khi người dùng chủ động gửi lại sau refresh.
  Nếu snapshot đã tiến version, đồng bộ transcript và bỏ retry cũ. Chỉ xóa draft nếu đã có kết quả xác nhận hoặc snapshot chứng minh draft đã được áp dụng; version có thể tăng do thao tác khác.
  Nếu operation đã có lỗi cuối cùng, giữ draft để người dùng có thể chủ động gửi mới sau khi đồng bộ. Nếu chỉ biết kết quả chưa xác định, GET cùng version không chứng minh provider chưa nhận yêu cầu.
  Với lỗi cấu hình, auth, rate, quota, budget hay provider, hiện thông báo tiếng Việt và giữ điều khiển bước khả dụng sau khi trạng thái đã rõ.
  Chỉ xóa con trỏ đúng gateway và phiên khi API báo expired/not found.
- [ ] Khi Back, đổi recipe/phiên hoặc app vào background, abort/chặn response cũ.
  Khi foreground hoặc mở lại, đọc snapshot từ server và cập nhật UI, không phát POST ngầm.
  SecureStore chỉ giữ gateway/ID. Transcript nằm ở server và draft sống trong bộ nhớ màn hình.
- [ ] Bổ sung regression cases trong `mobile/src/assistant/session-controller.test.mjs` cho interleave chat/action, lệnh nấu qua chat không sinh message, double tap, replay cùng body, lỗi cuối, quota còn điều khiển bước, đổi recipe khi pending, foreground GET, chat commit khi app rời màn hình và response về muộn.
  Kiểm tra hồi quy pointer, resume và cooking action hiện có.

### 3. Hoàn tất màn hình và chạy native acceptance

- [ ] Hoàn tất `mobile/src/assistant/CookingSessionScreen.tsx` và điểm vào/resume trong `mobile/App.tsx`.
  Hiển thị recipe, nguồn, bước hiện tại/tổng bước, các nút nấu và chat tiếng Việt; render chat dạng text, hiển thị trạng thái gửi, lỗi, thử lại hoặc kiểm tra phiên.
  Đặt giới hạn nhập theo contract 2.000 ký tự, chặn gửi trùng, hỗ trợ bàn phím và cuộn theo hội thoại, safe area, chữ lớn, nhãn TalkBack và Back.
- [ ] Chạy `npm --prefix mobile ci --ignore-scripts --no-audit --no-fund`, `npx expo install --check` trong `mobile/`, `npm --prefix mobile run typecheck`, `npm --prefix mobile run test:assistant`, `npm --prefix mobile run export` và `node --experimental-strip-types --test packages/cooklens-api/client.test.mjs`.
  CI mobile phải chạy các gate này và metadata scanner trên source tích hợp.
- [ ] Dùng Expo Go trên Android 10+ thật. Kiểm tra QR/Metro và `/api/health` từ trình duyệt điện thoại riêng biệt trước khi chạy luồng.
  Nếu QR lỗi, chẩn đoán kết nối Metro; nếu health lỗi, kiểm tra IP/bind, firewall, Wi-Fi isolation hoặc HTTPS gateway.
  Đặt `EXPO_PUBLIC_API_BASE_URL` về gateway LAN riêng hoặc HTTPS có `/api`.
  Có thể chạy Metro trên máy Windows và stack trên máy khác; điện thoại phải truy cập được cả hai điểm.
- [ ] Chạy các ca Android dưới đây. Ghi model thiết bị, phiên bản Android/Expo Go, commit, loại gateway và kết quả từng ca trong [Phase 12](phase-12-mobile.md).
  Ghi lý do cho ca HEIC không áp dụng nếu thiết bị không hỗ trợ. Gate thiết bị cần kết quả từ Expo Go trên điện thoại thật.
- [ ] Review và tích hợp PR sau khi các ca native và nguồn tương ứng đạt. Xác nhận nguồn đã tích hợp chứa cùng hành vi đã thử; chạy lại các ca bị ảnh hưởng nếu có thay đổi khi merge.

| Ca Android | Kết quả cần quan sát |
| --- | --- |
| Camera và thư viện | Ảnh đúng hướng và xem trước được; có ba dự đoán; thử xác nhận một dự đoán khác hạng 1 hoặc sửa món; danh sách/chi tiết đúng món và hiển thị nguồn. Thử ảnh HEIC thực khi thiết bị hỗ trợ, theo luồng chuẩn hóa ảnh hiện có. |
| Quyền và hủy | Từ chối quyền camera hoặc hủy camera/chọn ảnh giữ nguyên ảnh trước đó nếu có, không tự upload và vẫn có thể chọn lại từ thư viện. |
| Chat và bước nấu | Hỏi ít nhất hai lượt liên quan cùng công thức. Kiểm tra start, next, previous, repeat, finish và chặn ở biên; lệnh nấu qua chat đổi đúng bước, không thêm câu trả lời LLM. Sau finish vẫn xem được phiên; bắt đầu lại tạo phiên mới. |
| Mạng, timeout và retry | Mất mạng hoặc provider phản hồi quá chậm hiển thị lỗi và lối đọc lại. Chạm gửi hai lần hoặc thử lại thao tác chưa rõ kết quả không tạo hai lượt. Sau khi có lại gateway, nút nấu dùng được khi chat lỗi. |
| Back, foreground, mở lại | Rời màn hình hoặc đưa app xuống nền lúc model đang trả lời không làm response cũ đổi màn hình hiện tại. Lúc trở lại hoặc mở lại app, GET giữ đúng recipe, bước và transcript đã commit, không tự POST lại. |
| Hết hạn và đổi công thức | Phiên hết hạn giải thích cách tạo phiên mới; đổi công thức dùng phiên mới và không hiện chat/bước của phiên trước dù response cũ đến sau. |
| Gateway và lưu phiên | Đổi gateway không mở con trỏ của gateway khác. Với lỗi SecureStore, controller báo lỗi lưu và phiên đang mở vẫn dùng được; thử lỗi lưu bằng regression test có dependency giả lập nếu thiết bị không tái tạo được. |
| Trợ năng | Với bàn phím mở và chữ lớn, vẫn cuộn, nhập và chạm được các nút cần thiết. Safe area giữ nội dung và nút trong màn hình; TalkBack đọc nhãn điều khiển, ô nhập và trạng thái gửi/lỗi. |

## Phase 13 — Một ứng viên được kiểm chứng từ source đến gói phát hành

### 4. Hoàn thiện các gate và cơ chế phát hành

- [ ] Giữ [workflow release](../../.github/workflows/docker-release.yml), `prepare_candidate_bundle.py`, `registry_release.py` và `smoke_release_stack.py` làm đường chính.
  Gate trước push dùng kết quả Expo (mục 3), shared client, backend chat/JVM restart, Playwright mô phỏng/stack thật, OpenAPI/type drift, corpus, deploy/data tests và kiểm tra input artifacts/metadata trên cùng source.
  Mở rộng smoke chỉ ở phần thiếu để kiểm tra trợ lý qua gateway và lỗi LLM với trạng thái nấu còn dùng được.
  `mvn -B -f backend/pom.xml test`, `npm --prefix frontend run build`, `npm --prefix frontend run test:e2e` và `python -m unittest discover -s deploy/tests -v` là các lệnh kiểm tra chính ngoài phần Expo.
  Dùng `deploy/scripts/generate_frontend_contract.sh` và kiểm tra diff của `frontend/src/generated/api.d.ts` theo workflow backend hiện có.
  Dùng suite backend hiện có để xác minh TTL/retention, cap action/chat, giới hạn payload/context, concurrency/rate, replay/stale commit, migration và accounting.
  Xác minh cảnh báo $5/chặn $10 bằng fixture đơn giá giả lập; live NVIDIA free không cần phát sinh chi phí để thử ngưỡng.
- [ ] Gắn reusable Phase 7 flow với Compose đã đóng gói và image ứng viên, thay vì tham chiếu `2.0.0-rc.2` hoặc mặc định repo-root.
  Dùng `deploy/scripts/evaluate_release_vision.py`, `accept_release_flow.py`, `recipe_evaluation.py` và `smoke_release_stack.py`; chuyển đúng Compose/image reference qua mọi script cần nó.
  Kiểm tra test harness chỉ xóa dữ liệu thử nghiệm của chính nó.
- [ ] Tách chạy ứng viên và công bố trong workflow hiện có. Tag mới chỉ build → gate nội bộ → push image bất biến → pull sạch và chạy gate tự động.
  Lưu bundle và kết quả cùng run để tiếp tục review, với đủ thời gian lưu artifact cho thiết bị và reviewer.
  Maintainer chạy bước publish rõ ràng sau nghiệm thu, dùng lại bundle và kết quả của run tag đã kiểm tra. Bước publish kiểm tra tag, source SHA, digest và các kết quả bắt buộc khớp cùng hồ sơ, gồm kết quả native, web/live và human review.
  Cập nhật `registry_release.py` và test tương ứng để `release_acceptance_complete`, runbook/notes và prerelease phản ánh kết quả Phase 13 thực tế. Cờ clean pull thành công riêng lẻ chưa đủ điều kiện đóng gói phát hành.
  Kiểm tra PR/nhánh thường không publish, run tag thiếu hoặc lệch kết quả bị chặn và run đủ điều kiện dùng đúng bundle đã thử. Khi cần đổi source hoặc image, build bằng tag mới.
- [ ] Chốt đường mạng Android cho ứng viên trước khi hẹn test. `prepare_candidate_bundle.py` hiện đóng `127.0.0.1` vào gói và chỉ cho đổi `HOST_PORT`.
  Giữ loopback mặc định. Ưu tiên gateway HTTPS của nhóm chuyển đến frontend đang bind loopback; nếu dùng LAN riêng, cho bundle hỗ trợ `HOST_BIND` với mặc định loopback và test chỉ frontend publish cổng.
  Kiểm tra `/api/health` từ điện thoại trên chính gói ứng viên. Không thay gói bằng Compose source để chạy ca Android.
  Host Linux/CI chạy Docker; máy cá nhân chỉ cần Node/Metro nếu dùng để test điện thoại.

### 5. Build, pull ẩn danh và kiểm tra vận hành

- [ ] Chọn tag mới sau preflight registry, build đủ app image từ source đã tích hợp, tạo gói Compose có metadata/notices và chạy kiểm tra nội bộ trước khi push.
  Giữ version tag theo định dạng mà packager hiện chấp nhận. Lưu digest đã push trong hồ sơ chạy và đối chiếu digest tất cả image (kể cả dependency đã pin) ở lần pull sạch và lần chạy live/native.
- [ ] Trên runner sạch không có login registry, image/cache/model từ máy dev, pull ẩn danh và chạy đúng Compose trong gói bằng `docker compose up` với fresh seed.
  `python deploy/scripts/smoke_release_stack.py --pull-registry --compose PATH --samples 100 --report PATH` là lệnh smoke hiện có.
  Test harness có thể dùng checkout riêng. Runtime chỉ dùng gói và image pull được, không mount source hoặc model ngoài.
  Kiểm tra seed mới exit 0, long-running services healthy và CV/taxonomy/corpus/embedding metadata khớp hồ sơ.
  Xác minh backend là non-root với root filesystem read-only và vẫn ghi được vào `assistant-sessions`. Kiểm tra membership `llm-egress` chỉ có backend, AI services ở mạng internal và gateway là cổng publish duy nhất.
- [ ] Dùng `LLM_API_KEY` trống khi build/pack/pull/offline smoke. Cấp key qua runtime riêng của backend khi chạy live và recreate backend nếu biến môi trường thay đổi.
  Rà bundle, Expo/web assets, image config/layers và logs. Báo kết quả kiểm tra ở mức tổng hợp; tránh ghi config/inspect có key, session ID hoặc hội thoại.
- [ ] Chạy ca vận hành bên dưới từ gói trên host/runner thử nghiệm, dùng dữ liệu phiên thử. Nếu script đã có ca tương đương, dùng lại và kiểm tra output có khẳng định đúng hành vi.

| Ca vận hành | Kết quả cần quan sát |
| --- | --- |
| Thiếu key, ngắt LLM, ngắt Internet | Readiness ảnh/công thức còn hoạt động. Ảnh → Top-3 → recipe và nút bước vẫn chạy. Chat báo lỗi tiếng Việt, không tăng version hoặc ghi nửa cặp. Sau khi nối lại, câu hỏi mới hoạt động. |
| Seed và dependency | Fresh seed thành công; input seed lỗi bị từ chối, index tốt còn nguyên; dependency được khôi phục thì gateway trở lại ready và flow chạy lại được. |
| Restart và recreate | Tạo phiên với bước và hội thoại đã commit, ghi nhận version. Sau restart backend và recreate stack giữ volumes, đọc lại cùng snapshot và kết quả retrieval; replay operation đã commit không sinh action/chat hoặc call mới. |
| Backup và restore | Dừng backend, sao lưu toàn volume `assistant-sessions`, khôi phục trên volume thử cùng quyền UID/GID. Đọc lại đúng recipe, bước, chat và version bằng image tương thích; kiểm tra index qua quy trình giữ/phục hồi của runbook. |
| Rollback | Chạy bộ image cũ với index seed/phiên bản tương ứng. Schema hiện tại 3; dùng backup tương thích nếu image cũ chưa đọc được schema 3. Ca schema không tương thích phải thất bại rõ ràng, giữ volume gốc; đưa bộ mới trở lại và xác minh dữ liệu còn nguyên. |

### 6. Đo và nghiệm thu đúng ứng viên

| Gate | Tiêu chí và cách ghi nhận |
| --- | --- |
| CV | Top-3 ≥95% trên split Test sạch cố định của `30vnfoods_clean_split_manifest.csv` (baseline 5.004 ảnh); ghi số mẫu được chấm và model/taxonomy thực tế. |
| Retrieval | Ít nhất 150 query trên 30 món; Hit@1 ≥0,90, Hit@3 ≥0,95 và không lẫn món; ghi cả mẫu số, số lẫn món và corpus/embedding thực tế. |
| API warm | Ít nhất 100 mẫu cho từng API ở concurrency 1; vision P95 ≤10 s, search P95 ≤3 s; ghi CPU, RAM và cấu hình runner. |
| UI thật | Chạy web trên trình duyệt thật với API thật và Android qua Expo Go, cùng gateway ứng viên. Trên mỗi client đi từ ảnh qua recipe, ít nhất hai lượt hỏi đáp có liên hệ, điều khiển bước và reload/resume khi phiên còn mở; đối chiếu bước và transcript đã lưu, rồi finish. Bổ sung lượt thứ hai vào real-flow web hiện có nếu cần. Dùng source Expo từ cùng commit ứng viên. |
| Bộ ca trợ lý | Dùng `deploy/assistant-evaluation.json` đã merge. 26 single-turn live gồm 8 ca hướng dẫn trên ít nhất 4 công thức, 5 ca thiếu dữ kiện, 5 ca ngoài phạm vi/bảo mật, 4 ca an toàn và 4 ca toàn vẹn state. Thêm 3 hội thoại 8 lượt để có 50 request live, và 4 ca fault có kiểm soát từ backend. |
| LLM latency và usage | p50 ≤2,5 s, p95 ≤6 s, tối đa 8 s; input trung bình ≤4.000 và p95 ≤6.000 token; output trung bình ≤350 và tối đa 512 token. Ghi số ca, provider/model và usage theo đúng run. |
| Chất lượng | 100% ca an toàn/state/bảo mật, ≥90% hỏi đáp thường, không bịa định lượng/nguồn như sự thật. Reviewer chấm grounding, safety, security, state, tiếng Việt và mức hữu ích cho từng câu của cùng run. |

- [ ] Chạy web real-flow với `COOKLENS_REAL_API=1`, `COOKLENS_REAL_ASSISTANT=1` và `COOKLENS_BASE_URL` là origin ứng viên.
  Xác nhận ca trợ lý thực sự chạy trong kết quả Playwright; bỏ qua do thiếu key hoặc thiếu env chưa đủ để đóng gate.
- [ ] Chạy `evaluate_assistant.py` ở chế độ mặc định để kiểm fixture, rồi dùng `--execute --base-url GATEWAY_ORIGIN` cho lần đo live được giao. Truyền origin không có `/api`, vì evaluator tự thêm prefix cho route.
  Dùng `render_assistant_review.py` và `evaluate_assistant.py --summarize REPORT --review REVIEW --usage-db SNAPSHOT --junit XML` theo [hướng dẫn test](../testing.md).
  Ghép snapshot SQLite nhất quán, human review đúng report ID và Surefire XML mới cho 4 ca fault. Trước khi đo, đối chiếu điều kiện `evaluation_passed` với rubric đã chốt.
  Evaluator hiện còn yêu cầu cả sáu tiêu chí đạt ở mọi ca ngoài nhóm hỏi đáp thường/hội thoại. Nếu quy tắc gộp này làm thay đổi quyết định theo Phase 8, giữ nguyên kết quả từng tiêu chí và xác nhận cách gộp theo yêu cầu gốc với owner trước khi đóng gate.
  Giữ riêng kết quả kỹ thuật và điểm review. Usage thiếu giữ là chưa xác định; ca mock, HTTP 200 và kết quả model khác không thay bằng chứng live/quality.
  Nếu thiếu review, thiếu usage để chứng minh ngưỡng hoặc gate fail, ghi nguyên nhân và giữ gate mở. Khi đổi source/model/cấu hình ảnh hưởng kết quả, đo lại bộ gắn với ứng viên mới.

### 7. Ghi nhận và bàn giao

- [ ] Cập nhật [runbook](../deployment.md) và [hướng dẫn Expo](../../mobile/README.md) về khởi động, cấu hình provider hiệu lực, TTL và vị trí dữ liệu phiên, backup/restore, rollback SQLite/index và cách kết nối điện thoại.
- [ ] Rà secrets, log, notices, file thừa và hướng dẫn trong gói. Ghi kết quả ngắn vào [Phase 13](phase-13-acceptance.md), số đo/giới hạn và tag ứng viên hoặc link run vào [acceptance.md](../acceptance.md).
  Giữ source SHA và digest trong hồ sơ ứng viên theo policy metadata của repo.
  Giữ transcript, SQLite, log thô và artifact kiểm thử ở vị trí chạy thử phù hợp ngoài Git; không thêm thư mục `evidence` trong repo.
- [ ] Chỉ công bố prerelease sau khi các gate của đúng ứng viên đạt và có review cần thiết. Hoàn tất PR/CI và bàn giao [Phase 14](phase-14-release.md).
  Dọn thiết lập local phát sinh của dự án sau khi người dùng xác nhận bàn giao và chỉ trong phạm vi đã thống nhất.

## Đóng checklist gốc

| Checklist | Mục thực hiện và bằng chứng cần có |
| --- | --- |
| Phase 12 — Thực hiện | Mục 1–3, diff tích hợp, test controller và kết quả source checks. |
| Phase 12 — Kiểm thử và điều kiện hoàn thành | Mục 3, ma trận Android thực tế, hạn chế/nền tảng đã thử và PR/CI đã tích hợp. |
| Phase 13 — Thực hiện | Mục 4–5 và runbook mục 7, source CI trước push, bundle immutable, clean pull, Compose metadata, SQLite và cấu hình runtime. |
| Phase 13 — Kiểm thử | Mục 3 và 5–6, CI source cuối, runtime/rollback, số đo CV/retrieval/API, web và Android trên ứng viên, review cùng report và rà gói mục 7. |
| Phase 13 — Điều kiện hoàn thành | Mục 7, mọi gate đạt trên tag mới, lỗi chặn đã xử lý, PR/CI đã tích hợp, prerelease và hồ sơ bàn giao Phase 14. |

Mỗi kết quả ghi ca/gate, ngày, môi trường, tag hoặc link run, pass/fail và giới hạn áp dụng.
Thiếu thiết bị, credentials, review hoặc kết quả cùng ứng viên thì giữ mục tương ứng mở.

## Ai làm gì

- **Codex** tích hợp code, cập nhật Expo và CI/release tooling, chạy source checks, chuẩn bị gói và chạy các phép đo trên runner được cấp quyền, cập nhật tài liệu và ghi lỗi dựa trên kết quả thực tế.
- **Người có Android hoặc thiết bị do nhóm cung cấp** mở Expo Go và thực hiện checklist thiết bị thật. Codex chuẩn bị URL/QR, cung cấp các bước và chẩn đoán dựa trên kết quả của thiết bị.
- **Người có quyền repo/release** cấp runtime key qua kênh phù hợp, thực hiện hoặc cung cấp human review nội dung và cho phép các thao tác phát hành. Dùng runner Linux hoặc host Docker của nhóm cho gate đóng gói. Kiểm tra local và bản chuẩn bị Phase 12 có thể tiến hành trước khi các điều kiện này sẵn sàng.
