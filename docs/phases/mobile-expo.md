# Mobile Expo — triển khai theo yêu cầu cùng Phase 5

Nhánh `feature/mobile-expo` tách từ `develop` sau PR Phase 4 #14, PR riêng với Phase 5 Docker. Người dùng yêu cầu làm Expo ngay cùng Phase 5; thay cho lịch triển khai Expo ở mốc sau, giữ nguyên phạm vi/domain và backend hiện có. Ngày 2026-10-26, sau khi xác nhận upload ảnh hoạt động, người dùng trực tiếp yêu cầu agent push bản sửa, xử lý conflict và merge PR #17 vào develop sau kiểm tra. Không bắt đầu phát hành store/APK.

## Đã triển khai

- Expo SDK 58/React Native 0.88, camera/system photo picker, chuẩn hóa JPEG/orientation, giới hạn pixel/upload và thu dọn cache ảnh trong phạm vi app.
- Preview/đổi ảnh, Top-3 chưa tự chọn, danh mục từ API, xác nhận rõ ràng, query scoped theo món, list/detail/nguồn/license/provenance. Có empty/error/retry, safe area, nhãn đọc màn hình và font local.
- Hủy request và chặn response cũ khi đổi ảnh/món, Back, navigation hoặc app rời foreground; không tự upload khi quay lại. Không lưu lịch sử hoặc model trên điện thoại.
- `packages/cooklens-api` chứa types/validation/transport thuần dùng chung; schema authoritative vẫn sinh từ OpenAPI ở frontend. Web gửi FormData bằng fetch; Expo dùng adapter native `File.upload` của Expo FileSystem với multipart field `file`, JPEG MIME, request ID và AbortSignal. Cả hai dùng cùng kiểm tra response, timeout và lỗi HTTP. Không sao chép taxonomy/corpus vào app.
- Overlay LAN dev tường minh chỉ publish gateway của stack Phase 3. Compose mặc định không bị mở port; cùng public API dùng cho cả web và Expo.

## Bằng chứng và giới hạn

TypeScript mobile, kiểm tra dependency Expo và bundling Android/iOS đã pass local. Sáu contract tests client dùng dữ liệu/schema thật, gồm malformed/duplicate/cross-dish, API version/request ID, cancel response chậm và mất mạng. Build TypeScript/Vite web và 20 Playwright desktop/mobile sau refactor đã pass. Lượt local dùng Chromium Edge sẵn có qua biến executable path của test config vì tải browser Playwright bị timeout; không hardcode đường dẫn máy vào source.

Tám checks của [PR #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17) đã pass trên commit triển khai, gồm Expo push/PR, backend real stack, frontend browser/Docker với AI thật, CV, recipes, corpus và artifact inputs. Đây là bằng chứng tương thích client dùng chung với web/server; chưa phải camera/native transport trên điện thoại thật.

Ngày 2026-10-26, người dùng thử Expo Go trên điện thoại thật. Swagger và GET health từ app đều hoạt động, nhưng fetch multipart của React Native báo lỗi transport khi gửi ảnh. Chuyển riêng transport ảnh sang uploader native Expo FileSystem; người dùng xác nhận “ok được rồi”. Đây là bằng chứng upload ảnh tới gateway LAN và nhận kết quả trên thiết bị đang thử, không phải đo accuracy hoặc xác nhận mọi luồng/cả hai hệ điều hành. Log chẩn đoán tạm đã được loại khỏi code; không lưu địa chỉ thiết bị, ảnh gốc hoặc request ID vào báo cáo.

Chưa xác định hệ điều hành/model điện thoại từ phản hồi của người dùng. Chưa nghiệm thu toàn bộ chọn/xác nhận món → công thức → chi tiết, camera/HEIC/orientation trên từng hệ điều hành, permission denied/cancel, safe area/chữ lớn/screen reader và quay lại foreground. Không dùng bundle thành công hoặc viewport web thay bằng chứng thiết bị thật. Checklist giữ các mục này chưa hoàn thành.

## Rà soát tích hợp

Bản sửa upload có chín contract tests pass, gồm adapter URI/header, giữ fetch cho API khác, hủy upload và lỗi HTTP/descriptor không hợp lệ. Mobile typecheck, Expo dependency check và bundle Android/iOS pass sau cập nhật các bản vá tương thích trong SDK 58. Web TypeScript/build và scanner static asset pass. Log export native ở CI được giữ tạm trên runner, không in tên bundle có giá trị mã/hash và không upload output native.

Phase 4 web và Phase 5 Docker đã đủ checklist/bằng chứng trên develop. PR Expo cập nhật từ develop bằng merge thường, giải quyết README theo trạng thái mới nhất và giữ nguyên các tài liệu phase đã nghiệm thu. Không force-push hoặc đưa thay đổi của Phase 6 vào PR này. Kiểm tra cuối PR gồm client contracts, typecheck/dependency/bundle mobile, web build/E2E, scanner metadata, diff/whitespace và các gate GitHub liên quan. Các output dist/Metro/cache/log không đưa vào commit; tests hồi quy nằm đúng packages và không COPY vào runtime image.

[Hướng dẫn chạy Expo Go và kiểm tra LAN](../../mobile/README.md). Workflow Mobile Expo kiểm tra source policy, contracts, SDK compatibility, typecheck và bundle hai nền tảng; không publish hoặc upload artifact native.
