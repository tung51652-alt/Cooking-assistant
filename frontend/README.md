# CookLens frontend

Khung React/TypeScript/Vite dựa trên HTML người dùng cung cấp tại `/home/trantung/ict/FrontEndCookLens`. Làm sớm theo yêu cầu người dùng để review khung/style, chưa là nghiệm thu Phase 4 tích hợp. Nhánh `dangvinh23012006-art-patch-1` đã được kiểm tra: chỉ có `.gitkeep` và `modules.xml`, không có CSS/JS/source UI để tận dụng thêm.

## Nguồn và lựa chọn giao diện

| HTML tham chiếu | Phần dùng lại | Component |
| --- | --- | --- |
| `index.html` | CookLens/navbar, chọn/chụp/xóa ảnh, upload-box/preview-box, IDs input và predict | `src/features/UploadPage.tsx` |
| `recognition.html` | result-card, mainResult/confidence, topResults, confirmButton | `src/features/RecognitionPage.tsx` |
| `recipe.html` | recipe-info-grid, ingredients/recipeInfo, steps-card/recipeSteps | `src/features/RecipePage.tsx` |

Nguồn không có những CSS/JS được HTML tham chiếu. Người dùng đã cho phép bổ sung CSS/JS từ khung này; palette/font/spacing ở `src/styles.css` là bản mới để review, không tuyên bố giống một bộ CSS gốc chưa có. [PR Phase 0 #6](https://github.com/tung51652-alt/Cooking-assistant/pull/6) lưu snapshot/fingerprint HTML gốc; frontend này không phụ thuộc việc PR đó đã merge để build.

Giữ thương hiệu/logo emoji CookLens, nhãn tiếng Việt và URL `/index.html`, `/recognition.html`, `/recipe.html`; `/` cũng mở upload. React điều hướng bằng History API, browser Back/Forward vẫn hoạt động. Khi reload/deep-link, state ảnh không được lưu và màn hình giải thích cách bắt đầu lại. Chưa có link, route, dữ liệu hoặc logic chatbot/cooking assistant.

Design read: app nấu ăn cho người dùng Việt, ưu tiên giữ khung thay vì đổi thương hiệu. `DESIGN_VARIANCE=3`, `MOTION_INTENSITY=1`, `VISUAL_DENSITY=4`. CSS native nhẹ, palette sáng với accent `#21674a`, system fonts, không font/icon CDN. Card giữ đúng các vùng chức năng của HTML nguồn. Skill design-taste chỉ áp dụng audit/preservation/accessibility; đây là product UI nên không áp các quy tắc hero/marketing hoặc thêm motion/layout quảng cáo.

## Chạy và build

Node 22.12+; dùng đúng lockfile:

```bash
cd frontend
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`. Chọn/xem trước/xóa ảnh dùng được ngay. Nhận diện và recipe dùng API thật dưới `/api`; chưa có backend thì UI báo lỗi dịch vụ, không sinh kết quả demo.

Dev server proxy `/api` về `http://127.0.0.1:8080`. Khi backend ở địa chỉ khác, copy `.env.example` thành `.env.local` rồi sửa `VITE_API_PROXY_TARGET`; đây là cấu hình dev công khai, không đặt token trong `VITE_*`. Browser vẫn gọi relative `/api`. Backend public contract theo kế hoạch/PR Phase 0 sẽ được nghiệm thu với service thật ở phase sau.

```bash
npm run build
npm run preview
```

Build type-check rồi tạo `dist/`. Production cần static host có SPA fallback về `index.html` cho ba URL và reverse proxy `/api`; Nginx/Docker đóng gói ở phase triển khai, không coi preview server là bản release. Không có ảnh mẫu, model, recipe corpus hoặc key trong frontend bundle.

## Trạng thái và ranh giới dữ liệu

- Chỉ một JPEG/PNG ≤10 MiB, browser kiểm tra decode/pixel count ≤25 triệu; backend vẫn phải kiểm tra đầy đủ. Kéo-thả/chọn/chụp đều cùng validation; camera có file picker dự phòng tùy thiết bị.
- Top-3 bắt buộc người dùng chọn/xác nhận, không auto-select hoặc gọi recipe khi chưa chọn. Sửa từ danh mục lấy qua API, không hardcode 30 lớp vào UI.
- Thay ảnh/hủy ảnh hủy request đang chạy, xóa prediction/selection/recipe cũ và revoke object URL. Đổi món vô hiệu recipe cũ; không dùng localStorage/sessionStorage hoặc lưu ảnh base64.
- Client kiểm tra shape kết quả, loại recipe sai món đã xác nhận, escape text và chỉ tạo source links HTTP(S). Không hiển thị error body/stack trace tùy ý từ upstream.
- Loading/empty/error/retry có thể thao tác; quantity/time/servings thiếu được hiển thị trung thực, không bịa giá trị.

## Kiểm tra UI

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

E2E chạy build production qua preview server ở desktop 1440×900 và mobile 390×844. Fixtures chỉ nằm trong `tests/` và route interception của Playwright, không được import vào source app. Bao gồm xác nhận thủ công, search/detail, ảnh lỗi/quá lớn, dịch vụ lỗi, thay ảnh khi request đang chạy, sửa món/empty result, deep-link và escape nội dung/source URL.

Nếu máy đã có Chromium tương thích, có thể truyền `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` khi chạy test; không hardcode đường dẫn máy thành viên trong repo. `test-results`, trace và reports được ignore. Bốn ảnh trong `docs/` là baseline mới có chủ đích: upload desktop/mobile, recognition và recipe desktop. Hai ảnh kết quả/recipe dùng API fixture có nhãn kiểm thử, không phải bằng chứng inference/retrieval thật. Đặt `COOKLENS_CAPTURE_BASELINES=1` lúc chạy suite để cập nhật chúng có chủ đích; test mặc định không ghi đè baseline. Không đưa output test hàng loạt vào Git.

Trước PR: build/E2E, rà diff/file thừa/test tạm, secrets/password hashes, lockfile/bundle. File test hồi quy hữu ích được giữ; checksum/integrity trong lockfile là metadata hợp lệ. Chưa có image runtime để kiểm tra layer trong PR khung này; chờ người dùng merge, không auto-merge.
