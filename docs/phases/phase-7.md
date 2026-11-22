# Phase 7 — Nghiệm thu bộ image phát hành

Ngày kiểm thử: 2026-11-22. Bộ ứng viên: `2.0.0-rc.2`, Linux amd64/CPU.
Nhánh thực hiện: `codex/phase7-acceptance`.

**Kết quả: các gate kỹ thuật đã đạt, sẵn sàng review/merge PR nghiệm thu.**
Bản chính thức `v2.0.0` và promote image chưa thực hiện; đây là bước phát hành
sau review/merge theo kế hoạch, không đồng nhất với số đo ứng viên.

Điều chỉnh phạm vi ngày 2026-11-22: người dùng bỏ yêu cầu thử nấu khỏi nghiệm thu.
Không yêu cầu thực nghiệm bếp để đóng Phase 7. Công thức vẫn ghi đúng nguồn,
license, nội dung đã rà và giới hạn chưa được nấu kiểm chứng; không biến việc
loại bỏ gate thành tuyên bố đã thử nấu. Review/merge PR thuộc bước bàn giao hiện hành.

## Bằng chứng kỹ thuật

- [CV trên test split](evidence/phase-7-vision.json): chạy lại đủ 5.004 ảnh, 30
  lớp trong chính image phát hành. Top-3 **96,0831%**, đạt gate ≥95%; Top-1
  **87,5699%**, Macro F1 **0,876567**. Top-3 bằng báo cáo huấn luyện lịch sử;
  Top-1 thấp hơn khoảng 0,0400 điểm phần trăm (hai ảnh). Không suy đoán nguyên
  nhân khác biệt từ số đo này; không gọi kết quả Top-1 là giống hệt baseline.
- [Regression](evidence/phase-7-regression.json): 28 deploy tests, 7 data tests,
  13 backend tests bằng Java 21/Maven, frontend build, 20 browser tests với API mô
  phỏng và 10 browser tests với image phát hành/CV/E5/Qdrant thật đều qua.
- [Runtime](evidence/phase-7-runtime.json): Compose độc lập, volume mới, seed lặp,
  persistence, version upgrade/rollback, từ chối bundle lỗi, dừng/khôi phục dependency,
  runtime offline và catalog 30 món đều qua. Chỉ frontend publish trên loopback.
  100 mẫu tuần tự/API: P95 vision 0,1614 giây, search 0,0887 giây; cold start
  37,336 giây. Máy kiểm thử có 8 logical CPU và khoảng 7,6 GiB RAM; chưa chứng minh
  cấu hình phần cứng tối thiểu. Peak RAM theo từng service không phải peak đồng thời.
- [Giới hạn 4 logical CPU](evidence/phase-7-four-cpu.json): mọi service dùng chung
  cpuset `0-3`, giữ nguyên memory budget. Cùng bộ lifecycle/offline/rollback và
  100 mẫu/API đều qua; P95 vision 0,6225 giây, search 0,9101 giây. Có tác vụ đánh
  giá CV đồng thời trên cpuset `4-7`. Đây là bằng chứng workload chạy trong giới
  hạn 4 logical CPU, chưa phải đo máy vật lý 4 CPU độc lập hoặc RAM tối thiểu.
- [Luồng và retrieval](evidence/phase-7-flow.json): 30/30 luồng xác nhận/sửa món
  qua; Top-3 chứa nhãn kỳ vọng ở 28/30 ảnh đại diện. Không dùng mẫu nhỏ này làm
  gate accuracy 95%. 204 query đủ 30 món đạt Hit@1/Hit@3/MRR bằng 1, không có
  kết quả sai món; 18 contrastive holdout cũng đạt Hit@1 bằng 1. Giới hạn corpus
  nhỏ và thiếu external review vẫn được giữ nguyên trong report.
  10 browser tests gồm ảnh chó ngoài miền và ảnh ghép hai món: UI giữ cảnh báo
  30 lớp, diễn giải confidence và yêu cầu xác nhận thủ công. [Ảnh UI](evidence/phase-7-ui/)
  dùng fixture smoke sẵn có, không dùng làm bằng chứng accuracy.
  3/30 ảnh đại diện có Top-1 confidence dưới 0,3; luồng xác nhận/sửa món vẫn qua.
  File giả/ảnh lỗi trả 400 `INVALID_IMAGE`, file lớn hơn 10 MiB trả 413
  `UPLOAD_TOO_LARGE`, món ngoài taxonomy trả 422 và recipe không tồn tại trả 404.
