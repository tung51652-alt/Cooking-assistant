# Đầu vào build có version

`manifest.json` là nguồn version/size/checksum, không chứa token hoặc URL ký tạm thời.

## Checkpoint vision

Nguồn: [GitHub Release vision-model-v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/vision-model-v1). Tác giả/quyền public và license implementation: [provenance](vision-model-v1.md), [torchvision notice](notices/torchvision-LICENSE.txt).

Từ root repo với Python 3.11+ (không cần torch hoặc token):

```bash
python3 deploy/scripts/fetch_vision_checkpoint.py
python3 deploy/scripts/verify_mvp_inputs.py --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_best.pt
python3 -m unittest discover -s deploy/tests -v
```

Script chỉ dùng release/tag cố định, không `latest`; kiểm tra cả byte size và SHA-256 trước khi đặt file vào staging. File đang có hợp lệ được dùng lại; nếu sai, script dừng, không ghi đè file của người dùng. Di chuyển file sai ra ngoài staging sau khi kiểm tra rồi chạy lại. Mạng lỗi hoặc bytes sai không để lại file build nửa chừng. Không dùng `--output` để ghi lên file đang được service sử dụng.

CI chạy cùng lệnh qua `.github/workflows/mvp-inputs.yml`. Staging được Git ignore, chỉ được Docker context cho phép đúng artifact cần đóng gói; Dockerfile service sẽ copy checkpoint và notices vào image ở phase sở hữu service. Người dùng cuối chỉ chạy Compose/pull image từ Docker Hub, không cần lấy checkpoint, Python hoặc GitHub token. Runtime không tải checkpoint từ GitHub.

Khi có model mới: tạo release/tag mới, cập nhật model version, URL và checksum trong manifest qua PR, giữ bản cũ để rollback. Không thay bytes asset dưới tag đã công bố. SHA-256 giúp phát hiện thay đổi dù release asset không bật immutable trên GitHub.

## Các artifact khác

Embedding đã chọn/pin revision nhưng chưa tải và đánh giá; corpus hiện 0/30. Việc tạo bundle embedding/corpus, attribution theo recipe và fingerprint toàn bundle thuộc Phase 2. Không đánh đồng verifier input với accuracy benchmark hoặc nghiệm thu release stack.
