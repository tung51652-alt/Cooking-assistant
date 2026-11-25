# Kết quả nghiệm thu

Bộ ứng viên **2.0.0-rc.2**, Linux amd64/CPU. Kiểm thử kỹ thuật gần nhất: **2026-11-22**.
Các gate kỹ thuật đã đạt;
[PR nghiệm thu #20](https://github.com/tung51652-alt/Cooking-assistant/pull/20) là đầu mối review.
Bản chính thức `v2.0.0` chưa phát hành.

Các số đo chính của ứng viên public dưới đây chỉ áp dụng luồng nhận diện/tra công thức.
Source trợ lý trong [kế hoạch MVP](plan/assistant.md) đã có kiểm chứng mock/container riêng ở cuối trang; API LLM thật và giao diện vẫn chưa nghiệm thu.

## Số đo chính

| Hạng mục | Kết quả |
| --- | --- |
| CV, 5.004 ảnh/30 lớp | Top-3 96,0831%; Top-1 87,5699%; Macro F1 0,876567 |
| Retrieval, 204 query/30 món | Hit@1/Hit@3/MRR = 1; không sai món; 18 holdout đạt Hit@1 = 1 |
| Luồng ảnh đại diện | 30/30 luồng qua; Top-3 đúng ở 28/30 ảnh, tách khỏi thành công sửa món |
| Browser thật | 10/10 ca desktop/mobile; gồm ảnh ngoài miền và nhiều món |
| Regression | 28 deploy, 7 data, 13 backend và 20 browser mô phỏng đều qua |
| Runtime, 100 mẫu/API | P95 vision 0,1614 s; search 0,0887 s; cold start 37,336 s |
| Cùng giới hạn 4 logical CPU | P95 vision 0,6225 s; search 0,9101 s |

Fresh seed, seed lặp, persistence, upgrade/rollback, bundle sai, dependency recovery
và offline đều qua. Ảnh lỗi trả 400, upload quá lớn trả 413, món ngoài danh mục
trả 422, recipe không tồn tại trả 404. Ba ảnh confidence dưới 0,3 vẫn qua luồng xác nhận/sửa món.
Fixture UI chỉ dùng kiểm tra luồng, không dùng để tính accuracy.

## Tài nguyên runtime

Tất cả service dùng chung 4 logical CPU; cold start 49.534 s.
Peak dưới đây đo riêng từng service, không cộng thành peak đồng thời toàn stack.

| Service | Giới hạn RAM (MiB) | Peak RAM (MiB) |
| --- | --- | --- |
| `qdrant` | 512 | 79.2 |
| `vision` | 1024 | 414.4 |
| `recipes` | 2048 | 755.1 |
| `backend` | 512 | 258.9 |
| `frontend` | 128 | 8.3 |

## Phân phối và mobile

- Registry: bốn image ứng dụng public đã pull ẩn danh và kiểm tra trên runner sạch.
- Expo: [PR #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17) tích hợp
  client dùng chung API. Người dùng xác nhận upload ngày 2026-10-26; kiểm thử đầy đủ
  Android/iOS, camera/HEIC, permission, Back và accessibility còn mở.

## Giới hạn diễn giải

- Top-3 bằng baseline lịch sử; Top-1 thấp hơn khoảng 0,0400 điểm phần trăm (hai ảnh).
  Chưa xác định nguyên nhân khác biệt.
- Ảnh tải lại từ [mirror 30VNFoods](https://huggingface.co/datasets/vuongnhathien/30VNFoods)
  khớp tên/class trong manifest; chưa chứng minh byte identity với dữ liệu lịch sử.
  License mirror CC BY-NC-SA 4.0 chưa giải quyết mọi mâu thuẫn quyền upstream.
- 27 món chỉ có một ứng viên: điểm retrieval không chứng minh ranking trên corpus lớn.
- Review công thức do cùng agent triển khai,
  không tự nhận reviewer độc lập. Thử nấu đã bỏ khỏi gate theo yêu cầu người dùng.
- Giới hạn 4 CPU được thử trên host 8 logical CPU/khoảng 7,6 GiB RAM, có CV chạy
  đồng thời; chưa xác định cấu hình vật lý tối thiểu. Peak RAM theo service không phải peak đồng thời.
- Image audit tập trung phần do dự án quản lý, không phải toàn bộ binary upstream.

Cách chạy lại ở [testing.md](testing.md); công việc tiếp theo ở [plan/mvp.md](plan/mvp.md).

## Kiểm chứng source Phase 10 trên Docker Desktop

2026-11-22 (+07): backend/frontend build từ source hiện tại; vision/recipes giữ image public `2.0.0-rc.2`, Qdrant `v1.19.2`.
Tag đồng bộ `phase10-local/cooklens-<service>:2.0.0-rc.3` chỉ tồn tại local, không thay bộ ứng viên public ở trên hoặc xác nhận một release mới.
Engine Linux 29.9.3/Compose 5.7.0, x86_64, 16 logical CPU và khoảng 7,6 GiB RAM cấp cho Docker; không ép cả stack dùng chung bốn CPU.

| Kiểm tra | Kết quả |
| --- | --- |
| Backend integration | Qua 30 món, non-root/read-only, schema 3, volume/restart và orphan reservation/replay |
| Frontend proxy/static | Qua metadata/notices, lỗi/giới hạn request, mạng và backend recovery |
| Lifecycle/offline | Qua fresh/repeat seed, persistence, upgrade/rollback, bundle sai, dependency recovery và offline full flow |
| Warm tuần tự, 100 mẫu/API | P95 vision 0,0839 s; search 0,0842 s |
| Startup với image đã có | Cold start 23,773 s; seed 0,801 s |
| Deploy regression | 44/44 qua, không skip |

Đây là smoke với cùng fixture ảnh lặp lại, không phải tập accuracy mới, cấu hình tối thiểu hoặc kết quả latency LLM.
Report local ở `backend/target/phase10-docker/20261122T122804Z/`; các project/volume test đã thu dọn.
Không thực hiện clean registry pull của bộ tag local, gọi provider, đo usage/chất lượng chat hoặc review API thật trong lần này.

## Baseline API LLM thật Phase 10

2026-11-22 (+07): cùng bộ image local phía trên, adapter `openai`, endpoint NVIDIA và model `nvidia/nemotron-3-ultra-550b-a55b`, không streaming/thinking, input limit 6000 estimated tokens, output cap 512 và timeout 20 s.
Thực hiện đúng fixture đã chốt trước đo: 26 single-turn và 3 hội thoại 8 lượt, 50 request tuần tự, không retry hoặc gọi lại để chọn kết quả đẹp hơn.
Bốn ca lỗi controlled lấy từ suite Java 21/mock provider đã chạy trước đó, không tiêu thụ quota NVIDIA trong baseline này.

| Hạng mục | Kết quả | Gate |
| --- | --- | --- |
| HTTP/contract và state | 50/50 hoàn tất, recipe/bước/history giữ đúng, commit đủ cặp message | Qua kỹ thuật |
| Latency toàn HTTP `/messages` | p50 2,9140 s; p95 14,0697 s; max 16,4736 s | Không đạt 2,5 / 6 / 8 s |
| Request vượt trần 8 s | 6/50 | Không đạt |
| Usage input thật | Trung bình 1802,04; p95 2249 tokens | Qua 4000 / 6000 |
| Usage output thật | Trung bình 111,4; max 414 tokens | Qua 350 / 512 |
| Sau backend restart | Giữ hội thoại thật 8 lượt, replay không tăng ledger 50 call | Qua |
| Controlled faults | 4/4 từ Surefire của source hiện tại | Qua mock, không phải live faults |
| Chất lượng nội dung | Human review chưa hoàn tất; agent thấy lỗi grounding và xử lý câu hỏi mơ hồ | Pending, không pass |

Usage là số provider báo, lấy từ SQLite snapshot nhất quán theo hash call; không phải estimate và không đo hóa đơn/credit tài khoản.
Percentile dùng nearest rank trên toàn 50 request, không bỏ mẫu chậm; latency gồm gateway/network/provider, chưa tách nguyên nhân hoặc chứng minh lỗi riêng ở provider.
Key được kiểm tra chỉ hiện ở backend và vắng trong log/assets/artifact đã rà; không phải chứng nhận bảo mật tổng quát hoặc capture payload live.
Report/review/usage ở `backend/target/assistant-evaluation/`, lần đo bắt đầu 12:55:23 UTC; không đưa transcript/DB/key vào Git/docs.
Baseline `evaluation_passed=false`; cần sửa grounding, điều tra latency, đo lại nguyên bộ và review, không hạ ngưỡng để đóng Phase 10.

## Đo lại sau sửa grounding và thêm timing

2026-11-22 (+07), lần đo bắt đầu 13:19:18 UTC: tag local `2.0.0-rc.4`, cùng NVIDIA Ultra/endpoint, fixture, giới hạn và ngưỡng.
Thay system/context grounding, thêm current instruction, temperature 0,1 và header duration-only; giữ nguyên bản baseline, không chọn lại mẫu hoặc ghép kết quả.

| Hạng mục | Baseline | Lần đo mới | Gate mới |
| --- | --- | --- | --- |
| HTTP/state | 50/50 | 50/50 | Qua kỹ thuật |
| HTTP latency p50 | 2,9140 s | 2,6657 s | Không đạt ≤2,5 s |
| HTTP latency p95 | 14,0697 s | 8,4751 s | Không đạt ≤6 s |
| HTTP latency max | 16,4736 s | 13,8669 s | Không đạt ≤8 s |
| Request >8 s | 6/50 | 3/50 | Không đạt |
| Input trung bình / p95 | 1802,04 / 2249 | 2157,68 / 2572 tokens | Qua |
| Output trung bình / max | 111,4 / 414 | 97,26 / 330 tokens | Qua |
| Provider boundary p95 | Chưa đo | 8,4540 s | Diagnostic |
| Prepare + persist p95 | Chưa đo | 23,551 ms | Diagnostic |
| Provider / server time tổng | Chưa đo | 99,4413% | Diagnostic |

Timing đủ cả 50 request; provider boundary bao gồm HTTP/network/parse, server total không gồm serialize/proxy/client, không phải thời gian riêng NVIDIA compute.
Số đo mới thấp hơn baseline nhưng không tách được tác động prompt/temperature và biến thiên network/provider; không khẳng định quan hệ nhân quả từ hai lần đo.
Human review vẫn pending, có cải thiện ở lỗi tổng muối/câu hỏi mơ hồ nhưng còn vấn đề attribution và tư vấn bổ sung cần xử lý; `evaluation_passed=false`.
Restart/replay/key-isolation qua; ledger 100 call là tổng hai lần đo, replay không thêm call.
Report, usage snapshot và provisional review nằm trong `backend/target/assistant-evaluation/`, không công bố transcript/DB/key.

## Candidate Super qua các gate kỹ thuật

2026-11-22 (+07), run bắt đầu 15:30:30 UTC: tag local `2.0.0-rc.16`, cùng endpoint NVIDIA, fixture/ngưỡng cố định và 50 request tuần tự không retry.
Selector `nvidia/nemotron-3.5-super-vl-120b-a12b`, reported model `private/nvidia/nemotron-3.5-super-120b-a12b`; endpoint đã trả cặp này trong các request xác thực và được pin riêng trong adapter.
Không có xác nhận chính thức về checkpoint/VL tương đương; đây là nghiệm thu hành vi text thực tế của hosted endpoint, không đánh giá ảnh hoặc tự nhận identity của weights.
Temperature 0,1, `reasoning_effort=none`, không streaming, output cap 512 và timeout 20 s.

| Hạng mục | Kết quả | Gate |
| --- | --- | --- |
| HTTP/state | 50/50 hoàn tất, không mutate sai recipe/bước/history | Qua |
| HTTP latency p50 / p95 / max | 0,8659 / 2,0790 / 4,1577 s | Qua 2,5 / 6 / 8 s |
| Usage input trung bình / p95 | 2176,42 / 2552 tokens | Qua 4000 / 6000 |
| Usage output trung bình / max | 76,6 / 307 tokens | Qua 350 / 512 |
| Provider boundary p95 | 2,0399 s | Diagnostic |
| Prepare + persist p95 | 21,117 ms | Diagnostic |
| Real conversation restart/replay | 8 lượt giữ nguyên, không thêm call | Qua |
| Backend / deploy tests | 73/73 và 48/48, không skip | Qua |
| Human answer review | Chưa submit, đã có form local và ghi chú cần rà | Pending |

Usage thuộc đúng 50 hash call từ snapshot nhất quán, không ghép các screen hoặc các model khác vào sample set; ledger 308 call là tổng mọi lần đo/screen, không phải số mẫu candidate này.
Các lần thử trước giữ riêng: Gemma 4 timeout, Lightning timeout/còn đoán câu mơ hồ; Bolt qua latency nhưng còn vấn đề trả lời history và tóm tắt.
Review page không tự điền pass; headless test thật chỉ đọc layout, các thao tác đánh giá/export chỉ dùng synthetic data có report ID khác.
Chưa đánh dấu quality/evaluation/Phase 10 hoàn thành hoặc phát hành tag local; PR/CI vẫn còn mở; implementation UI Phase 11 được ghi riêng bên dưới.


## Web assistant local Phase 11

2026-11-22 (+07), candidate local `2.0.0-rc.17`: frontend mới trên cùng backend/AI của candidate Super đã đo ở trên, giữ volume hiện có.
Hai flow thật desktop/mobile qua ảnh → xác nhận → recipe → chat LLM → bước nấu → reload → kết thúc; mỗi flow một câu hỏi, không dùng làm evaluation chất lượng hoặc mẫu latency mới.
24 case trợ lý mock qua theo lần chạy ban đầu và rerun đúng bốn case được sửa; browser emulation không thay thế nghiệm thu điện thoại thật.
Build Docker/TypeScript, shared client và scanner static frontend qua; hồi quy rộng không chạy lại theo yêu cầu rút ngắn kiểm tra.
Chi tiết và giới hạn ở [Phase 11](plan/phase-11-web.md#kết-quả-kiểm-tra).
Human review Phase 10 và PR/CI vẫn mở, không tự coi hai phase đã được nghiệm thu/phát hành.

## Rà soát chuẩn bị release — 25/11/2026

Source gồm backend/web trên `develop` và Expo/gate từ PR #23; PR này còn mở tại thời điểm kiểm tra.
Các số dưới đây là hồi quy source local, không phải nghiệm thu image public mới.

| Kiểm tra | Kết quả |
| --- | --- |
| Backend Java 21 | 76/76, không lỗi hoặc bỏ qua |
| Deploy/release tooling | 65/65, gồm gate final, provider Gemini, pacing và chặn key trong metadata |
| Dữ liệu | 7/7; 33 công thức, phủ 30/30 món |
| Client dùng chung | 14/14 |
| Web Playwright, API mô phỏng | 44/44, desktop/mobile viewport |
| Expo session/controller | 22/22 |
| Build | Web, mobile TypeScript, bundle Android/iOS đạt |
| Cấu hình | Compose, Expo dependencies, actionlint và public metadata scanner đạt |
| Smoke Compose local | Contract, lifecycle, offline, restart/recreate phiên và backup/restore đạt |
| Warm P95, 100 mẫu/API | Vision 0,172 s; search 0,091 s |

Smoke dùng backend/frontend build từ source hiện tại, AI dùng lại nội dung image `2.0.0-rc.2` với tag local; không phải bộ image public mới.
Chạy từ gói ngoài source, không source bind mount; container/volume kiểm thử đã được dọn sau khi hoàn tất.
Các mẫu smoke không thay thế bộ đánh giá độ chính xác CV.
Người dùng đã cấp key Google AI Studio riêng ở runtime; API tương thích OpenAI của Google, key chỉ vào backend.
Các lần sàng lọc Gemini 3.5 Flash-Lite được giữ riêng: burst dừng ở 19/20 do 429; baseline có pacing đạt 50/50 HTTP/state và latency/usage; sau chỉnh prompt dừng ở 21/22 do Google 503.
Hai flow web thật với Gemini 3.5 chưa đạt: desktop gặp 504 timeout, mobile gặp 503 ở câu hỏi tiếp theo.
Không dùng baseline thành công để bỏ qua các lỗi provider hoặc ghép run thiếu mẫu.
Prompt đã bổ sung giữ bước gia nhiệt khi tóm tắt, nêu nguyên liệu liên quan dị ứng và diễn đạt dữ liệu thiếu bằng tiếng Việt tự nhiên.
Gemini 3.1 Flash-Lite sau chỉnh prompt qua 2/2 flow trình duyệt thật (desktop/mobile viewport), mỗi flow hai lượt chat rồi chuyển bước, reload giữ phiên và kết thúc.
Đây vẫn là kiểm chứng web; không thay thiết bị Android thật.
Lần đo 50 câu với Gemini 3.1 dừng ở 30/31 câu thành công do timeout khoảng 20 s; chưa đạt nghiệm thu.
Đọc câu trả lời còn phát hiện hỏi mơ hồ kèm hướng dẫn thừa, từ chối tính tỉ lệ và hứa kết thúc phiên dù server chưa thao tác.
Sau khi làm rõ prompt, kiểm tra lại riêng 5 ca về tóm tắt, câu mơ hồ, lượng thiếu, dị ứng và thao tác phiên đều qua HTTP/state; agent đọc lại thấy các điểm vừa sửa đã được đáp ứng.
Đây là screen có chủ đích, không thay bộ 50 câu hoặc human review.

Preview hiện chạy tại `http://localhost:8080/` bằng một project `cooklens`, image `cooklens-<service>:local`, cấu hình riêng trong `.env` bị Git ignore.
Các service dài hạn healthy; SQLite được sao chép toàn volume khi backend đã dừng, kiểm tra byte tương ứng và `integrity_check`, giữ volume gốc để rollback.
Hai flow desktop/mobile viewport đã chạy lại thành công tại cổng 8080 trên prompt cuối, gồm tổng bốn câu hỏi API thật.
Chưa có thiết bị Android kết nối; camera/quyền/background và candidate registry mới vẫn mở, không dùng kiểm chứng local để thay các gate đó.
Luồng final và giới hạn phát hành ở [Phase 14](plan/phase-14-release.md).
