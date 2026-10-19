# CookLens Mobile — Expo Go

Client React Native dùng chung public API và taxonomy với web: chụp/chọn ảnh → Top-3 → xác nhận hoặc sửa món → tối đa ba công thức → chi tiết nguyên liệu, bước nấu và nguồn. Không chạy model trên điện thoại, không gọi trực tiếp CV/recipes/Qdrant, không thêm chatbot/tài khoản/lịch sử và không build APK/AAB.

Expo SDK 58, React Native 0.88 và các thư viện được chọn qua `expo install` để dùng với Expo Go. Các version trực tiếp được pin; lockfile không lưu integrity literals theo policy repo. Cần Node 22.13 trở lên. SDK/hệ điều hành hỗ trợ theo [Expo SDK reference](https://docs.expo.dev/versions/latest/).

## 1. Khởi động backend trên mạng LAN

Điện thoại và máy Docker cần cùng mạng LAN, hoặc dùng URL HTTPS của gateway đã triển khai. Không dùng `127.0.0.1` trên điện thoại để chỉ máy tính. Metro/QR và gateway là hai kết nối riêng; quét QR thành công chưa chứng minh API truy cập được.

Với các image Phase 3 đã build theo README gốc, từ root repo trong PowerShell:

```powershell
$env:COOKLENS_LAN_IP = '192.168.1.10'
docker compose -p cooklens-mobile-dev -f deploy/compose/recipes.phase2.yml -f deploy/compose/backend.phase3.yml -f deploy/compose/mobile.lan.yml up -d
```

Thay IP ví dụ bằng địa chỉ LAN riêng của máy Docker. Overlay bắt buộc khai báo IP, chỉ publish gateway; CV/recipes/Qdrant giữ nội bộ. Mặc định các Compose hiện có vẫn bind loopback. Chỉ cho phép cổng 8080 trên mạng riêng trong firewall khi cần; không bind toàn Internet. Trong trình duyệt điện thoại kiểm tra `http://192.168.1.10:8080/api/health` trả trạng thái ready trước khi dùng app.

Khi dùng frontend/proxy Phase 5 đã cấu hình truy cập được trên LAN/HTTPS, có thể dùng chính origin đó cộng `/api`; không dựng backend mobile riêng. Overlay ở đây dành riêng stack Phase 3, không ghép vào Compose release Phase 5.

## 2. Cài và chạy Expo

Cài Expo Go tương thích SDK trên điện thoại theo [hướng dẫn Expo](https://docs.expo.dev/get-started/start-developing/). Từ root source:

```powershell
cd mobile
npm ci --ignore-scripts --no-audit --no-fund
$env:EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.10:8080/api'
npm start
```

Quét QR bằng Expo Go trên Android hoặc ứng dụng Camera/Expo Go trên iOS theo hướng dẫn CLI. Không yêu cầu Android Studio, EAS Build hay APK. QR và base URL là cấu hình public; không đưa token/API key vào biến `EXPO_PUBLIC_*`. Có thể sao chép `.env.example` thành `.env` local nếu muốn; file đó bị Git ignore. Khi đổi base URL, khởi động lại Metro; chạy `npx expo start --clear` nếu còn cấu hình cũ.

## 3. Thử luồng

1. Chụp hoặc chọn một ảnh món ăn. Camera hỏi quyền khi bấm; từ chối/hủy không xóa ảnh đã chọn, thư viện là lựa chọn thay thế. System photo picker chỉ cấp quyền ảnh được chọn, không yêu cầu truy cập toàn bộ thư viện.
2. App dùng native decoder để xử lý orientation, chuẩn hóa ảnh sang JPEG, kiểm tra không quá 25 triệu pixel và file upload không quá 10 MiB. Không tự xoay lại ảnh dựa trên suy đoán. HEIC được chuyển qua image manipulator, không nới định dạng server.
3. Bấm Nhận diện món; app không tự chọn dự đoán đầu. Chọn một trong Top-3 hoặc mở danh mục 30 món từ API, rồi bấm Xác nhận.
4. Tìm công thức theo món đã xác nhận; query tùy chọn chỉ xếp hạng trong món đó. Xem nguyên liệu/định lượng/bước nấu/nguồn/license và ghi chú AI-authored. Giá trị thiếu được hiển thị trung thực.
5. Thử đổi ảnh, đổi món, Back và rời/quay lại ứng dụng. HTTP đang chạy bị hủy khi rời app hoặc đổi luồng; response đến muộn không được ghi đè lựa chọn mới. Khi mất mạng có lỗi và nút thử lại; không tự gửi lại ảnh khi về foreground.

Ảnh và state chỉ phục vụ phiên hiện tại, không có lịch sử hoặc lưu vào thư viện. Cache ảnh chuẩn hóa được thu dọn khi đổi ảnh/unmount; bản sao tạm của picker chỉ bị xóa nếu nằm trong cache của chính app. Không xóa ảnh gốc của người dùng. Force-kill có thể để lại cache tạm do hệ điều hành quản lý; không coi cache là lịch sử ảnh và không upload lại khi mở app.

## Kiểm tra

```powershell
npx expo install --check
npm run typecheck
npm run export
```

Lệnh export chỉ kiểm chứng bundling Android/iOS, không phát hành bundle hoặc native app. Output `dist`, Metro cache và metadata tự sinh không commit/upload làm release. Font Epilogue/Plus Jakarta Sans được đóng gói local; giấy phép tại `notices/`.

Từ root repo, kiểm tra client dùng chung: `node --experimental-strip-types --test packages/cooklens-api/client.test.mjs`. Web vẫn có bộ Playwright desktop/mobile riêng. Các kiểm tra build/contract không thay thế camera, permission, gesture/Back, safe area hoặc screen reader trên thiết bị thật. Xem [báo cáo Expo](../docs/phases/mobile-expo.md); Android/iOS thật còn chờ người dùng chạy nghiệm thu, không đánh dấu pass từ web emulation.
