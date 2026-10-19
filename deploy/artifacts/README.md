# Đầu vào build có version

`manifest.json` là nguồn version/kích thước, không chứa token hoặc URL ký tạm thời.

## Checkpoint vision

Nguồn: [GitHub Release vision-model-v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/vision-model-v1). Tác giả/quyền public và license implementation: [provenance](vision-model-v1.md), [torchvision notice](notices/torchvision-LICENSE.txt).

Từ root repo với Python 3.11+ (không cần torch hoặc token):

```bash
python3 deploy/scripts/fetch_vision_checkpoint.py
python3 deploy/scripts/verify_mvp_inputs.py --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_best.pt
python3 -m unittest discover -s deploy/tests -v
```

Script chỉ dùng release/tag cố định, không `latest`; kiểm tra kích thước và toàn vẹn nội bộ từ metadata release upstream trước khi đặt file vào staging. File đang có hợp lệ được dùng lại; nếu sai, script dừng, không ghi đè file của người dùng. Di chuyển file sai ra ngoài staging sau khi kiểm tra rồi chạy lại. Mạng lỗi hoặc bytes sai không để lại file build nửa chừng. Không dùng `--output` để ghi lên file đang được service sử dụng.

CI chạy cùng lệnh qua `.github/workflows/mvp-inputs.yml`. Staging được Git ignore, chỉ được Docker context cho phép đúng artifact cần đóng gói; Dockerfile service sẽ copy checkpoint và notices vào image ở phase sở hữu service. Người dùng cuối chỉ chạy Compose/pull image từ Docker Hub, không cần lấy checkpoint, Python hoặc GitHub token. Runtime không tải checkpoint từ GitHub.

Khi có model mới: tạo release/tag mới, cập nhật model version, URL trong manifest qua PR, giữ bản cũ để rollback. Không thay bytes asset dưới tag đã công bố. Giá trị dùng cho kiểm tra toàn vẹn chỉ tồn tại trong bộ nhớ lúc chạy; không ghi vào manifest, code, docs, asset hay log.

## Các artifact khác

Phase 2 đã có embedding release có version và corpus 33 recipe/30 món. Xem [embedding provenance](embedding-model-v1.md), [recipes README](../../ai/rag/README.md) và [data/attribution](../../data/recipes/README.md). Chạy fetch_embedding_model.py rồi precompute bundle trước build image recipes; verifier input không thay thế accuracy benchmark hoặc nghiệm thu release stack.

Trước commit/review, chạy `python3 deploy/scripts/check_public_metadata.py`. Scanner chặn giá trị mã/hash và credential ghi sẵn, kể cả trong lockfile; chỉ báo đường dẫn/loại vi phạm, không hiển thị giá trị. Npm có thể sinh lại integrity metadata khi cập nhật dependency; phải loại khỏi nội dung sẽ commit và chạy lại scanner.
