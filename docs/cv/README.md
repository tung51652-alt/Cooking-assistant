# Computer Vision

## Mục tiêu MVP

Phân loại **một món Việt chính** trong ảnh, trả về Top-K và confidence; không suy luận nguyên liệu từ ảnh.

## Dataset

| Dataset | Vai trò | Link | Trạng thái | Lưu ý quyền |
| --- | --- | --- | --- | --- |
| 30VNFoods | Dataset MVP, 30 lớp món Việt | [GitHub](https://github.com/ds4v/30VNFoods) · [Kaggle](https://www.kaggle.com/datasets/quandang/vietnamese-foods) | Chưa tải | Kiểm tra license/dataset card. |
| VietFood67 | Tham khảo V2 multi-dish | [FoodDetector](https://github.com/nvhnam/FoodDetector) | Chưa dùng | Hạn chế research/education cần xác minh. |
| FoodSeg103 | Tham khảo V3 segmentation | [Benchmark](https://github.com/LARC-CMU-SMU/FoodSeg103-Benchmark-v1) | Chưa dùng | Ngoài MVP. |

Không commit dataset/weights. Ghi version, checksum, nơi lưu và quyền dùng vào experiment.

## Model & cấu hình

| Thuộc tính | Quyết định |
| --- | --- |
| Bài toán | Single-dish classification |
| Baseline | EfficientNet-B2 pretrained ImageNet |
| So sánh | ResNet50, EfficientNet-B0, MobileNetV3, ConvNeXt-Tiny |
| Output | Top-1/Top-3: `dish`, `confidence` |
| Confidence | Thấp → người dùng xác nhận |
| Split | Train/validation/test, chống leak ảnh gần trùng |

## Checklist

- [ ] Xác minh quyền/version; EDA ảnh lỗi, trùng, phân bố lớp.
- [ ] Chốt split có seed/manifest.
- [ ] Train baseline và so sánh model/cấu hình.
- [ ] Xem confusion matrix, chọn threshold, export inference và đo latency.

## Bảng kết quả train

| Experiment | Ngày | Dataset/version & split | Model | Input | Epochs | Augmentation | Top-1 | Top-3 | Macro F1 | Precision | Recall | Latency | Artifact / ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — | — | — | — | — | — | Chưa có kết quả |
