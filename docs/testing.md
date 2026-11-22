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

## Nghiệm thu bộ image

[Workflow acceptance](../.github/workflows/acceptance.yml) chạy thủ công: tải test
archive, pull image public, đánh giá CV, 30 luồng ảnh, 204 query và browser desktop/mobile.
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
provider với API thật và đo latency/usage. Chưa có kết quả cho phần này.

Checklist thực hiện và kiểm thử chi tiết được chia theo [Phase 8–14](plan/mvp.md);
chốt kỳ vọng/ngưỡng trước khi chạy và chỉ cập nhật kết quả đã kiểm chứng.
