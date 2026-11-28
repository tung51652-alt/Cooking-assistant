# Vision Top-3 — Phase 1

Service nội bộ dùng EfficientNet-B2 do Phạm Hoàng Minh train. Chỉ trả prediction; không xác nhận món thay người dùng, không tìm hoặc sinh recipe. Phiên bản API/model/taxonomy riêng với release sản phẩm CookLens v2.

## Chạy local

Python 3.12; từ root repo, dùng môi trường Python riêng:

```bash
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1 torchvision==0.29.1
python -m pip install -r ai/cv/inference/requirements.txt
python3 deploy/scripts/fetch_vision_checkpoint.py
python -m uvicorn ai.cv.inference.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Mở [Swagger local](http://127.0.0.1:8000/docs), chọn `POST /predict` → **Try it out** → chọn JPEG/PNG → **Execute**. Đây là API vision nội bộ; route public `/api/vision/predict` được Spring bổ sung ở Phase 3.

Có thể đặt `FOOD_MODEL_PATH` trỏ file checkpoint đã có thay vì dùng staging mặc định. `FOOD_TAXONOMY_PATH` tùy chọn trỏ mapping bundle; phải khớp checkpoint/manifest. `TORCH_NUM_THREADS` mặc định 4, phạm vi 1–32, CPU là runtime mặc định. Không dùng nhiều workers để tránh nhân bộ nhớ/model và thay đổi concurrency đã nghiệm thu. Development có thể dùng `--reload`; mỗi process mới load lại một lần.

Để dùng model 32 lớp, chép checkpoint epoch 5 đã được nhóm cung cấp vào `deploy/artifacts/staging/vision/efficientnet_b2_epoch5.pt` trước khi khởi động service. Khi có file này, inference chạy từ repo sẽ ưu tiên checkpoint epoch 5. Để chọn rõ phiên bản, đặt `FOOD_MODEL_PATH` trỏ trực tiếp đến file cần dùng.
`GET /health/ready` trả `model_version: "efficientnet-b2-32class-epoch5"` sau khi tải thành công.

## Hành vi

- Load checkpoint một lần qua lifespan; `weights_only=True`, strict state dict, architecture, kích thước ảnh, nhãn/thứ tự, taxonomy version và transform đều được đối chiếu trước ready. Thiếu/sai artifact làm startup thất bại với thông báo an toàn.
- Transform giữ đúng preset evaluation huấn luyện: RGB, resize/crop 288, bicubic, normalize ImageNet; không tải pretrained weights. Network `eval()` và `inference_mode()`.
- `/predict` trả `model_version`, `taxonomy_version`, 3 predictions gồm rank/class ID/canonical/display name/full softmax confidence. Sort ổn định theo xác suất giảm dần và class ID khi bằng nhau, không normalize lại 3 mục hoặc làm tròn trước sort.
- Model 32 lớp trả `OTHER_FOOD` hoặc `NON_FOOD` khi một trong hai lớp này đứng đầu. Khi món hỗ trợ đứng đầu, ba món trong danh mục được trả theo xác suất gốc, không áp dụng ngưỡng 65%.
- Model 30 lớp công bố áp dụng ngưỡng 65% và trả `LOW_CONFIDENCE_PREDICTION` khi điểm cao nhất dưới ngưỡng. [Đo ngưỡng #49](../../../docs/plan/2026-11-27-issue-49-vision-confidence.md)
- Upload đúng một field `file`, MIME và bytes phải cùng JPEG/PNG. Giới hạn file 10 MiB, toàn multipart 11 MiB, tối đa 25 triệu pixel, chỉ một frame; reject ảnh corrupt/bomb. PNG grayscale/RGBA được chuyển RGB.
- Một slot bao trùm cả upload/parse/decode/inference; request thứ hai nhận 503 `SERVICE_BUSY`. Body chunked vẫn bị giới hạn trước parser; tổng thời gian nhận body tối đa 15 giây, timeout trả 504. Lỗi parse/validation/inference có code/message/request ID an toàn; không trả path, traceback hoặc raw provider detail.
- `GET /health/live`: process sống. `GET /health/ready`: chỉ ready sau load/validation, có model/taxonomy versions. `/health` giữ alias readiness để chuyển tiếp từ API cũ. `/predict` chính thức chuyển sang envelope Top-3, không giữ shape Top-1 vì chưa có public client phụ thuộc API nội bộ cũ.
- Lấy catalog ở service recipes sau này; vision đọc chính [taxonomy dùng chung](../../../data/processed/README.md), không tạo danh mục hardcode riêng.

## Docker thử nghiệm

Sau khi chuẩn bị staging:

```bash
docker build -f ai/cv/Dockerfile -t cooklens-vision:local .
python3 deploy/scripts/smoke_vision_container.py
```

Để thử model epoch 5 đã được stage trong một image cục bộ, build bằng lệnh sau.

```bash
docker build -f ai/cv/Dockerfile --build-arg VISION_CHECKPOINT=efficientnet_b2_epoch5.pt -t cooklens-vision:epoch5 .
```

Image chứa đúng runtime, checkpoint, mapping, manifest và notices; checkpoint được copy read-only cho user runtime độc lập với permission file staging; chạy non-root, một worker, không có tests/notebook/dataset/frontend. Smoke chạy network `none`, root filesystem read-only, tmpfs cho upload, giới hạn 4 CPU/2 GiB RAM, kiểm tra health và ảnh thật; tự xóa container test. Tag `local` dùng khi build source; mặc định `docker compose up` dùng image đã đóng gói trên Docker Hub.

Để mở Swagger bằng image vừa build:

```bash
docker run --rm --name cooklens-vision-dev -p 127.0.0.1:8000:8000 cooklens-vision:local
```

## Kiểm tra và bằng chứng

```bash
python -m pip install -r ai/cv/inference/requirements-test.txt
python -m unittest discover -s data/tests -v
python -m unittest discover -s ai/cv/inference/tests -v
python3 deploy/scripts/check_public_metadata.py
python -m ai.cv.evaluation.benchmark_api --image ai/cv/inference/tests/fixtures/food.png --runs 100
```

Ảnh test là figure đã có trong notebook được nhóm cung cấp, có nhãn dự đoán trên hình, chỉ phục vụ smoke/regression/latency; không là accuracy evaluation. Notebook đã dọn outputs và execution metadata, vẫn giữ source thí nghiệm. Không ghi giá trị mã/hash vào source, fixtures, manifests, docs hoặc logs; chỉ dùng version/tag, kiểm tra toàn vẹn artifact tạm trong bộ nhớ.

[Contract](../../../docs/contracts/mvp-v1.md), [báo cáo Phase 1](../../../docs/acceptance.md), [preset torchvision](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.efficientnet_b2.html), [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/).
