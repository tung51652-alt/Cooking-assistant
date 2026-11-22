# Phase 12 — Trợ lý trên Expo Go

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 11](phase-11-web.md).

## Mục tiêu

Expo dùng cùng API, phiên và logic bước nấu với web; không tạo backend riêng.

## Thực hiện

- [ ] Tích hợp client dùng chung; thêm chat/hướng dẫn từ màn chi tiết công thức.
- [ ] Hiển thị bước, controls, loading/error/retry và khôi phục phiên.
- [ ] Xử lý Back, bàn phím, safe area, chữ lớn và app background/foreground.
- [ ] Hủy/bỏ qua request cũ khi đổi phiên/recipe; không tự gửi lại message khi quay về app.
- [ ] Dùng gateway LAN/HTTPS của cùng project `cooklens`, không mở cổng AI hoặc đưa key vào app.

## Kiểm thử

- [ ] Chạy typecheck, kiểm tra dependency Expo, export/bundle và shared-client tests.
- [ ] Trên thiết bị đã chốt ở Phase 8, thử chụp/chọn ảnh → Top-3 → recipe → chat → bước nấu.
- [ ] Thử permission denied/cancel, camera/orientation và ảnh HEIC nếu nền tảng hỗ trợ.
- [ ] Thử mất mạng/timeout, Back lúc chờ model, đóng/mở app, phiên hết hạn và đổi recipe.
- [ ] Kiểm tra keyboard, safe area, chữ lớn và nhãn đọc màn hình trên thiết bị thật.
- [ ] Ghi hệ điều hành/thiết bị và kết quả thực tế; không thay test native bằng browser emulation.

## Điều kiện hoàn thành

- [ ] Luồng native đạt trên nền tảng bàn giao đã chốt; hạn chế còn lại được ghi rõ.
- [ ] Không tuyên bố đạt cả Android/iOS nếu chỉ kiểm tra một nền tảng.
- [ ] PR/CI tích hợp; không yêu cầu APK/store release trong MVP Expo Go.
- [ ] Sẵn sàng cho [Phase 13](phase-13-acceptance.md).

## Kết quả kiểm tra
