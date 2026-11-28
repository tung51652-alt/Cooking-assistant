# CookLens Mobile — Expo Go

Client React Native dùng chung API và taxonomy với web. Chụp/chọn ảnh → Top-3 → xác nhận món → công thức → hỏi đáp và hướng dẫn nấu.
Model chạy ở backend/provider; Expo truy cập qua gateway.

Expo Go SDK 58, React Native 0.88.1, Android 10+ và Node 22.13 trở lên cho Metro.
Giữ lockfile và trường npm integrity đã sinh cho dependency.
Xem [Expo SDK reference](https://docs.expo.dev/versions/v58.0.0/).

## 1. Kết nối gateway

Nếu nhóm đã cấp gateway HTTPS, dùng URL đó và tiếp tục sang bước Expo. Máy chạy Metro không cần Docker.
Với gateway riêng trong LAN, điện thoại và máy Docker cùng mạng. Trên máy Docker, từ thư mục chứa Compose của ứng viên có trợ lý:

```powershell
$env:HOST_BIND = '192.168.1.10'
docker compose up -d
```

Thay IP ví dụ bằng IP LAN thực của máy Docker. Gateway dùng cùng stack với web và mở cổng 8080 cho frontend.
Kiểm tra `/api/health` từ trình duyệt điện thoại trước khi mở Expo Go.
Nếu health không mở được, kiểm tra IP/bind, firewall, Wi-Fi cách ly thiết bị hoặc HTTPS gateway.
Nếu health mở được nhưng QR lỗi, kiểm tra kết nối của điện thoại tới Metro trên máy chạy Node.
Xem [hướng dẫn triển khai](../docs/deployment.md) để chạy ứng viên có trợ lý và cấu hình key ở runtime.

## 2. Cài và chạy Expo

Cài Expo Go tương thích SDK trên điện thoại theo [hướng dẫn Expo](https://docs.expo.dev/get-started/start-developing/). Từ root source:

```powershell
cd mobile
npm ci --ignore-scripts --no-audit --no-fund
$env:EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.10:8080/api'
npm start
```

Quét QR bằng Expo Go trên Android. Với HTTPS, thay URL ví dụ bằng gateway đã cấp và giữ hậu tố `/api`.
Khi đổi URL, khởi động lại Metro. Chạy `npx expo start --clear` nếu app còn dùng giá trị cũ.
Chỉ đưa base URL công khai vào `EXPO_PUBLIC_*`. Giữ `LLM_API_KEY` riêng ở backend.

## 3. Thử luồng

1. Chụp hoặc chọn một ảnh món ăn. Camera hỏi quyền khi bấm; từ chối/hủy không xóa ảnh đã chọn, thư viện là lựa chọn thay thế. System photo picker chỉ cấp quyền ảnh được chọn, không yêu cầu truy cập toàn bộ thư viện.
2. App dùng native decoder để xử lý orientation, chuẩn hóa ảnh sang JPEG, kiểm tra không quá 25 triệu pixel và file upload không quá 10 MiB. Không tự xoay lại ảnh dựa trên suy đoán. HEIC được chuyển qua image manipulator, không nới định dạng server.
3. Bấm Nhận diện món; app gửi ảnh JPEG từ cache trên điện thoại bằng uploader native Expo FileSystem, field multipart là `file`, giữ timeout/cancellation và request ID của client dùng chung. App không tự chọn dự đoán đầu. Chọn một trong Top-3 hoặc mở danh mục 30 món từ API, rồi bấm Xác nhận.
4. Tìm công thức theo món đã xác nhận; query tùy chọn chỉ xếp hạng trong món đó. Xem nguyên liệu/định lượng/bước nấu/nguồn/license và ghi chú AI-authored. Giá trị thiếu được hiển thị trung thực.
5. Thử đổi ảnh, đổi món, Back và rời/quay lại ứng dụng. HTTP đang chạy bị hủy khi rời app hoặc đổi luồng; response đến muộn không được ghi đè lựa chọn mới. Khi mất mạng có lỗi và nút thử lại; không tự gửi lại ảnh khi về foreground.

Ảnh và state chỉ phục vụ phiên hiện tại, không có lịch sử hoặc lưu vào thư viện. Cache ảnh chuẩn hóa được thu dọn khi đổi ảnh/unmount; bản sao tạm của picker chỉ bị xóa nếu nằm trong cache của chính app. Không xóa ảnh gốc của người dùng. Force-kill có thể để lại cache tạm do hệ điều hành quản lý; không coi cache là lịch sử ảnh và không upload lại khi mở app.

## Phiên hướng dẫn nấu trên Android

Luồng này dùng gateway từ ứng viên chứa API phiên và hỏi đáp. `2.0.0-rc.2` phục vụ luồng ảnh/công thức.
Trong trang chi tiết, chọn **Hướng dẫn nấu**. Gửi câu hỏi về công thức hoặc chọn **Bắt đầu nấu** rồi dùng các nút bước tiếp, bước trước và kết thúc.
Chọn **Tiếp tục phiên nấu** ở màn hình đầu để đọc phiên đã lưu của gateway đang cấu hình.
Nếu phiên đã hết hạn, mở lại công thức để tạo phiên mới.
Khi trở lại ứng dụng, màn hướng dẫn chỉ đọc trạng thái từ máy chủ.
Nếu câu trả lời bị gián đoạn, chọn **Kiểm tra phiên**. Sau đó có thể thử lại cùng yêu cầu hoặc tiếp tục mà không gửi lại.
Khi provider không khả dụng, app hiện lỗi hỏi đáp và vẫn cho điều khiển bước khi đã đồng bộ phiên.

Phiên giữ công thức, bước và hội thoại ở backend trong 24 giờ.
Ứng dụng dùng SecureStore để giữ ID phiên gần nhất và địa chỉ gateway tương ứng.
Nếu thiết bị không lưu được ID, điều khiển bước vẫn hoạt động trong phiên đang mở.

Người dùng cũng có thể mở **Cài đặt trợ lý** để chọn chế độ **Mặc định hệ thống** hoặc **Dùng khóa API riêng** (Google Gemini, OpenAI, NVIDIA NIM, hoặc nhà cung cấp tùy chỉnh tương thích OpenAI qua HTTPS). Khóa API riêng được lưu trong `expo-secure-store` trên thiết bị, có thể kiểm tra trước qua nút **Kiểm tra kết nối (Test hello)**, và chỉ được gửi trực tiếp qua header `X-LLM-*` kèm yêu cầu hỏi đáp; có thể bấm **Quay về mặc định** để xóa khóa bất kỳ lúc nào.

## Kiểm tra

Từ root, chạy `npm --prefix mobile run test:assistant` để kiểm tra xử lý phiên, lưu ID và cấu hình khóa API trợ lý.

```powershell
npx expo install --check
npm run typecheck
npm run export
```

Lệnh export chỉ kiểm chứng bundling Android/iOS, không phát hành bundle hoặc native app. Output `dist`, Metro cache và metadata tự sinh không commit/upload làm release. Font Epilogue/Plus Jakarta Sans được đóng gói local; giấy phép tại `notices/`.

Từ root repo, chạy `node --experimental-strip-types --test packages/cooklens-api/client.test.mjs` để kiểm tra contract dùng chung.
Ma trận Android thật nằm trong [kế hoạch phát hành](../docs/plan/2026-11-27-release-2.1.0.md); kết quả ghi vào [acceptance](../docs/acceptance.md).
