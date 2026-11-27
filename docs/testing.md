# Kiểm thử

## Các lớp kiểm tra

| Lớp | Mục đích |
| --- | --- |
| Unit/contract | Taxonomy, schema, validation, client và đóng gói |
| Browser với API mô phỏng | Lỗi, retry, response đến muộn, escaping và state |
| Integration bằng image thật | CV → xác nhận món → retrieval → detail, readiness và phục hồi |
| Evaluation | Accuracy CV, truy xuất, latency và tài nguyên |

Build hoặc smoke pass không thay thế accuracy. Mỗi số đo cần ghi bộ version,
tập đánh giá, cấu hình máy, cách lấy mẫu và giới hạn diễn giải.

## Kiểm tra source

```sh
python3 -m unittest discover -s deploy/tests -q
python3 -m unittest discover -s data/tests -q
mvn -B -q -f backend/pom.xml test
npm --prefix frontend run build
npm --prefix frontend run test:e2e
node --experimental-strip-types --test packages/cooklens-api/client.test.mjs
python3 deploy/scripts/check_public_metadata.py
```

Cài dependency/toolchain theo [development.md](development.md).
Playwright cần Chromium: chạy `npx playwright install chromium` trong `frontend/`.
Kiểm tra native theo [mobile README](../mobile/README.md); browser emulation không thay thế thiết bị thật.

