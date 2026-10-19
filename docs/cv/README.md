# Computer Vision

REST API Top-3 đã được triển khai tại `ai/cv/inference`; CPU runtime và taxonomy dùng chung theo Phase 1. Xem [audit checkpoint, hướng dẫn chạy và kiểm thử API](api.md).

## Mục tiêu MVP

Phân loại **một món Việt chính** trong ảnh, trả về Top-K và confidence; không suy luận nguyên liệu từ ảnh.

## Dataset

| Dataset | Vai trò | Link | Trạng thái | Lưu ý quyền |
| --- | --- | --- | --- | --- |
| 30VNFoods | Dataset MVP, 30 lớp món Việt | [GitHub](https://github.com/ds4v/30VNFoods) · [Kaggle](https://www.kaggle.com/datasets/quandang/vietnamese-foods) | Chưa tải | Kiểm tra license/dataset card. |
| VietFood67 | Tham khảo milestone multi-dish sau bản này | [FoodDetector](https://github.com/nvhnam/FoodDetector) | Chưa dùng | Hạn chế research/education cần xác minh. |
| FoodSeg103 | Tham khảo milestone segmentation sau bản này | [Benchmark](https://github.com/LARC-CMU-SMU/FoodSeg103-Benchmark-v1) | Chưa dùng | Ngoài MVP. |

Không commit dataset/weights. Ghi version, nơi lưu và quyền dùng vào experiment.

## Model & cấu hình

| Thuộc tính | Quyết định |
| --- | --- |
| Bài toán | Single-dish classification |
| Baseline | EfficientNet-B2 pretrained ImageNet |
| So sánh | ResNet50, EfficientNet-B0, MobileNetV3, ConvNeXt-Tiny |
| Output | Đúng 3 predictions: class ID, canonical key, tên Việt và full confidence |
| Confidence | Luôn xác nhận/sửa món, không áp threshold tự chọn |
| Split | Train/validation/test, chống leak ảnh gần trùng |

## Checklist

- [~] Đã EDA ảnh lỗi/trùng; còn xác minh quyền và version dataset.
- [x] Giữ split gốc sau làm sạch và lưu manifest tái lập được.
- [~] Đã train baseline EfficientNet-B2; còn so sánh model/cấu hình.
- [x] Đã có confusion matrix, checkpoint và latency T4 từ thí nghiệm; threshold trong notebook chỉ là lịch sử, không điều khiển UX.
- [x] Phase 1: API Top-3, taxonomy/transform compatibility, validation và image CPU đã kiểm thử; [báo cáo và giới hạn](../phases/phase-1.md).

## Bảng kết quả train

| Experiment | Ngày | Dataset/version & split | Model | Input | Epochs | Augmentation | Top-1 | Top-3 | Macro F1 | Precision | Recall | Latency | Artifact / ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `efficientnet-b2-30vnfoods-2026-09-30` | 2026-09-30 | 30VNFoods; clean split 17,527 / 2,501 / 5,004 | EfficientNet-B2, ImageNet pretrained | 288×288 | 3 warm-up + 10 fine-tune | RandomResizedCrop, horizontal flip, rotation, ColorJitter | 87.61% | 96.08% | 87.70% | 87.93% | 87.75% | 25.60 ms mean; 45.45 ms P95, T4 batch 1 | [Kết quả](../../ai/cv/experiments/efficientnet-b2-30vnfoods-2026-09-30); metric lịch sử do nhóm báo cáo; weights lưu ngoài Git |

## Baseline EfficientNet-B2 — 2026-09-30

- Dataset gốc có 25,136 ảnh; bản đánh giá sạch còn 25,032 ảnh sau khi loại 104 file liên quan đến ảnh trùng hoặc nhãn xung đột.
- Không có ảnh lỗi đọc; phát hiện 66 bản sao chính xác, trong đó 41 bản sao đi qua split và đồng thời xung đột nhãn.
- [Split manifest](../../data/processed/manifests/30vnfoods_clean_split_manifest.csv) và [báo cáo ảnh trùng](../../data/interim/30vnfoods/audit/exact_duplicates.csv) dùng đường dẫn tương đối, không yêu cầu cấu trúc `/content` của Colab.
- [Notebook training](../../ai/cv/training/Cooklen_30VNFoods.ipynb) dùng seed 42. Model weights và dataset không được commit; cần tải checkpoint từ kho artifact của nhóm trước khi chạy inference.
