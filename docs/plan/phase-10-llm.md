# Phase 10 — Trợ lý qua API LLM

Trạng thái: candidate Super đã qua 50/50 HTTP/state, latency, usage, restart/replay và kiểm tra key; human review và PR/CI còn mở, chưa hoàn thành Phase 10.
Phụ thuộc [Phase 9](phase-09-sessions.md).

## Mục tiêu

Hỏi đáp theo công thức và bước hiện tại bằng một provider đã chọn.

## Thứ tự triển khai

1. Chốt contract/state/replay và migration tại [contract Phase 10](../contracts/mvp-v1.md#mở-rộng-chat-thiết-kế-phase-10).
   Giữ public message `{role, text}`, gộp action và chat turn vào một thứ tự revision; không còn đồng nhất version với số action.
2. Triển khai migration SQLite schema 2, operation ledger, chat turn và validation; cập nhật shared client cùng thay đổi.
   Giữ nguyên recipe snapshot và phiên Phase 9; provider call không được nằm trong transaction SQLite.
3. Đối chiếu tài liệu chính thức cho NVIDIA endpoint/model đã chọn và viết `ChatProvider`/adapter OpenAI-compatible đầu tiên.
   NVIDIA công bố ID đúng là `nvidia/nemotron-3-ultra-550b-a55b`; `.env.example` đã sửa theo model người dùng chọn.
   Chốt trần toàn input, ước lượng token, accounting usage/chi phí và trường hợp thiếu usage trước khi gọi thật.
   Dùng giới hạn Phase 8: 30 chat turn/phiên, 6 cặp context, history khoảng 2.500 tokens, timeout 20 s, output 512 tokens, 12 chat request mới/phút/phiên và tổng 4 business request đồng thời.
   Ngân sách tháng cảnh báo $5/chặn $10 phải tính cả request lỗi hoặc bị loại vì state cũ, giữ qua restart và purge phiên; không suy chi phí bằng 0 chỉ vì thiếu usage.
4. Nối orchestration context/provider/commit, lệnh bước nấu xác định và mapping lỗi.
   Ghi conversation chỉ khi cả cặp hỏi/đáp hợp lệ và state chưa đổi; replay pending/thất bại không tự gọi lại upstream.
5. Nối runtime config/Compose: key chỉ backend, backend có outbound tới provider, AI/Qdrant vẫn mạng nội bộ.
   Readiness ảnh/công thức không phụ thuộc provider.
6. Chạy test migration/state/client/mock/fault injection, rồi bộ nghiệm thu API thật đã chốt trong Phase 8.
   Cập nhật contract sinh từ backend và tài liệu kết quả thực tế trước khi chuyển Phase 11.

## Phạm vi bước 5

Forward bảy biến `LLM_*` chỉ vào backend, key mặc định trống; thêm bridge `llm-egress` chỉ cho backend, AI/Qdrant vẫn internal và chỉ frontend publish cổng.
Proxy giữ deadline 25 s cho assistant để không cắt lỗi/response trước deadline provider 20 s.
Cập nhật mọi smoke runner đang giả định backend chỉ internal: kiểm tra topology mới, tạm tháo egress khi đo offline rồi khôi phục trong finally.
Smoke mặc định ép key trống để không vô tình gọi API thật từ môi trường người chạy; candidate packaging từ chối key đã expand và giữ placeholder runtime.
Kiểm tra Compose bằng CLI thật không cần daemon; kiểm tra Java 21 và restart process thật với provider/pricing fixture chỉ nằm trong test source.
Ở bước 5 ban đầu máy chưa có Docker engine; kết quả JVM/parse config không thay cho container/Linux/non-root/volume/outbound.
Sau khi người dùng cài Docker Desktop, kiểm chứng Linux thực tế được ghi ở phần bổ sung dưới đây.

## Phạm vi bước 3

Bước 3 dùng Java HttpClient hiện có, không thêm SDK/dependency.
Adapter gọi Chat Completions không streaming, không tools, không retry/fallback; timeout tổng tối đa 20 s và body response tối đa 1 MiB.
Context builder giữ recipe/state server và tối đa 6 cặp gần nhất; giới hạn 6.000 estimated input tokens, 2.500 estimated history tokens, 20.000 byte UTF-8 nội dung và 64 KiB JSON request.
Ước lượng admission là `ceil(UTF-8 bytes / 3) + 16` cho mỗi message, cộng 32 cho prompt; đây không phải tokenizer hoặc số token billing.
Không cắt recipe/câu hỏi; bỏ nguyên cặp lịch sử cũ trước, context bắt buộc vượt trần trả lỗi trước khi gọi.
Usage thiếu giữ null, response lỗi/rỗng/truncated không được coi là câu trả lời thành công; usage hợp lệ vẫn phải đi kèm failure để accounting xử lý ở bước orchestration.
Accounting/rate limit chưa nối ở bước này: bước 4 phải nhận operation, sliding window 12 calls/60 s và reservation chi phí trong cùng transaction.
Reservation/usage của mọi call, kể cả lỗi/stale/crash, lưu ledger độc lập purge phiên và tháng UTC; chưa biết usage thì giữ reservation, không hoàn tiền về 0.
Chỉ endpoint/model trial NVIDIA đã đối chiếu mới có thể dùng mức 0 USD; endpoint/model khác cần đơn giá đã xác minh và giới hạn input/output billing có thể bảo đảm trước khi được nhận call trả phí.
Cảnh báo $5, chặn reservation làm tổng tháng vượt $10; chưa có policy/giới hạn billing đáng tin cậy thì từ chối call trả phí.

## Kiểm tra khi triển khai persistence

Bước 4 triển khai schema 3, migrate từ schema 1/2 trong transaction, thêm ledger call không FK tới phiên và text gốc của command operation.
Pricing runtime hiện chỉ nhận trial NVIDIA đúng endpoint/model đã đối chiếu với đơn giá 0; endpoint/model khác thiếu policy đã xác minh trả `ASSISTANT_NOT_CONFIGURED`, không gọi ra ngoài.
Ledger dùng micro-USD integer, tháng UTC, reservation trước call và usage thật khi có; usage không đủ thì giữ reservation.
Rate limit là 12 provider attempts trong sliding window 60 s/phiên, bao gồm lỗi; replay/command không chiếm thêm slot.
Operation pending, reservation và rate admission commit cùng transaction; provider chạy sau khi nhả writer lock.
Usage được lưu trước khi commit reply và giữ lại khi state đã đổi/hết hạn; pending quá hạn không được tự gửi lại sau restart.
Test dùng HTTP provider giả và pricing giả có chi phí để kiểm tra ngưỡng $5/$10; không dùng đơn giá giả cho runtime hoặc gọi API trả phí thật.

- [x] Database mới và migration schema 1 → 2 giữ đúng phiên/action/replay cũ; migration lỗi rollback; schema lạ bị từ chối.
- [x] `start` v1 → chat v2 → `next` v3 có hai action và một cặp message; validator/client chấp nhận đúng và từ chối dữ liệu hỏng.
- [x] Trùng operation trước/trong/sau provider call, sau restart và sau kết thúc không tạo thêm turn/call; khác payload/route trả conflict.
- [x] Action trong khi chat pending vẫn chạy; reply cũ không append message hoặc đổi bước/version sau action đó.
- [x] Provider lỗi/rỗng/timeout hoặc phiên hết hạn không lưu nửa cặp; accounting vẫn giữ chi phí phát sinh.
- [x] Pending quá hạn sau restart không tự gọi lại; recipe/phiên song song không trộn context hoặc hội thoại.
- [x] Giới hạn 30 cặp độc lập giới hạn 100 action; chat hết quota/lỗi cấu hình không chặn `finish`.
- [x] Lệnh chat chính xác gọi logic action; câu chứa từ khóa và output model không tự thực hiện action.

## Thực hiện

- [x] Tạo interface `ChatProvider` và adapter đầu tiên cho Gemini, OpenAI hoặc Anthropic.
- [x] Cấu hình provider/model/key ở backend; giới hạn timeout, input, output và lịch sử.
- [x] Gửi context từ corpus và state server; tách dữ liệu người dùng khỏi chỉ dẫn hệ thống.
- [ ] Câu trả lời gắn đúng phiên/recipe; phân biệt dữ kiện công thức với gợi ý bổ sung.
- [ ] Không tự tạo nguồn/định lượng khi thiếu dữ liệu; hỏi lại hoặc nêu giới hạn.
- [x] Lệnh bước nấu hợp lệ gọi logic Phase 9; text model không tự ghi đè state.
- [x] Xử lý thiếu key, provider không hỗ trợ, lỗi xác thực, 429 và timeout; không tự đổi provider.
- [x] Cho backend kết nối ra API LLM; lỗi trợ lý không làm hỏng readiness của luồng ảnh/công thức.

## Kiểm thử

- [x] Mock provider để kiểm tra request mapping, context, giới hạn, response lỗi/rỗng và usage.
- [x] Kiểm tra thiếu key, 401/403/429/5xx/timeout bằng fault injection, không cố làm cạn quota thật.
- [x] Kiểm tra request trùng/response muộn không cập nhật sai phiên, bước hoặc lịch sử.
- [x] Chạy bộ câu hỏi đã chốt với API thật: đúng recipe/bước, thiếu dữ kiện, câu hỏi lệch ngữ cảnh.
  Đã thực hiện, không đồng nghĩa đạt chất lượng; latency fail và review còn mở.
- [x] Chạy một hội thoại nhiều lượt thật; ghi provider/model, số mẫu, latency và usage nếu có.
- [x] Rà không lộ key qua API, prompt, client, lỗi hoặc log; không gửi ảnh gốc cho API chat.
  Source/mock kiểm tra payload/error, kiểm tra runtime chỉ đối chiếu key cụ thể trong env/log/assets/artifact, không phải chứng nhận bảo mật toàn diện.

## Điều kiện hoàn thành

- [ ] Một provider chạy thật, các tình huống nghiệm thu đạt và kết quả được ghi trung thực.
- [ ] Không yêu cầu key/adapter của cả ba provider để đóng phase.
- [ ] Backend/client contract và hồi quy cũ qua; PR/CI tích hợp trước [Phase 11](phase-11-web.md).

## Kết quả kiểm tra

Chuẩn bị bước 6: chốt fixture 30 ca single-turn (26 API thật, 4 lỗi kiểm soát bằng mock) và 3 hội thoại 8 lượt, tổng 50 request chat thật nếu không có lỗi.
Runner mặc định chỉ in kế hoạch; execution phải được chọn rõ, không tự retry POST hoặc đọc key provider.
Ghi transcript/report trong `backend/target`, kiểm tra state tự động, lấy usage thật từ bản sao SQLite read-only và để chất lượng pending đến khi người review đánh giá theo rubric.
Kiểm tra fixture, runner và các ngưỡng bằng unit test trước; không gọi provider hoặc coi kết quả giả lập là nghiệm thu API thật.

2026-11-22 (+07): bước 1 đã đối chiếu contract Phase 9 với `AssistantService`, `SessionStore`, validator và shared client.
Đã ghi contract mục tiêu và thứ tự triển khai vào tài liệu hiện có; không thêm spec/OpenAPI thủ công.
Các checklist runtime vẫn mở; chưa sửa source, chạy test, gọi provider hoặc áp dụng migration.

2026-11-22 (+07), bước 2:
Đã thêm schema 2 và migration/backfill operation từ schema 1 trong transaction, giữ session snapshot/action/replay cũ.
Service có lifecycle nội bộ prepare/complete/fail, commit nguyên cặp message, terminal error replay, deadline pending 25 s và chặn completion muộn.
Validator ghép action/chat theo revision, kiểm tra operation/fingerprint/usage và từ chối dữ liệu sai trước read/replay/write.
Client chấp nhận action version có khoảng trống, giới hạn 30 cặp, kiểm tra thứ tự role/action và timeout `/messages` 25 s.
Không thay public DTO/schema; HTTP `/messages` chưa nối provider, câu hỏi mới vẫn trả 503 không mutate state/conversation.

- Backend: `mvn -B -ntp -f backend/pom.xml test` (Maven 3.9.11 tạm, local repository trong thư mục target bị Git ignore) qua 36/36: gateway 13, service 18, validator 5.
  Chạy JDK 25.0.4.1 với compile target 21; chưa kiểm chứng runtime JDK 21/Docker trong bước này.
  Lần chạy sandbox bị chặn loopback; dừng lần đó và chạy lại ngoài sandbox qua, không đổi test/config để né lỗi môi trường.
- Chín service test mới kiểm tra mixed revisions/restart/replay, pending không chặn action, stale reply, terminal failure/unknown outcome, quota độc lập, cách ly phiên, corruption, migration rollback kể cả DDL, concurrent admission và expiry.
  Đây là kiểm tra persistence bằng reply giả lập nội bộ, chưa chứng minh provider call count, mapping HTTP upstream, accounting hoặc chất lượng model.
- `node --experimental-strip-types --test packages/cooklens-api/client.test.mjs`: 14/14 qua, gồm 5 ca trợ lý mới và 9 ca hồi quy.
- Web TypeScript/Vite build, `check_frontend_build.py`, `check_public_metadata.py` và `git diff --check`: qua.
  Smoke Docker đã đổi expected schema sang 2 nhưng chưa chạy; không thay thế kiểm chứng volume/non-root/restart trên Linux.

Tiếp theo sau bước 2 là bước 3: xác minh endpoint/model, viết interface/adapter và chốt input/accounting/rate-limit trước khi nối API thật.

2026-11-22 (+07), bước 3:
Đã đối chiếu [NVIDIA model/endpoint](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) và [API reference](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/apireference).
ID đúng của Nemotron 3 Ultra là `nvidia/nemotron-3-ultra-550b-a55b`, base `https://integrate.api.nvidia.com/v1`.
ID Llama 3.1 cũ trong `.env.example` thuộc model khác và [free endpoint cũ đã deprecated](https://build.nvidia.com/nvidia/llama-3_1-nemotron-ultra-253b-v1); đã sửa example/default backend theo model đã chọn.
Đã thêm `ChatProvider`, adapter `OpenAiChatProvider`, `LlmSettings`, `ChatPromptLimits` và `ChatContextBuilder`, không thêm dependency.
Adapter giữ usage hợp lệ cả khi reply bị từ chối; request/response/config không được đưa secret hoặc raw error body vào public exception.
Backend settings validate khi dùng chat; context chỉ chứa snapshot/state/text, không gửi session ID, API key hoặc ảnh upload.
Đã ghi policy input/accounting/rate limit ở trên; chưa triển khai ledger chi phí hoặc nối provider với phiên/HTTP.

- Backend full suite: 47/47 qua (gateway 13, persistence service 18, validator 5, adapter 7, context 4).
  Maven 3.9.11, JDK 25.0.4.1 compile target 21; chưa chạy JDK 21 runtime/Docker.
- Adapter HTTP mock: mapping role/model/max_tokens/non-streaming/thinking off; 401/403/429/402/5xx/404/422/202/redirect; response rỗng/truncated/tool/model sai; usage thiếu/sai/tràn; JSON malformed/trùng/trailing; chunked response quá 1 MiB; body chậm vượt deadline; config/input/JSON size sai không gọi upstream.
- Context: giữ đầy đủ dữ liệu cả 33 recipe, đúng corpus/recipe/step server, 6 cặp mới nhất, bỏ nguyên cặp cũ khi quá trần, không nâng instruction từ recipe/history/user thành system role.
  Test ban đầu so kiểu numeric node khác nhau (`250`/`250.0`) bị lỗi; đã dùng numeric value comparison, không thay dữ liệu hoặc bỏ kiểm tra quantity.
- Shared client: 14/14 qua, gồm mapping thêm mã lỗi provider; TypeScript/Vite build, public metadata scanner, frontend bundle scanner và `git diff --check` qua.

Không gọi API thật hoặc dùng key thật trong bước này; không coi test tách role là bằng chứng model chống được mọi prompt injection.
Model card không liệt kê tiếng Việt trong danh sách supported languages; chất lượng tiếng Việt/latency phải được đánh giá bằng bộ API thật đã chốt.
Tiếp theo là bước 4: nối context/provider/commit với phiên, lệnh bước nấu, admission/rate limit và accounting bền vững trước khi bật chat HTTP.

2026-11-22 (+07), bước 4:
Đã nối `/messages` với context/provider/session: nhận operation và reservation trong transaction, gọi HTTP ngoài writer lock, settle usage trước commit cặp message.
Cooking commands dùng chung action logic, giữ text/fingerprint gốc để replay đúng route/body, không chiếm chat quota hoặc provider rate slot.
Schema 3 migrate từ 1/2 giữ snapshot/action/chat/replay; ledger call và warning marker độc lập purge phiên, không chứa key/prompt/reply hoặc ID phiên thô.
Pricing runtime chỉ nhận NVIDIA trial đúng endpoint/model; mọi nonzero price trong test là policy giả, không phải đơn giá đã duyệt cho runtime.
Thiếu config/key, provider không hỗ trợ hoặc pricing chưa xác minh không nhận operation/ledger mới; unexpected provider exception được đổi thành lỗi cố định không giữ raw cause.

- Full backend suite: 66/66 qua (chat HTTP 10, adapter 7, gateway 13, accounting 5, service 22, validator 5, context 4).
  Maven 3.9.11/JDK 25.0.4.1, compile target 21; chưa chạy JDK 21 runtime hoặc Docker.
- HTTP mock kiểm tra chat/5 commands, keyword trong câu hỏi/reply không đổi bước, replay sau action/finish, pending duplicate, action khi pending, stale reply, provider failure/rate/timeout, usage thiếu/rỗng, budget denial không chiếm operation, purge không xóa ledger, orphan pending và hai phiên đồng thời/expiry trong lúc gọi provider.
  Lần khởi tạo test HTTP đầu lỗi vì mapper fixture đọc taxonomy không bỏ field metadata; đã dùng cùng chế độ unknown-field như app, không thay corpus hoặc runtime validation.
- Accounting kiểm tra settle một lần, giữ reservation khi usage không đủ, warning $5 và cap $10 qua mở lại store, tháng UTC mới, sliding window kể cả lỗi/clock lùi, concurrent reservation không overspend và usage muộn khi không còn record phiên.
- Migration test giữ action từ schema 1, chat từ schema 2, rollback DDL/lỗi revision và từ chối schema 4 không downgrade.
  Restart trong test là tái tạo service/store và đọc SQLite; restart JVM/container với ledger mới vẫn cần kiểm chứng runtime ở bước tiếp theo.
- OpenAPI lấy từ backend HTTP test tại `/v3/api-docs`, sinh type bằng `openapi-typescript@7.13.0` với cùng flags script hiện có; thêm response 429 và summary messages, giữ 9 route/envelope/DTO.
- Shared client 14/14, TypeScript/Vite build, public metadata scanner, frontend bundle scanner và `git diff --check`: qua.

Chưa dùng key/API thật, chưa đo chất lượng/latency/usage sản phẩm; chưa sửa Compose hoặc build/publish image.
Tiếp theo là bước 5: nối biến môi trường và outbound backend trong Compose, kiểm chứng runtime/restart/readiness, sau đó thực hiện bộ API thật trước khi đóng Phase 10.

2026-11-22 (+07), bước 5:
Compose forward đủ bảy biến LLM chỉ backend với key mặc định trống, thêm bridge `llm-egress` chỉ backend, giữ AI/Qdrant internal và chỉ frontend publish.
Proxy assistant dùng read timeout 25 s thay vì cạnh tranh với deadline provider 20 s; các route khác giữ 20 s.
Đã cập nhật cả ba smoke runner theo topology mới, ép key trống khi fault injection, tháo egress để kiểm tra offline và khôi phục trong finally.
Backend smoke đã chuẩn bị kiểm tra orphan/reservation qua container stop/start bằng helper recipes image, không mạng, non-root, read-only rootfs; chưa chạy container tại local.
Candidate packaging từ chối key đã expand trước khi ghi file và khôi phục placeholder runtime cho cả bảy biến; không đưa credential vào gói công khai.

- Docker CLI 27.5.1/Compose 2.39.4 tạm: `docker compose --env-file NUL -f compose.yaml config --quiet` qua.
  Deploy tests 33/33 qua, không skip; bao gồm default startup/topology/forwarding/backend-only key và candidate credential guard.
  Lần chạy sandbox bị chặn thư mục tạm của packaging tests; chạy lại ngoài sandbox qua, không đổi assertion để né lỗi môi trường.
- Backend 67/67 qua trên Windows Temurin Java 21.0.13.1+2, compile target 21 bằng JDK 25/Maven 3.9.11.
  JRE không có attach tools để Mockito tự attach; lần chạy cuối preload Byte Buddy agent đã có bằng JVM argument, không đổi pom/test configuration hoặc mock maker.
- `AssistantJvmRestartTest` khởi động bốn process Java 21 riêng với cùng SQLite và HTTP/provider pricing fixture test-only.
  Kiểm tra conversation/replay không gọi lại provider, orphan pending quá hạn giữ reservation, rate/budget/warning qua process restart, cooking command khi hết rate và readiness khi provider lỗi.
  Timestamp rate window và orphan/budget fixture được seed có kiểm soát; không dùng chúng làm số đo latency/usage sản phẩm.
  Bootstrap fixture chỉ nằm ở `src/test`, không được Dockerfile copy hoặc đóng gói vào runtime.
- Python syntax deploy scripts/tests, public metadata scanner và `git diff --check`: qua.
  Không thay client/UI trong bước này ngoài timeout proxy; kết quả build/client trước đó giữ ở bước 4.

Giới hạn: không có Docker engine trên Windows/Ubuntu WSL; client info có ServerErrors và `docker version` không có Server.
CLI parsing và JVM Windows không thay bằng chứng Linux container/non-root/native SQLite/volume/Nginx/outbound HTTPS.
Chưa có key runtime hoặc `.env`; chưa gọi API thật, build/push image hay thay tag đã publish.
Gate còn mở: chạy các smoke container đã chuẩn bị trên một Linux Docker engine, rồi bộ API thật Phase 8 với key backend.
Không đóng Phase 10 hoặc chuyển nghiệm thu Phase 11 chỉ từ các check local ở trên.

2026-11-22 (+07), bước 6 — chuẩn bị nghiệm thu:
Đã thêm `deploy/assistant-evaluation.json`: 30 ca single-turn theo đúng sáu nhóm (26 API thật và 4 mock fault), cùng 3 hội thoại 8 lượt, 50 request thật tối đa.
Prompt/rubric cố định trước khi đo, gồm ít nhất bốn recipe và đối chiếu dữ liệu null của ớt băm, lá chuối, thời gian chuẩn bị/nấu.
Runner `deploy/scripts/evaluate_assistant.py` mặc định chỉ lập kế hoạch; execution tạo phiên riêng, không retry POST, dừng khi API/contract sai và lưu output trong target bị Git ignore.
Report không ghi session capability hoặc raw error body; giữ snapshot/rubric cho review và hash call để đối chiếu ledger.
Usage chỉ lấy token/model/status thật từ bản sao SQLite read-only; thiếu usage/model không được đổi thành 0 hoặc tự pass.
Quality cần người review đủ sáu tiêu chí cho cả 50 câu trả lời, đúng report ID; fail định lượng/nguồn/safety/security/state không được bù bằng câu khác.
Runner import bốn testcase mock từ Surefire XML, tách rõ bằng chứng controlled và API thật; hướng dẫn chạy/review ở [testing](../testing.md#bộ-nghiệm-thu-api-thật-phase-10).

- Deploy suite: 44/44 qua, không skip, gồm 11 test mới cho fixture, offline default, 50 calls, không retry, state, privacy, percentile/ngưỡng, unknown usage, review và JUnit import.
  Lần sandbox đầu không tạo được temp fixture; chạy ngoài sandbox cho thấy SQLite connection chưa đóng khi cleanup trên Windows, đã sửa đóng connection rõ ràng và chạy lại qua.
- Đã thử plan-only CLI, scanner public metadata và `git diff --check`; nhận diện đủ bốn testcase từ Surefire XML Java 21 đã có, không chạy lại provider/mock Java hoặc ghi chúng thành kết quả API thật.

Chưa thực hiện `--execute`, chưa dùng key hoặc đo latency/usage/chất lượng thật.
Next gate vẫn là Linux Docker engine và image source Phase 10 để chạy smoke container, sau đó cấu hình key chỉ backend và chạy bộ API thật/review.
Không đóng Phase 10 và chưa triển khai UI Phase 11.

2026-11-22 (+07), bước 6 — smoke Linux sau khi cài Docker Desktop:
Đã khởi động và xác minh Linux engine 29.9.3, Docker CLI 29.9.3 và Compose 5.7.0.
Build backend/frontend từ source hiện tại; image backend chạy Temurin Java 21.0.12.1+1 và đóng gói native SQLite Linux.
Vision/recipes dùng image public `2.0.0-rc.2` không sửa, Qdrant `v1.19.2`.
Cả bốn image ứng dụng được gắn tag local `phase10-local/cooklens-<service>:2.0.0-rc.3` để chạy bộ kiểm tra version nhất quán; đây không phải bản phát hành/push mới.

- `smoke_backend_stack.py`: qua với AI thật, tìm đủ 30 món, API/session/schema 3, non-root/read-only, volume/restart, orphan pending/reservation và no-key replay không gọi provider.
- `smoke_frontend_container.py`: qua static metadata/notices, Nginx config, giới hạn upload/JSON, error envelope/request ID, topology và backend stop/recovery.
- `smoke_release_stack.py --samples 100`: qua seed mới/lặp, persistence, upgrade/rollback, bundle sai, dependency stop/recovery, full offline flow và warm latency targets của luồng ảnh/công thức.
  Số đo và giới hạn được ghi riêng ở [acceptance](../acceptance.md#kiểm-chứng-source-phase-10-trên-docker-desktop).
- Deploy suite 44/44 qua, không skip, với Docker/Compose vừa cài; public metadata scanner và diff check qua.
  Đã đóng rõ connection SQLite khi smoke đọc bản sao để temp cleanup hoạt động trên Windows.

Các runner chạy project/volume dùng một lần, key bị ép trống; đã xác minh cả hai project test được thu dọn, không để stack test chạy nền.
Report nằm trong `backend/target/phase10-docker/20261122T122804Z/`, không thêm raw log/DB vào docs hoặc Git.
Đã tạo `.env` bị Git ignore với model/endpoint mặc định và tag local; `LLM_API_KEY` vẫn trống.
Không có API LLM thật, measurement chất lượng/token/latency LLM hoặc kiểm chứng HTTPS bằng call provider trong bước này.
Gate tiếp theo: người dùng thêm key NVIDIA vào `.env` chỉ backend, chạy 50 request cố định và human review; CI/tích hợp theo checklist vẫn cần hoàn tất trước Phase 11.

2026-11-22 (+07), bước 6 — baseline API NVIDIA thật:
Người dùng cung cấp key qua `.env` bị ignore; khởi động project chính `cooklens` bằng bộ tag local đã smoke, không in key hoặc expanded Compose config.
Đã chạy nguyên fixture cố định: 26 single-turn và 3 hội thoại 8 lượt, tổng 50 request tuần tự, không retry, không lỗi HTTP/contract, không đổi recipe/bước/history ngoài ý muốn.
Token usage lấy từ snapshot nguyên thư mục data sau khi dừng backend, mở SQLite read-only và ghép bằng hash call; đủ cả 50 usage/model.
Backend đã khởi động lại; hội thoại thật 8 lượt còn nguyên và replay operation trả latest state giống hệt, ledger vẫn 50 call, không gọi thêm provider.
Bốn controlled case được import từ Surefire Java 21 đã có của cùng source; không coi chúng là request API thật mới.
Rà trong memory xác nhận key chỉ ở backend, không có trong env frontend/AI/Qdrant, backend log, frontend assets hoặc artifact evaluation; không lưu raw log/inspect vào report.

Kết quả tổng thể `evaluation_passed=false`: latency không đạt cả ba ngưỡng, usage đạt; số đo nằm ở [acceptance](../acceptance.md#baseline-api-llm-thật-phase-10).
Review formal giữ nguyên pending, không tự điền pass từ HTTP 200 hoặc keyword; đã lưu ghi chú sơ bộ của agent, không tự nhận human/independent review.
Ghi chú phát hiện P03 cộng sai lượng muối, N02/I03 gán thêm định lượng ngoài corpus vào phần theo công thức, M04 đoán nguyên liệu trong câu hỏi mơ hồ và T01.08 nói thiếu instruction đã tồn tại.
Đây là vấn đề cần xử lý trước khi nghiệm thu, không phải kết quả quality pass.
Report, usage snapshot, review template, provisional findings và check restart/key nằm trong `backend/target/assistant-evaluation/`, lần đo bắt đầu 12:55:23 UTC.

Không đổi prompt/model/timeout/fixture/ngưỡng hoặc trộn kết quả của các lần đo trong baseline này; không có commit/push hay publish image.
Tiếp theo: sửa grounding/attribution, cách hiểu định lượng tổng/phân bổ và câu hỏi mơ hồ; điều tra latency riêng trước khi đo lại nguyên bộ, giữ kết quả baseline và yêu cầu human review.
Phạm vi sửa tiếp: giữ nguyên toàn recipe/context window, thêm current instruction tách rõ và quy tắc tổng/phân bổ, khoảng/ước lượng/null, hỏi lại khi mơ hồ, trả lời ngắn và không trộn gợi ý vào dữ liệu gốc.
Theo [NVIDIA API reference](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/apireference), temperature trong khoảng lớn hơn 0 đến 1; chọn 0,1 cho model NVIDIA hiện tại, không thay top_p, model, thinking mode hoặc giới hạn nghiệm thu.
Thêm timing request-local qua header Server-Timing chỉ gồm số ms cho prepare/provider/persist/total, không lưu prompt/key/ID hoặc đổi schema SQLite/DTO.
Runner thu timing riêng khỏi HTTP latency gate để phân biệt thời gian gateway và provider boundary (gồm network/parse), không tự suy thành thời gian nội bộ NVIDIA.
Kiểm tra context đủ 33 recipe, request mapping, timing success/replay/error và parser/unknown timing; chạy regression, sinh lại OpenAPI nếu header được khai báo, build tag local mới rồi đo lại nguyên 50 ca.
Phase 10 vẫn mở; chưa bắt đầu UI Phase 11.

2026-11-22 (+07), bước 7 — grounding và chẩn đoán latency:
Đã triển khai phạm vi sửa ở trên: toàn recipe giữ nguyên, current instruction được tách thêm, quy tắc tổng/phân bổ/null/ước lượng/attribution được làm rõ và NVIDIA temperature 0,1.
Timing dùng object riêng mỗi request, không ThreadLocal/shared state, ghi cả khi provider lỗi; replay/command không gọi provider có duration provider bằng 0.
OpenAPI/type sinh từ backend đã có header tùy chọn; không thêm dependency, schema DB, public DTO, retry, fallback hoặc paid endpoint.

- Backend 68/68 qua trên Java 21, gồm 33 recipe trong context test, mapping temperature/thinking và HTTP timing/replay; deploy 45/45 qua, gồm parser timing thiếu/sai/trùng/inconsistent.
  Sau khi bổ sung assertion header trên HTTP timeout, chạy lại riêng 10/10 chat integration test qua; cập nhật controlled evidence từ XML mới, không có API thật bổ sung.
- Backend/frontend image build qua, TypeScript/Vite và Nginx config qua; tag local mới `phase10-local/cooklens-<service>:2.0.0-rc.4`, AI không đổi nội dung.
- Đã chạy lại đúng fixture 50 request, không sửa câu hỏi/rubric/ngưỡng, không retry, không trộn baseline cũ; HTTP/state 50/50 qua, đủ usage/model và timing cả 50.
- Usage qua, latency vẫn fail; diagnostics chỉ ra provider boundary chiếm gần toàn bộ server time trong lần đo này, không chứng minh riêng network hay NVIDIA compute là nguyên nhân.
  Số đo so sánh và giới hạn ở [acceptance](../acceptance.md#đo-lại-sau-sửa-grounding-và-thêm-timing).
- Snapshot sau stop backend và kiểm tra restart/replay qua; conversation 8 lượt giữ nguyên, ledger toàn DB 100 call của hai lần đo và replay không tăng thêm.
  Key isolation env/log/assets/artifact qua cho key cụ thể; formal review vẫn pending, không tự điền pass.

So sánh sơ bộ của agent thấy P03 đã giữ đúng tổng 5 g muối và phân bổ 3/2 g, M04 hỏi lại thay vì đoán, M03 giữ khoảng, N02 bỏ lượng nước/nhiệt độ tủ lạnh bịa và I03 bỏ kích thước/thời gian chính xác gán cho recipe.
Chưa coi đó là quality pass: vẫn có kiến thức bổ sung không tách attribution, diễn đạt thiếu thời gian dù text instruction có mốc, tự gợi ý thay nguyên liệu trong câu hỏi dị ứng và lẫn một thuật ngữ tiếng Hàn.
Ghi chú sơ bộ và review template nằm trong `backend/target/assistant-evaluation/`, lần đo bắt đầu 13:19:18 UTC; baseline 12:55:23 UTC giữ nguyên.
Giữ model Ultra đã chọn, không tự nới ngưỡng hoặc bật model/endpoint khác; cần quyết định hướng model cho latency và tiếp tục xử lý các vấn đề chất lượng trước khi đóng phase.

Hướng tiếp theo theo yêu cầu người dùng hoàn thành sớm nhất: được chọn model thay thế, giữ Ultra để rollback, không đổi ngưỡng hoặc dùng endpoint trả phí chưa xác minh.
Chọn thử `google/gemma-4-31b-it` qua cùng NVIDIA API/key: [model page](https://build.nvidia.com/google/gemma-4-31b-it) có free endpoint Available, catalog `/v1/models` trả đúng ID và [API reference](https://build.nvidia.com/google/gemma-4-31b-it/apireference) dùng cùng Chat Completions/usage.
Chỉ mở whitelist trial cho đúng model và host/path HTTPS này, temperature 0,1, không gửi thinking kwargs của Nemotron cho Gemma; thêm kiểm tra mapping và pricing guard.
Làm rõ giới hạn dị ứng (không tự gợi ý thay nguyên liệu/thuốc), current step và phân biệt duration field null với mốc trong instruction text.
Chạy test rồi build tag local mới, screen ngắn qua backend với câu hỏi đã có trước khi quyết định chạy toàn 50 ca; screen không thay nghiệm thu hoặc được gộp vào chỉ số final.
Gemma screen dừng ngay request đầu sau provider deadline 20 s, không retry; không tiếp tục full suite hoặc coi trial available là bằng chứng latency.
Ứng viên tiếp theo là [Nemotron 3.5 Bolt E4B](https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b), free endpoint Available, đúng ID trong catalog; dùng thinking off/temperature 0,1 theo API reference, cùng giới hạn và billing guard.
[Bolt API reference](https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b/apireference) yêu cầu standalone gateway dùng alias `stg/nvidia/nemotron-3.5-bolt-e4b`; chỉ whitelist alias này, chấp nhận response đúng alias hoặc đúng canonical model đã công bố, không nới validation model khác.
Screen staging alias trả service error ngay ca đầu, không retry; kiểm tra tiếp canonical ID do catalog production trả về và model page dùng trong code example.
Whitelist chỉ thêm chính canonical ID này, không mở model tùy ý; log chẩn đoán chỉ ghi HTTP status số hoặc model-mismatch cố định, không body/prompt/ID/key.
Canonical Bolt screen 7 ca hoàn tất, không đổi state; chọn Bolt để chạy bộ đầy đủ tiếp theo, không coi screen là pass toàn bộ.
Screen lộ định lượng dạng exponent do JSON BigDecimal; sửa serialization context thành plain decimal trên mapper copy và yêu cầu cách viết số thông thường, giữ nguyên giá trị/snapshot persisted.
Lần Bolt đầy đủ đầu hoàn tất 50/50 và qua latency; đọc nội dung thấy một số câu chỉ trả bước hiện tại thay vì tóm tắt món, từ chối phép tính tỉ lệ được yêu cầu rõ và nhắc quy tắc thay vì tóm tắt hội thoại.
Chỉnh một vòng quy tắc chung: cho tóm tắt toàn recipe/tính số học có nhãn nhưng không mutate recipe; tóm tắt nội dung hội thoại thay vì instruction, hướng dẫn tạo phiên mới khi đổi món và nhắc tiếp xúc chéo trong câu hỏi dị ứng.
Giữ fixture/ngưỡng, xác minh lại context đủ 33 recipe rồi đo lại nguyên bộ; không gộp lần Bolt đầu vào nghiệm thu cuối.
Bolt sau chỉnh vẫn qua latency nhưng review sơ bộ thấy nói không có lời khuyên trong history dù có, nên chưa chấp nhận quality.
Thử [Nemotron 3.5 Lightning 30B-A3B](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b), free endpoint Available và có trong catalog; cùng thinking off/temperature 0,1, thêm đúng whitelist và mock mapping.
Làm rõ history là bằng chứng về hội thoại (không sửa recipe), và trả lời phần nấu ăn của câu hỏi nhiều ý trước khi từ chối thao tác ngoài quyền; không thay fixture hoặc ngưỡng.
Lightning screen dừng ở request thứ sáu do timeout, đồng thời vẫn đoán sai câu mơ hồ; Gemma 4 với context rút gọn vẫn timeout ca đầu, không chấp nhận hai ứng viên này.
Gộp các quy tắc prompt trùng/lệch thành một bộ ngắn giữ nguyên grounding/safety/state; Bolt screen tiếp theo đã trả đủ phần giải thích và từ chối thao tác nhưng còn phân biệt history/nguồn yếu.
Ứng viên cuối cùng trong đợt chọn model này là [Nemotron 3.5 Super VL 120B-A12B](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), free endpoint Available và có trong catalog; chỉ gửi text, thinking off, giữ giới hạn và screen trước full run.
Endpoint Super trả registered model `private/nvidia/nemotron-3.5-super-120b-a12b` trong các request xác thực; lỗi ban đầu do exact-name guard, không phải endpoint không phản hồi.
Chỉ chấp nhận đúng cặp request/response đã quan sát, lưu tên model thực tế trong chat turn, không wildcard/fallback; mọi tên khác vẫn fail.
Đây là operational mapping từ endpoint, không xác nhận checkpoint hoặc năng lực VL tương đương: [thảo luận trên NVIDIA forum](https://forums.developer.nvidia.com/t/nemotron-3-5-super-vl-unexpected-model-id-in-nvidia-build-api-response/386280) cũng ghi nhận khác biệt nhưng chưa có xác nhận chính thức về checkpoint.
Chỉ đánh giá nội dung text thực tế được phục vụ, ghi cả requested/reported model; bỏ log tên model động sau khi xác định, chỉ giữ diagnostic category cố định.

2026-11-22 (+07), bước 8 — chọn đường hoàn thành nhanh nhất:
Đã chọn endpoint Super hiện có thay vì tiếp tục dùng Ultra chậm, giữ các phiên/ledger và tag cũ để rollback; không bật paid endpoint, retry, fallback hoặc đổi ngưỡng.
Candidate local `phase10-local/cooklens-<service>:2.0.0-rc.16`, selector `nvidia/nemotron-3.5-super-vl-120b-a12b`, reported model `private/nvidia/nemotron-3.5-super-120b-a12b`.
Context rút gọn các chỉ dẫn trùng, giữ đủ recipe, plain-decimal quantities, quy tắc tổng/phân bổ, hỏi lại mơ hồ, history và giới hạn an toàn/thao tác.
Chỉ dùng text, temperature 0,1, `reasoning_effort=none`, output tối đa 512, timeout 20 s và input estimate tối đa 6000; không xác nhận checkpoint/VL tương đương từ tên serving.

- Full backend Java 21: 73/73 qua, không skip, gồm mỗi model profile/alias guard, pricing exact host/model, đủ 33 recipe, timing success/replay/error, SQLite/migration và restart JVM.
- Deploy/tooling: 48/48 qua, không skip, gồm ba test mới cho form review, chống model HTML/script và không preselect/submit quality.
- Candidate đầy đủ: nguyên 50 request cố định hoàn tất, state/latency/usage qua; 4 controlled faults lấy từ Surefire mới cùng source, không gọi provider thật để tiêm lỗi.
  Số đo nằm ở [acceptance](../acceptance.md#candidate-super-qua-các-gate-kỹ-thuật).
- Restart/replay hội thoại thật 8 lượt qua, ledger toàn bộ các lần đo/screen giữ 308 call trước/sau replay, không có thêm provider call.
- Key isolation env/log/assets/artifact qua cho key cấu hình; record token usage từ snapshot nhất quán, không đưa key/transcript/DB vào Git/docs.
- Review page: Edge headless render được mobile width không overflow, 50 câu/300 criterion đều unset, export disabled; kiểm thử pass/fail/export/attestation chỉ thao tác dữ liệu synthetic với report ID khác.
  Không click phê duyệt câu trả lời thật bằng automation và không điền review formal.

Run được chọn bắt đầu 15:30:30 UTC, report/usage/model-routing/review.html trong `backend/target/assistant-evaluation/`.
Agent đã đọc và ghi chú các điểm cần human check ở N03/N08/M05/S01/T01.08/T02.02; ghi chú không tự nhận chất lượng đạt hoặc reviewer độc lập.
`evaluation_passed=null` vì chỉ còn quality trong bộ evaluation chờ human review; các gate kỹ thuật không thay cho chất lượng nội dung.
Sau khi người dùng đánh giá/export review, summarize đúng run; nếu pass mới đóng phần nghiệm thu, rồi hoàn tất PR/CI theo workflow trước Phase 11.
Không tự commit/push, publish image hoặc bắt đầu nghiệm thu UI Phase 11 trong bước này.