Suite web mặc định chạy cả `flow.spec.ts` và `assistant.spec.ts`.
Trợ lý có 12 tình huống trên mỗi viewport: lifecycle/reload, retry cùng operation, lỗi config/provider/budget, conflict, expiry, escaping, response muộn, sai session, quota và đổi recipe.
Flow LLM thật trong `real-flow.spec.ts` chỉ bật khi cả `COOKLENS_REAL_API=1` và `COOKLENS_REAL_ASSISTANT=1`, với key ở backend và candidate Phase 10/11.
Không bật cờ trợ lý cho image public cũ hoặc job chưa được cấp key.
Kết quả local và các check đã lược bỏ theo yêu cầu người dùng nằm ở [Phase 11](plan/phase-11-web.md#kết-quả-kiểm-tra).

## Nghiệm thu bộ image

[Workflow acceptance](../.github/workflows/acceptance.yml) chạy thủ công với manifest và 204 query từ tag `v2.0.0`, cùng phiên bản với các image public đang được kiểm tra.
Workflow tải test archive, đánh giá CV, chạy 30 luồng ảnh và kiểm tra browser desktop/mobile.
[Recipes runtime](../.github/workflows/recipes.yml) dùng corpus và query từ source đang được review.
Sau đó kiểm tra offline/lifecycle/rollback với 100 mẫu warm/API. Artifact ghi vào
thư mục mới trên runner để tránh dùng nhầm báo cáo cũ.

Chạy runtime trên máy đã có image:

```sh
python3 deploy/scripts/smoke_release_stack.py --samples 100 --report /tmp/cooklens-runtime.json
```

Hai runner Compose tạo project/volume riêng và thu dọn trong `finally`.
Runner [CV](../deploy/scripts/evaluate_release_vision.py) dùng đúng 5.004 entry
`Test` trong [split manifest](../data/processed/manifests/30vnfoods_clean_split_manifest.csv),
chạy offline trong image vision. Runner [flow](../deploy/scripts/accept_release_flow.py)
chọn entry đầu mỗi lớp trước inference và tách thành công sửa món khỏi accuracy.

## Tiêu chí đạt

| Hạng mục | Ngưỡng/điều kiện |
| --- | --- |
| CV | Top-3 ≥95% trên clean split cố định; báo Top-1 và Macro F1 |
| Taxonomy/corpus | Khớp 30 lớp; mỗi món có ít nhất một công thức hợp lệ và có nguồn |
| Retrieval | ≥150 query, đủ 30 món; Hit@1 ≥0,90; Hit@3 ≥0,95; không lẫn món |
| API latency | P95 vision ≤10 s, search ≤3 s; ≥100 mẫu warm, concurrency 1 |
| Runtime | Seed, persistence, lỗi seed, upgrade/rollback, dependency recovery và offline |
| Client | Xác nhận thủ công; lỗi/rỗng/retry; không hiện response cũ hoặc nguồn không an toàn |

Không yêu cầu thử nấu theo quyết định người dùng ngày 2026-11-22.
Report retrieval lịch sử còn `acceptance_gate_met=false` vì chưa có external review;
gate kỹ thuật dùng `technical_gate_met`, không đổi nghĩa flag cũ.
Kết quả và chỉ số ghi ở [acceptance.md](acceptance.md) sau khi kiểm chứng.

## Trợ lý mới trong kế hoạch MVP

Theo [kế hoạch trợ lý](plan/assistant.md), bổ sung contract/state tests và kiểm thử
web/Expo: hỏi đáp đúng recipe, chuyển bước, phiên tách biệt, khôi phục sau restart,
gửi trùng và response muộn. Giả lập timeout/429/thiếu key, sau đó kiểm tra một
provider với API thật và đo latency/usage.
Baseline 50 request thật đã chạy: state/usage qua, latency fail và quality review còn mở; xem [kết quả](acceptance.md#baseline-api-llm-thật-phase-10).

Source Phase 10 đã có HTTP/provider fault tests và test `AssistantJvmRestartTest` khởi động bốn JVM riêng với cùng SQLite.
Fixture chỉ nằm trong test source, dùng provider/pricing giả; không được đưa vào image hoặc coi là kết quả API thật.
Test kiểm tra conversation/replay, pending quá hạn, rate window, budget/warning qua process restart và readiness khi provider lỗi.
Compose tests dùng CLI parser thật, không cần engine; container smoke vẫn cần Docker Engine chạy Linux.
Các runner smoke ép key trống; không dùng API thật hoặc quota người chạy cho fault injection.
Backend smoke kiểm tra schema 3, orphan reservation trên volume qua stop/start bằng helper image recipes không có mạng, UID 10001 và rootfs read-only.
Offline smoke tạm tháo cả bridge frontend/backend, chạy luồng ảnh/công thức rồi khôi phục trong `finally`.
Ba smoke container đã chạy qua trên Docker Desktop Linux với source backend/frontend Phase 10, gồm 100 warm samples của luồng ảnh/công thức; API LLM thật có baseline riêng và chưa đạt nghiệm thu.
Kết quả và giới hạn cụ thể ở [Phase 10](plan/phase-10-llm.md).

### Bộ nghiệm thu API thật Phase 10

[Fixture cố định](../deploy/assistant-evaluation.json) có 26 ca single-turn API thật, 4 ca fault bằng mock và 3 hội thoại 8 lượt, tổng tối đa 50 request chat thật mỗi lần chạy.
Rubric và sáu tiêu chí review phải được giữ nguyên trong lần đo; sửa fixture thì chạy lại, không ghép câu trả lời của các lần khác nhau.
Runner mặc định chỉ in kế hoạch, không đọc key hoặc gọi API.
Chỉ dùng `--execute` sau khi smoke container qua trên image Phase 10 đã build và key được cấu hình riêng ở backend; image mặc định cũ chưa có trợ lý.

```sh
python3 deploy/scripts/evaluate_assistant.py
python3 deploy/scripts/evaluate_assistant.py --execute --base-url http://127.0.0.1:8080
```

Mỗi lần tạo thư mục mới trong `backend/target/assistant-evaluation/`, chứa `report.json` và `review.json`; không đưa transcript, SQLite hoặc key vào Git/docs.
Runner tạo 29 phiên riêng, start ở bước 1, không tự retry POST; lỗi API/contract dừng lần chạy, không tự gửi lại operation chưa rõ kết quả.
Latency đo toàn HTTP `/messages`, không loại request lỗi khỏi báo cáo; p50/p95 dùng nearest rank, ngưỡng theo [Phase 8](plan/phase-08-foundation.md).
Với quota tần suất của Gemini, có thể thêm `--request-pause-seconds 5`; khoảng nghỉ giữa request được ghi trong report và nằm ngoài latency HTTP.
Nếu gặp 429, lần đo dừng và giữ nguyên kết quả; không tự retry hoặc ghép request từ run khác để đủ 50 mẫu.
State check đối chiếu recipe, bước, history, revision và nguyên cặp message; không dùng keyword để chấm nội dung model.
Runner thu các duration số từ `Server-Timing`, từ chối header thiếu/sai/trùng hoặc tổng stage vượt total; timing thiếu vẫn unknown và không đổi latency gate.
Diagnostics tách prepare/persist và provider boundary, không trừ provider time khỏi HTTP latency hoặc suy thành thời gian xử lý nội bộ NVIDIA.
Transcript giữ recipe snapshot để review, chỉ ghi hash operation cho đối chiếu usage, không ghi session capability hoặc raw error body.

Đọc từng câu trả lời trong report và đối chiếu snapshot/rubric, điền sáu giá trị `true`/`false` vào `review.json`, ghi lý do khi fail.
Review phải giữ `report_id` của đúng lần chạy; thiếu/null không được xem là pass.
Để review nhanh hơn, tạo form local không cần mạng:

```sh
python3 deploy/scripts/render_assistant_review.py backend/target/assistant-evaluation/RUN/report.json
```

Mở `review.html` trong browser, đọc từng câu hỏi/đáp/rubric và recipe snapshot, chọn pass/fail cho sáu tiêu chí.
Nút pass một câu chỉ là thao tác của người review; form không tự chấm hoặc preselect kết quả, không gọi API và không gửi dữ liệu ra mạng.
Export chỉ mở khi cả 50 câu có đủ đánh giá và người review xác nhận đã đọc; lưu `review.json` đã export vào cùng thư mục report rồi chạy summarize như bên dưới.
Ghi chú từ agent nếu có chỉ là gợi ý cần kiểm tra, không thay human review.
Định lượng/nguồn bịa, safety, security hoặc state sai làm fail; hỏi đáp thường và hội thoại cần tỷ lệ pass ít nhất 90%, các nhóm còn lại cần 100%.

Usage không nằm trong public DTO; sau lần chạy, dừng backend để sao chép SQLite nhất quán rồi khởi động lại.
Không sao chép một file SQLite đang được ghi hoặc chỉ một phần DB/WAL; giữ bản sao trong thư mục report bị Git ignore.
Với Compose mặc định, từ root dự án:

```sh
docker compose stop backend
docker compose cp backend:/app/data/assistant.sqlite backend/target/assistant-evaluation/RUN/usage.sqlite
docker compose start backend
```

Thay `RUN` bằng thư mục thực tế do runner in ra; luôn khởi động lại backend cả khi copy lỗi.
`--usage-db` chỉ mở bản sao read-only, đọc model/token/status theo các hash call của lần đo; thiếu/partial usage vẫn unknown, không đổi thành 0 hoặc ước lượng.
Chạy mock suite bằng lệnh Maven ở trên và dùng Surefire XML mới của đúng source; 4 ca này là bằng chứng fault injection, không phải API thật.

```sh
python3 deploy/scripts/evaluate_assistant.py --summarize backend/target/assistant-evaluation/RUN/report.json \
  --review backend/target/assistant-evaluation/RUN/review.json \
  --usage-db backend/target/assistant-evaluation/RUN/usage.sqlite \
  --junit backend/target/surefire-reports/TEST-com.cooklens.AssistantChatIntegrationTest.xml
```

Summary trả exit 1 khi chưa đạt hoặc còn thiếu bằng chứng; không đánh dấu chất lượng pass chỉ từ HTTP 200.
`evaluation_passed` chỉ mô tả bộ API/fault/review này; không thay gate Linux runtime, CI, tích hợp web/Expo hoặc tự đóng Phase 10.

### Dùng kết quả cho Phase 13

Chạy cùng fixture trên gateway của gói ứng viên đã pull, từ source của đúng tag.
Khi gọi `--execute`, truyền `--candidate-identity` với file vừa tạo và đối chiếu trên host đó trước khi ghi số đo.
Đo live, thu usage và hoàn tất review giống quy trình ở trên. Khi chạy `--summarize`, thêm `--release-summary` với một đường dẫn mới trong thư mục run, `--provider` và `--reported-model` theo cấu hình/model quan sát được.
Evaluator chỉ ghi summary khi các gate API/fault/quality đã đạt. Summary giữ identity của lần đo, model selector lấy từ usage, model trả về và các số đo tổng hợp.
Đưa object này vào trường `assistant` của hồ sơ nghiệm thu theo [runbook Phase 13](deployment.md#ứng-viên-phase-13).

Web thật dùng `COOKLENS_REAL_API=1`, `COOKLENS_REAL_ASSISTANT=1` và `COOKLENS_BASE_URL` trỏ origin của gói.
Kết quả phải có ca trợ lý đã chạy cho cả hai viewport, có hội thoại hai lượt, đổi bước, reload giữ hội thoại và finish.
Expo Go dùng `EXPO_PUBLIC_API_BASE_URL` trỏ cùng gateway kèm `/api`; ghi kết quả thiết bị thật riêng.

Checklist thực hiện và kiểm thử chi tiết được chia theo [Phase 8–14](plan/mvp.md);
chốt kỳ vọng/ngưỡng trước khi chạy và chỉ cập nhật kết quả đã kiểm chứng.
