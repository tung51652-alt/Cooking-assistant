# Vision Top-3 API

API nội bộ được nâng từ Top-1 sang Top-3 trong Phase 1. [Hướng dẫn chạy, Swagger, DTO, lỗi và Docker](../../ai/cv/inference/README.md) là tài liệu vận hành hiện tại; [contract v1](../contracts/mvp-v1.md) mô tả public gateway và service boundaries.

- `POST /predict`: đúng một field `file`, JPEG/PNG, file ≤10 MiB, request ≤11 MiB, ảnh một frame ≤25 triệu pixel. Trả model/taxonomy versions và đúng ba predictions có rank/class ID/canonical/display name/full softmax confidence.
- `GET /health/live`: process sống. `GET /health/ready`: model/mapping đã load và khớp. `/health` giữ alias readiness, không còn shape Top-1 cũ.
- CPU mặc định, một worker, một request upload/parse/decode/inference đồng thời; quá tải trả 503. Model load một lần/process và không tải pretrained weights lúc chạy.
- `FOOD_MODEL_PATH` trỏ checkpoint ngoài Git; mặc định lấy staging theo manifest. Nhãn và thứ tự phải khớp [taxonomy dùng chung](../../data/processed/30vnfoods-label-map.json).

Các hướng dẫn cũ về response `label/class_id/confidence`, round 4 chữ số, MIME `image/*` và device tự chọn CUDA đã được thay thế. Frontend chưa gọi trực tiếp service này; Spring nối public route `/api/vision/predict` ở Phase 3.

[Báo cáo Phase 1](../phases/phase-1.md) tách rõ metric do nhóm train báo cáo, kết quả regression/latency CPU hiện tại và kiểm thử image offline. Chưa có release ứng dụng v2 hoặc image Docker Hub trong phase này.
