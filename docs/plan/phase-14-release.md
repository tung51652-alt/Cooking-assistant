# Phase 14 — Phát hành và bàn giao

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 13](phase-13-acceptance.md) đã đạt đầy đủ.

## Mục tiêu

Phát hành MVP `v2.0.0` có trợ lý; người nhận cấu hình key và chạy được bằng Docker Compose.

## Thực hiện

- [ ] Chuẩn bị PR release từ `develop` sang `main` theo phiên bản đã nghiệm thu.
- [ ] Bổ sung luồng phát hành chính thức: pipeline hiện tại chỉ nhận tag prerelease `v2.0.0-rc.N`.
- [ ] Promote đúng image ứng viên đã đạt sang `2.0.0`, không rebuild hoặc ghi đè tag đã công bố.
- [ ] Đồng bộ tag image, Compose, version ứng dụng, notes và tài liệu; giữ version dữ liệu/model riêng.
- [ ] Đóng gói `compose.yaml`, ví dụ cấu hình không có key, notices, hướng dẫn và bản tóm tắt kết quả.
- [ ] Giữ ứng viên/image cũ và backup dữ liệu cần thiết để rollback.

## Kiểm thử trước công bố

- [ ] Xác nhận source release, image được promote và bộ đã nghiệm thu tương ứng nhau.
- [ ] Kiểm tra không thể publish khi thiếu gate, version sai, tag tồn tại hoặc bundle không phù hợp.
- [ ] Pull ẩn danh bộ final từ máy sạch; giải nén gói ngoài source và chạy `docker compose up`.
- [ ] Cấu hình key của provider đã chọn; thử ảnh → recipe → chat → bước nấu và restart giữ phiên.
- [ ] Thử không có key: phần ảnh/công thức vẫn chạy, trợ lý thông báo chưa sẵn sàng.
- [ ] Xác nhận rollback/restore bằng hướng dẫn bàn giao; kiểm tra gói không có secrets, dữ liệu phiên hoặc build output.
- [ ] Kiểm tra link tải, tag và nội dung tài liệu nhất quán; chỉ ghi số đo thực tế.

## Điều kiện hoàn thành

- [ ] PR release được review/merge theo phạm vi người dùng giao và CI bắt buộc qua.
- [ ] Công bố GitHub release `v2.0.0` cùng gói chạy và image public đã kiểm chứng.
- [ ] Người nhận có thể làm theo README để chạy web/Expo trong phạm vi đã nghiệm thu.
- [ ] [acceptance.md](../acceptance.md) và kế hoạch cập nhật trạng thái phát hành thực tế.

## Thông tin bàn giao

Link release:

Phiên bản image và phạm vi nền tảng:

## Kết quả kiểm tra