- [Review công thức](evidence/phase-7-recipe-review.json): rà attribution của 33
  recipe và nội dung nguyên liệu/bước của 12 recipe AI. Đây là cùng agent triển
  khai, không phải review độc lập và không phải bằng chứng thử nấu.

## Ảnh đánh giá tải lại

Theo quyền người dùng cấp, tải `test.zip` từ
[mirror 30VNFoods](https://huggingface.co/datasets/vuongnhathien/30VNFoods).
Nguồn ghi CC BY-NC-SA 4.0. Dùng cho đánh giá nghiên cứu cục bộ, không đưa ảnh/ZIP
vào Git, image hoặc gói phát hành. Không coi license mirror là đã giải quyết
mâu thuẫn license upstream trong `data/raw/source-manifest.json`.

Đối chiếu class và tên file với
`data/processed/manifests/30vnfoods_clean_split_manifest.csv`, chỉ lấy đúng 5.004
entry `Test`, đủ 30 lớp. Archive chứa đủ mọi tên file cần thiết. Manifest lịch sử
không chứa checksum ảnh nên việc khớp tên chưa chứng minh nội dung từng byte
không thay đổi. Không dùng split mới hoặc chọn ảnh theo dự đoán để tăng điểm.

Ảnh chó dùng riêng để kiểm tra ngoài miền lấy từ
[ví dụ PyTorch Hub](https://github.com/pytorch/hub/blob/master/images/dog.jpg).
Không tái phân phối ảnh này trong Git/artifact; đây không phải nguồn accuracy
30 lớp. Ảnh nhiều món là ảnh ghép từ hai entry đầu của hai lớp đầu trong manifest.

## Chạy lại

Workflow thủ công [acceptance.yml](../../.github/workflows/acceptance.yml) tải ảnh,
pull image đã công bố và lưu artifact kiểm thử. Workflow không publish hoặc
promote image. Trên máy đã có Docker và frontend dependencies/browser:

```sh
curl --fail --location --retry 3 \
  'https://huggingface.co/datasets/vuongnhathien/30VNFoods/resolve/main/test.zip?download=true' \
  --output /tmp/cooklens-test.zip
docker run --rm --network none --no-healthcheck -e PYTHONPATH=/app \
  -v "$PWD:/acceptance:ro" -v /tmp/cooklens-test.zip:/evaluation/test.zip:ro \
  trantung2006/cooklens-vision:2.0.0-rc.2 \
  python /acceptance/deploy/scripts/evaluate_release_vision.py \
  --archive /evaluation/test.zip \
  --manifest /acceptance/data/processed/manifests/30vnfoods_clean_split_manifest.csv \
  > docs/phases/evidence/phase-7-vision.json
venv/bin/python deploy/scripts/accept_release_flow.py \
  --archive /tmp/cooklens-test.zip --report docs/phases/evidence/phase-7-flow.json
python3 deploy/scripts/smoke_release_stack.py --samples 100 \
  --report docs/phases/evidence/phase-7-runtime.json
```

Hai runner Compose tạo project/volume riêng và gỡ chúng trong `finally`.
Runner CV chạy offline trong chính image đã phát hành, dùng transform và checkpoint
runtime. Batch 16 chỉ dùng cho accuracy, không dùng như số đo latency API.
Runner flow chọn entry test đầu tiên mỗi lớp trước inference, kiểm tra 30 lần
upload → Top-3 → xác nhận/sửa món → search → detail; chạy thêm bộ query retrieval
và trình duyệt desktop/mobile thật. Kết quả accuracy được ghi riêng với thành công
của luồng sửa món.

## Điều kiện đóng Phase 7

Hoàn tất phần kỹ thuật khi có đủ số đo CV, các kiểm thử luồng/runtime và rà soát
release. Người dùng review/merge PR nghiệm thu; thử nấu không còn là gate.
Review công thức hiện tại là cùng agent, không tự nhận đã có reviewer độc lập.
Flag `acceptance_gate_met` trong evaluator retrieval lịch sử còn bao gồm external
review, được giữ nguyên false thay vì đổi nghĩa; gate kỹ thuật Phase 7 sử dụng
`technical_gate_met` và ghi rõ phạm vi review trong report.
Các kiểm thử dữ liệu lỗi/race/retry bằng API mô phỏng
không thay thế kiểm thử mọi ảnh ngoài miền thực tế. Không promote `2.0.0` hoặc công bố bản
chính thức khi còn gate chưa đạt. Người dùng review/merge PR nghiệm thu trước
bước đề xuất release lên `main`, theo kế hoạch hiện hành.
