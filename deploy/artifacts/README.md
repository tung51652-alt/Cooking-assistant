# Đầu vào build có version

`manifest.json` là nguồn version/kích thước, không chứa token hoặc URL ký tạm thời.

## Checkpoint vision

Build từ source dùng checkpoint epoch 5 trong `staging/vision/efficientnet_b2_best.pt`. Tập huấn luyện và báo cáo Colab được quản lý riêng. Xem [quá trình huấn luyện](../../docs/plan/2026-11-27-issue-67-vision-pilot.md) và [kết quả đánh giá](../../docs/acceptance.md#đánh-giá-checkpoint-epoch-5-67).

Checkpoint 30 lớp dùng cho kiểm tra tương thích lấy từ [GitHub Release vision-model-v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/vision-model-v1). Xem [nguồn gốc](vision-model-v1.md) và [giấy phép torchvision](notices/torchvision-LICENSE.txt).

Từ root repo với Python 3.11+ (không cần torch hoặc token):

```bash
python3 deploy/scripts/verify_mvp_inputs.py --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_best.pt
python3 deploy/scripts/fetch_vision_checkpoint.py  # Chỉ cần cho kiểm tra checkpoint 30 lớp
python3 deploy/scripts/verify_mvp_inputs.py --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_legacy.pt
python3 -m unittest discover -s deploy/tests -v
```

Script chỉ dùng release/tag cố định, không `latest`; kiểm tra kích thước và toàn vẹn nội bộ từ metadata release upstream trước khi đặt file vào staging. File đang có hợp lệ được dùng lại; nếu sai, script dừng, không ghi đè file của người dùng. Di chuyển file sai ra ngoài staging sau khi kiểm tra rồi chạy lại. Mạng lỗi hoặc bytes sai không để lại file build nửa chừng. Không dùng `--output` để ghi lên file đang được service sử dụng.

CI chạy cùng lệnh tải checkpoint 30 lớp qua `.github/workflows/mvp-inputs.yml`. Dockerfile copy checkpoint được chọn và notices vào image. Git bỏ qua các file staging phát sinh khi build. Runtime đọc checkpoint trong image.

Khi cập nhật checkpoint runtime, cập nhật model version và kích thước trong manifest qua PR. Các asset thuộc tag đã công bố giữ nguyên bytes. Giá trị dùng cho kiểm tra toàn vẹn chỉ tồn tại trong bộ nhớ lúc chạy; không ghi vào manifest, code, docs, asset hay log.

## Các artifact khác

Phase 2 đã có embedding release có version và corpus 33 recipe/30 món. Xem [embedding provenance](embedding-model-v1.md), [recipes README](../../ai/rag/README.md) và [data/attribution](../../data/recipes/README.md). Chạy fetch_embedding_model.py rồi precompute bundle trước build image recipes; verifier input không thay thế accuracy benchmark hoặc nghiệm thu release stack.

Trước commit/review, chạy `python3 deploy/scripts/check_public_metadata.py`. Scanner chặn giá trị mã/hash và credential ghi sẵn, kể cả trong lockfile; chỉ báo đường dẫn/loại vi phạm, không hiển thị giá trị. Npm có thể sinh lại integrity metadata khi cập nhật dependency; phải loại khỏi nội dung sẽ commit và chạy lại scanner.
