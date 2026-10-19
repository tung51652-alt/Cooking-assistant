# Mobile Expo — triển khai theo yêu cầu cùng Phase 5

Nhánh `feature/mobile-expo` tách từ `develop` sau PR Phase 4 #14, PR riêng với Phase 5 Docker. Người dùng yêu cầu làm Expo ngay cùng Phase 5; thay cho lịch triển khai Expo ở mốc sau, giữ nguyên phạm vi/domain và backend hiện có. Không merge tự động, không bắt đầu phát hành store/APK.

## Đã triển khai

- Expo SDK 58/React Native 0.88, camera/system photo picker, chuẩn hóa JPEG/orientation, giới hạn pixel/upload và thu dọn cache ảnh trong phạm vi app.
- Preview/đổi ảnh, Top-3 chưa tự chọn, danh mục từ API, xác nhận rõ ràng, query scoped theo món, list/detail/nguồn/license/provenance. Có empty/error/retry, safe area, nhãn đọc màn hình và font local.
- Hủy request và chặn response cũ khi đổi ảnh/món, Back, navigation hoặc app rời foreground; không tự upload khi quay lại. Không lưu lịch sử hoặc model trên điện thoại.
- `packages/cooklens-api` chứa types/validation/transport thuần dùng chung; schema authoritative vẫn sinh từ OpenAPI ở frontend. Web giữ adapter `File`; Expo dùng multipart URI descriptor. Không sao chép taxonomy/corpus vào app.
- Overlay LAN dev tường minh chỉ publish gateway của stack Phase 3. Compose mặc định không bị mở port; cùng public API dùng cho cả web và Expo.

## Bằng chứng và giới hạn

TypeScript mobile, kiểm tra dependency Expo và bundling Android/iOS đã pass local. Sáu contract tests client dùng dữ liệu/schema thật, gồm malformed/duplicate/cross-dish, API version/request ID, cancel response chậm và mất mạng. Build TypeScript/Vite web và 20 Playwright desktop/mobile sau refactor đã pass. Lượt local dùng Chromium Edge sẵn có qua biến executable path của test config vì tải browser Playwright bị timeout; không hardcode đường dẫn máy vào source. Docker/API thật tiếp tục được CI kiểm tra trên PR.

Chưa có điện thoại/emulator Android hoặc iOS kết nối phiên làm việc này. Chưa xác nhận từ điện thoại tới gateway thật, camera, HEIC/orientation trên từng hệ điều hành, permission denied/cancel, safe area/chữ lớn/screen reader và quay lại foreground trên thiết bị. Không dùng bundle thành công hoặc viewport web thay bằng chứng thiết bị thật. PR/checklist giữ rõ phần chờ kiểm chứng này.

[Hướng dẫn chạy Expo Go và kiểm tra LAN](../../mobile/README.md). Workflow Mobile Expo kiểm tra source policy, contracts, SDK compatibility, typecheck và bundle hai nền tảng; không publish hoặc upload artifact native.
