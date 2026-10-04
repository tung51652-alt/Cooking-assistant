# Food Classification API

FastAPI service tại `ai/cv/inference`, tách khỏi notebook training và backend Spring Boot.

## Audit model hiện tại

| Thuộc tính | Kết quả đã kiểm tra |
| --- | --- |
| Checkpoint thực tế | `ai/cv/experiments/efficientnet-b2-30vnfoods-2026-09-30/efficientnet_b2_best.pt` (31,434,209 bytes); không có thư mục `experience` |
| Format | Dictionary: `model_state_dict`, `classes`, `architecture`, `image_size`, `stage`, `epoch`, `validation_metrics` |
| Kiến trúc | `torchvision.models.efficientnet_b2`; thay `classifier[1]` bằng `Linear(1408, 30)` |
| Checkpoint stage | `fine_tune`, epoch 10 |
| Mapping | `classes` trong checkpoint, trùng thứ tự với `classes.json` và `class_index` trong clean split manifest |
| Index | `ImageFolder` dùng 0-based, không có phép trừ 1: `Bun bo Hue` = 14, `Bun dau mam tom` = 15, `Pho` = 28 |
| Validation/test | Cell 8 của `Cooklen_30VNFoods.ipynb`: `weights = EfficientNet_B2_Weights.DEFAULT`, `evaluation_transform = weights.transforms()` |
| Preprocessing | RGB → resize cạnh ngắn về 288, bicubic → center crop 288×288 → float tensor [0,1] → normalize |
| Mean / std | `[0.485, 0.456, 0.406]` / `[0.229, 0.224, 0.225]` |

API gọi chính preset validation/test, không dùng random augmentation. Tên món trả về giữ nguyên tên đã train, gồm chữ hoa và khoảng trắng; không chuyển thành slug.

Notebook cell 11/13 save dictionary bằng `torch.save(...)`. Loader dùng `weights_only=True`, `map_location=device`, `load_state_dict(..., strict=True)`, kiểm tra architecture/image size/labels và bật `eval()`. Khởi tạo với `weights=None` nên không tải thêm pretrained weights. Checkpoint không bị sửa.

Model load một lần trong lifespan trước khi phục vụ request, theo [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/). Mỗi worker có một model; reload khởi động process mới và load lại. Device tự chọn CUDA nếu có, nếu không dùng CPU. Inference chạy trong `torch.inference_mode()`.

## Chạy từ root repository

Dùng Python 3.10+ với cặp torch/torchvision tương thích môi trường CPU/CUDA. Requirements không pin hoặc yêu cầu nâng cấp PyTorch. Nếu đã có PyTorch, chọn torchvision khớp phiên bản đó theo [PyTorch installation](https://pytorch.org/get-started/locally/).

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn ai.cv.inference.main:app --reload --host 0.0.0.0 --port 8000
```

Trong workspace đã kiểm thử, `.venv` dùng torch `2.14.1+cpu` và torchvision `0.29.1+cpu`, giữ nguyên phiên bản PyTorch của interpreter nền. Có thể chạy trực tiếp:

```powershell
.\.venv\Scripts\python.exe -m uvicorn ai.cv.inference.main:app --reload --host 0.0.0.0 --port 8000
```

Checkpoint mặc định được tìm theo vị trí module, độc lập với working directory. Khi cần đổi artifact tương thích, đặt biến môi trường `FOOD_MODEL_PATH` trỏ đến checkpoint cùng format. Phải cung cấp weights ngoài Git vì `.pt` đang được ignore.

## API

- `GET /`: `{"message":"Food Classification API is running"}`.
- `GET /health`: `{"status":"ok","model_loaded":true}` khi model đã sẵn sàng.
- `POST /predict`: multipart/form-data, trường `file`, MIME `image/*`, tối đa 10 MiB.

```bash
curl -X POST "http://localhost:8000/predict" \
  -H "accept: application/json" \
  -F "file=@test.jpg"
```

Dùng `curl.exe` thay `curl` trong Windows PowerShell nếu `curl` là alias. Để curl tự thêm `Content-Type` và multipart boundary.

Response mẫu đã đo với ảnh thật trong notebook:

```json
{"label":"Bun dau mam tom","class_id":15,"confidence":0.9426}
```

Confidence là softmax Top-1, làm tròn 4 chữ số thập phân. MIME không phải ảnh, ảnh rỗng/corrupt/quá lớn trả 400; thiếu trường file trả 422; inference error trả 500 với thông báo chung. Chi tiết lỗi chỉ nằm trong server log. Checkpoint sai hoặc thiếu làm startup thất bại.

## Kiểm thử

```bash
python -m pip install httpx
python -m unittest discover -s ai/cv/inference/tests -v
```

7 integration tests dùng checkpoint thật, kiểm tra mapping với `classes.json` và manifest, so sánh tensor preprocessing với biểu thức validation trong notebook, và kiểm tra `eval()`, inference mode, device, số lần load. Có các case RGB/grayscale/RGBA, upload lỗi, và inference error không lộ thông tin nội bộ.

Đã kiểm thử ngày 2026-10-04 trên CPU: Uvicorn startup thành công, `curl.exe` gọi `/health` và multipart `/predict` đều trả HTTP 200, prediction đúng JSON ở trên. Cả 7 tests pass. Notebook training và checkpoint được giữ nguyên.

Repo không chứa ảnh dataset rời. Ảnh dùng để test là PNG figure chứa ảnh món ăn `Bún_đậu_mắm_tôm_(2019).jpg` đã lưu trong output cell 20 của notebook. Đây là ảnh được render lại trong notebook, không phải JPEG gốc; confidence có thể khác nhẹ kết quả notebook (`0.9438`). Không dùng confusion matrix làm ảnh test.
