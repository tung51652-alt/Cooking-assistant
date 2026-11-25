# Phase 12 — Trợ lý trên Expo Go

Trạng thái: hỏi đáp, điều khiển bước và khôi phục phiên đã triển khai local.
Kiểm thử Android thật và tích hợp PR còn mở.
Phụ thuộc [Phase 11](phase-11-web.md).

## Mục tiêu

Expo dùng cùng API, phiên và logic bước nấu với web; không tạo backend riêng.

## Thực hiện

- [x] Tích hợp client dùng chung; thêm chat/hướng dẫn từ màn chi tiết công thức.
- [x] Hiển thị bước, controls, loading/error/retry và khôi phục phiên.
- [x] Xử lý Back, bàn phím, safe area, chữ lớn và app background/foreground.
- [x] Hủy/bỏ qua request cũ khi đổi phiên/recipe; không tự gửi lại message khi quay về app.
- [x] Dùng gateway LAN/HTTPS của cùng project `cooklens`, không mở cổng AI hoặc đưa key vào app.

## Kiểm thử

- [x] Chạy typecheck, kiểm tra dependency Expo, export/bundle và shared-client tests.
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

### Chuẩn bị phiên Android

Ngày 2026-11-22, nhánh `codex/phase12-13-prep` đồng bộ với Phase 8–9 đã merge qua PR #21.
Phạm vi triển khai được ghi trong [kế hoạch phiên Android](2026-11-22-mobile-session-groundwork.md).
Màn hướng dẫn dùng chung API phiên và lưu ID gần nhất theo gateway trong SecureStore.
Mở lại cùng công thức tiếp tục phiên còn hiệu lực bằng GET.
Thử lại thao tác giữ nguyên operation ID và payload.
Khi trở lại từ nền, màn hướng dẫn chỉ đọc trạng thái bằng GET.

Kiểm tra local: 13 test lưu/điều khiển phiên và 9 test shared client đạt.
Expo compatibility, TypeScript và bundle Android đạt với dependency đã cài từ lockfile.
Scanner vẫn chặn trường integrity do npm tạo cho dependency mới.
Đã giữ nguyên metadata kiểm chứng của npm.

| Kiểm tra trên thiết bị Android 10+ qua Expo Go | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Ảnh → công thức → bắt đầu → bước tiếp/trước/nhắc lại → kết thúc | Đúng công thức và số bước, kết thúc bằng thao tác rõ ràng | Chưa chạy |
| Nhấn nhanh hoặc phản hồi thao tác bị mất | Một thao tác, retry dùng cùng operation ID | Chưa chạy |
| Back hoặc chuyển nền khi đang tải | Bỏ response cũ, khi trở lại chỉ GET trạng thái | Chưa chạy |
| Đóng và mở lại Expo Go | Khôi phục phiên đã lưu bằng GET | Chưa chạy |
| Mất mạng, 409, 404, 410 | Có thử lại, tải lại trạng thái hoặc tạo phiên mới phù hợp | Chưa chạy |
| Đổi gateway hoặc lỗi SecureStore | Giữ ID ở gateway tương ứng, hiển thị lỗi lưu phù hợp | Chưa chạy |
| Chữ lớn, TalkBack, safe area, quyền camera và HEIC nếu hỗ trợ | Điều khiển dễ dùng và luồng ảnh giữ hành vi | Chưa chạy |

### Hỏi đáp và khôi phục trên source tích hợp

Ngày 2026-11-23, tích hợp local code Phase 10–11 từ PR #22 và nối `/messages` của shared client.
Chat cập nhật snapshot của phiên, giữ draft khi chưa xác nhận, kiểm tra phiên trước khi replay và đọc lại bằng GET khi quay về ứng dụng.
Scanner chấp nhận npm integrity hợp lệ đúng trường của lockfile mobile; các vị trí khác vẫn bị kiểm tra.
Kết quả local Windows: 22 test mobile và 14 test shared client đạt, TypeScript sạch, Expo dependencies đúng và export bundle đạt.
Bundle iOS chỉ là kiểm tra build. Ma trận Android 10+ qua Expo Go, gateway thật và PR/CI vẫn chờ lần nghiệm thu.
