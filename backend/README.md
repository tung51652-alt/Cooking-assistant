# CookLens public gateway

Java 21, Spring Boot 3.5.16, Maven 3.9.11, springdoc 2.9.1; multipart streaming dùng Apache Commons FileUpload 2.0.0-M5 (Jakarta Servlet 6). Tham khảo [Spring Boot requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html), [springdoc compatibility](https://springdoc.org/v2/) và [Apache streaming API](https://commons.apache.org/proper/commons-fileupload/streaming.html). Dependency trực tiếp được pin trong pom; transitive/plugin versions do parent Spring Boot quản lý. Image runtime Temurin 21.0.12.1, user 10001, read-only, budget 512 MiB/2 CPU; Maven/JDK chỉ nằm ở build stage.

## Trách nhiệm

- `controller`: public routes và schema sinh OpenAPI; `dto`: typed records theo contract snake_case.
- `service`: điều phối, validation, chọn món rõ ràng, chuẩn hóa query và readiness cache một giây.
- `client`: HTTP độc lập vision/recipes, connect hai giây, deadline vision 15 giây/recipes năm giây; response tối đa 1 MiB. Không tự retry, không follow redirect.
- `config`: tải manifest/taxonomy từ cùng file nguồn của AI, CORS allowlist, nonblocking receive guard và probe Docker chỉ dùng JDK.
- `exception`: status/code/message public, không trả message/stack/path upstream.

Phiên nấu dùng SQLite JDBC 3.51.0.0, không thêm JPA hoặc container database.
Không thêm tài khoản, lưu ảnh hoặc state xác nhận.
Hai AI service không gọi ngược backend.
Không hardcode danh mục món trong Java; Maven đưa hai file authoritative vào classpath khi build.

## Chạy local

Cần JDK 21 đầy đủ và Maven; Java runtime đơn thuần không biên dịch được. Hai AI service phải chạy với artifact/version trong manifest.

```sh
mvn -f backend/pom.xml test
VISION_URL=http://127.0.0.1:8000 RECIPES_URL=http://127.0.0.1:8001 \
  mvn -f backend/pom.xml spring-boot:run
```

Swagger: http://127.0.0.1:8080/swagger-ui/index.html. OpenAPI sinh từ controller/DTO tại `/v3/api-docs`; không duy trì YAML riêng. Routes `/api/vision/predict`, `/api/dishes`, `/api/recipes/search`, `/api/recipes/{id}`, `/api/health`. Frontend vẫn dùng `/api` relative; Phase 4 nối và nghiệm thu UI.

Release dùng cùng origin; mặc định CORS trống. Nếu chạy Vite khác origin, đặt `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Không wildcard/credentials. Không tin Forwarded headers từ caller; reverse proxy Nginx được cấu hình trong Compose gốc.

## Phiên nấu (source Phase 9)

`/api/assistant/sessions`, `/{id}`, `/{id}/actions` và `/{id}/messages` được mô tả trong [contract](../docs/contracts/mvp-v1.md#phiên-trợ-lý-phase-89).
Phiên lấy snapshot công thức từ gateway, tồn tại 24 giờ và giữ tối đa 100 action có operation ID/version.
Hỏi đáp dùng provider khi có key/config/pricing hợp lệ; thiếu cấu hình trả `ASSISTANT_NOT_CONFIGURED`, điều khiển bước không cần key/LLM.
Web/Expo chưa có giao diện phiên; dùng client chung `getRecipeDocument`, `createSession`, `getSession`, `sessionAction`, `sessionMessage`.
`getRecipeDocument` giữ corpus version cần cho tạo phiên; `getRecipe` cũ vẫn trả recipe như trước.

`ASSISTANT_DB_PATH` mặc định là `${user.home}/.cooklens/assistant.sqlite` khi chạy Spring trực tiếp.
Trong Compose, backend dùng `/app/data/assistant.sqlite` trên volume `assistant-sessions`.
Schema khởi tạo khi truy cập phiên lần đầu; schema lạ hoặc lỗi ghi chỉ ảnh hưởng API trợ lý.
Source Phase 10 dùng schema 3, migrate schema 1/2 trong transaction và giữ phiên/action/chat/replay cũ.
`/messages` đã nối provider/context với operation pending/completed/failed; lưu reply nguyên cặp và bỏ reply khi state đã đổi/hết hạn.
Revision phiên tính cả action và chat turn đã commit; action history có thể có khoảng trống version.
Mỗi lần load kiểm tra snapshot và bất biến state/history trước khi trả dữ liệu hoặc ghi action; dữ liệu lưu sai trả storage 503, không tự sửa.
Snapshot hợp lệ từ corpus cũ được giữ nguyên, không so version với manifest hiện tại khi đọc.
Không log session ID/nội dung hội thoại hoặc chia sẻ ID phiên vì ID là quyền truy cập phiên.
Native library SQLite được đóng gói tại `/app/sqlite` để dùng được với `/tmp` noexec và root filesystem read-only.

## Adapter trợ lý (source Phase 10)

`ChatProvider` có adapter Chat Completions tương thích OpenAI dùng Java HttpClient, không thêm SDK.
`ChatContextBuilder` lấy recipe snapshot/state server, tách system instruction khỏi dữ liệu và giữ tối đa 6 cặp hội thoại gần nhất.
Adapter/context builder đã nối `/messages`, kiểm chứng bằng HTTP provider giả.
Context giữ nội dung nấu ăn và nguồn, loại `source.modifications` chứa ghi chú biên tập, thêm current instruction tách rõ.
Số lượng ingredients là tổng, instructions là phân bổ, dữ liệu null/ước lượng không được biến thành số chính xác.
Các trial profile được chọn đặt temperature 0,1, không sửa top_p; Nemotron dùng thinking off, Super dùng `reasoning_effort=none`, Gemma không nhận kwargs của Nemotron.
Ưu tiên câu trả lời ngắn, hỏi lại câu mơ hồ và tách rõ gợi ý.
Header `Server-Timing` chỉ chứa số ms prepare/provider/persist/total để chẩn đoán, không chứa session ID hoặc nội dung.
Compose forward config chỉ cho backend và thêm bridge egress; smoke Linux container/schema 3/restart đã qua trên Docker Desktop.
Baseline NVIDIA Ultra fail latency; lần đo Super trước đây qua 50/50 HTTP/state, latency và usage, còn chờ human quality review.
Provider hiện tại là Gemini do người dùng chọn; kết quả từng lần đo ở [acceptance.md](../docs/acceptance.md).

| Biến môi trường | Mặc định / giới hạn |
| --- | --- |
| `LLM_PROVIDER` | `openai`; giá trị khác trả `ASSISTANT_PROVIDER_UNSUPPORTED` khi dùng trợ lý |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai`; HTTPS, không credential/query/fragment; HTTP chỉ loopback cho mock hoặc local endpoint |
| `LLM_MODEL` | `gemini-3.5-flash-lite`; Google AI Studio key, `reasoning_effort=minimal` cho cả 3.5 và 3.1 |
| `LLM_API_KEY` | Trống; chỉ cấp runtime backend, không đưa vào Git/client/image/log |
| `LLM_TIMEOUT_SECONDS` | `8`, cho phép 1–20; deadline chung gồm retry/backoff; mỗi attempt tối đa 4 s, connect tối đa 2 s |
| `LLM_MAX_OUTPUT_TOKENS` | `512`, cho phép 1–512 |
| `LLM_MAX_INPUT_TOKENS` | `6000`, cho phép 1–6000 estimated input tokens |

Settings được kiểm tra khi dùng trợ lý, không làm startup/readiness ảnh/công thức thất bại do thiếu key hoặc giá trị cấu hình chat sai.
Admission ước lượng mỗi message bằng `ceil(UTF-8 bytes / 3) + 16`, cộng 32 mỗi prompt; không dùng ước lượng này làm usage/billing thật.
History tối đa 2.500 estimated tokens; toàn nội dung tối đa 20.000 byte UTF-8 và JSON request 64 KiB.
Bỏ nguyên cặp history cũ để vừa trần; không cắt recipe/câu hỏi bắt buộc.
Adapter không streaming/tools/redirect/fallback; với model Nemotron 3 Ultra đặt `enable_thinking=false`.
Retry tối đa một lần cho timeout, HTTP 502/503 hoặc lỗi kết nối `ConnectException`, backoff 300 ms, chỉ khi deadline còn hơn 800 ms.
Mỗi attempt dùng tối đa 4 s hoặc thời gian còn lại (lấy giá trị nhỏ hơn); mặc định tổng 8 s. `.env` cũ đặt 20 s vẫn chỉ có tối đa hai attempt 4 s và backoff, khoảng 8,3 s cộng overhead.
Không retry auth/quota/response sai định dạng; timeout cuối vẫn trả 504. Request timeout được hủy trước retry; Google có thể vẫn xử lý và tính phí request đó.
Response tối đa 1 MiB, chỉ nhận final content; reply rỗng/truncated/tool call, model sai hoặc usage sai bị từ chối với lỗi public cố định.
Usage thiếu giữ null; usage hợp lệ đi kèm cả failure để orchestration có thể giữ chi phí của call thất bại hoặc stale.
Xem [model](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) và [API](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/apireference) NVIDIA; API thật, chất lượng tiếng Việt và latency chưa được nghiệm thu.

Gemini dùng [API tương thích OpenAI](https://aistudio.google.com/docs/openai), không thêm SDK hoặc service.
Policy 3.5 xác minh ngày 27/11/2026 dùng trần [Standard paid](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite): $0,30 input / $2,50 output mỗi triệu token, kể cả khi key dùng free tier.
Giữ policy 3.1 đã xác minh ngày 25/11/2026: $0,25 input / $1,50 output mỗi triệu token; không tự fallback giữa hai model.
Reservation lấy [trần input model 1.048.576 token](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite) và output tối đa đã cấu hình, không coi admission estimate là token billing.
Với output 512, giữ chỗ $0,631706 cho 3.5 hoặc $0,525824 cho 3.1, gồm tối đa hai attempt trước call; settle bằng usage thật nếu không retry sau timeout.
Sau retry do timeout, giữ usage unknown và toàn reservation, kể cả attempt thứ hai thành công hoặc trả response không hợp lệ; không dùng riêng usage của attempt thứ hai để suy tổng chi phí.
Ledger tính theo trần giá đã xác minh, không thay hóa đơn Google hoặc tự suy free quota.
Không gửi tools, ảnh hoặc caching trong request chat; chỉ recipe snapshot và hội thoại text.

Pricing còn cho phép HTTPS `integrate.api.nvidia.com/v1/chat/completions` và whitelist trial: Ultra, Gemma 4 31B, Bolt E4B (canonical/staging alias), Lightning 30B-A3B và Super VL 120B-A12B.
Whitelist billing không đồng nghĩa đã đạt chất lượng/latency: Gemma/Lightning có screen timeout, Bolt nhanh nhưng còn yếu history; xem [Phase 10](../docs/plan/phase-10-llm.md).
Super endpoint báo model `private/nvidia/nemotron-3.5-super-120b-a12b`; chỉ pin cặp request/reported này và ghi đúng reported model, không khẳng định checkpoint/VL tương đương khi NVIDIA chưa xác nhận.
Không tự fallback; mọi endpoint/model khác cần policy billing đã xác minh trước khi dùng chat HTTP.
Ledger `llm_calls` lưu micro-USD và usage nullable, không prompt/reply/key; dùng key đã hash và tồn tại độc lập việc purge phiên.
Reservation/rate admission và operation pending được nhận nguyên tử; provider chạy ngoài writer transaction, usage được lưu trước commit reply.
Giới hạn 12 attempts/60 s/phiên gồm lỗi, không tính replay/command; tổng bốn request nghiệp vụ vẫn do RequestGuard quản lý.
Cảnh báo $5 một lần mỗi tháng UTC qua log cố định và marker SQLite; từ chối tại $10 hoặc nếu reservation mới làm vượt $10.
Usage thiếu giữ reservation, không suy ra 0 token/chi phí từ việc provider không trả usage.
Các lệnh nguyên câu `bắt đầu`, `bước tiếp`, `bước trước`, `nhắc lại`, `kết thúc` sau trim/NFC/lowercase dùng chung action logic, không gọi LLM hoặc chiếm quota chat.
Replay command phải giữ text/body/operation ID gốc; dùng lại ID qua route/body khác trả conflict.

## Docker

Chạy toàn dự án từ root bằng `docker compose up`; truy cập qua http://localhost:8080/.
Backend nối mạng internal `application` và bridge `llm-egress`, không publish cổng riêng. Dockerfile ở `backend/Dockerfile`;
[development.md](../docs/development.md) mô tả build source khi cần.

OpenAPI/Swagger của backend giữ nội bộ. Với stack đang chạy,
`sh deploy/scripts/generate_frontend_contract.sh` lấy schema qua recipes container và sinh type.
Nếu chạy Spring trực tiếp, đặt `API_SCHEMA_URL=http://127.0.0.1:8080/v3/api-docs` trước lệnh.
Probe liveness chỉ phản ánh process; `/api/health` kiểm tra cả hai AI đúng version,
không inference, cache dependency một giây. Không expose Actuator debug/config.

## Giới hạn và kiểm thử

Guard giữ tối đa bốn request nghiệp vụ, gồm thời gian nhận body; quá tải trả ngay 503. Body vision tối đa 11 MiB, từng file 10 MiB; search 8 KiB, kể cả chunked. Servlet nonblocking nhận body với deadline tổng 15 giây cho upload/năm giây cho JSON, đọc trong RAM, không tạo file tạm. Multipart chỉ nhận đúng một trường file JPEG/PNG. Decode/pixel/frame/bomb checks do vision thực hiện; backend không giải mã ảnh lần hai. Tomcat HTTP connections/accept queue cũng được chặn ở mức hữu hạn; health không giữ slot AI.

JUnit dùng cổng HTTP thật và dependency server giả lập để kiểm tra lỗi, version, deadline, response quá lớn, request ID, strict JSON, upload chunked, ngắt kết nối, quá tải, nguồn URL và readiness. Fixture prediction dùng chung với Phase 1; corpus test lấy trực tiếp file Phase 2, không chép một bản dữ liệu khác. Smoke Compose riêng kiểm chứng CV thật → chọn ứng viên thứ hai → tìm/detail, đủ 30 món, dừng/khởi động AI, AI network internal, một lượt toàn luồng khi tháo browser bridge của backend, non-root/read-only và probe. Fault injection không được tính vào metric retrieval.

Trong Phase 3, type frontend được sinh tự động từ OpenAPI; UI tích hợp và nghiệm thu với backend thật ở Phase 4. App Expo là client riêng đã tích hợp qua PR #17; không tạo APK.
