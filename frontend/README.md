# CookLens frontend

React/TypeScript/Vite cho luồng ảnh → Top-3 → xác nhận/sửa món → công thức. Phase 4 dùng **nguồn đúng** `/home/trantung/ict/stitch_giao_di_n_chatbot_m_th_c`; xem [snapshot và đối chiếu thiết kế](../docs/frontend-reference/stitch/README.md). Nguồn FrontEndCookLens trước đây được giữ như lịch sử Phase 0, không còn là baseline giao diện.

Web responsive cho máy tính và trình duyệt điện thoại. App Expo dùng chung API đang ở PR #17, chưa merge; không APK. Không chatbot, tài khoản, lưu bộ sưu tập hoặc cooking assistant. Panel trợ lý trong nguồn chuyển thành hướng dẫn ba bước đúng chức năng hiện tại.

## Thiết kế và tổ chức

Giữ CookLens, nền kem, accent cam, font Epilogue/Plus Jakarta Sans, hai panel upload/preview, card bo góc và footer theo Stitch. Trang nhận diện và công thức được mở rộng từ tokens; nguồn chỉ cung cấp một trang home/chat. Font tự host từ Fontsource, icon Phosphor; bốn notices trong public/notices được đóng gói vào image. Không CDN lúc runtime.

Design read: sản phẩm nấu ăn tiếng Việt, ưu tiên bảo toàn thiết kế cung cấp. DESIGN_VARIANCE=3, MOTION_INTENSITY=1, VISUAL_DENSITY=4. Skill design-taste chỉ dùng audit/preservation/accessibility. CSS native, không thêm framework hay motion quảng cáo. Nút camera xanh đậm hơn nguồn để tăng độ tương phản chữ trắng.

- src/features: UploadPage, RecognitionPage, RecipePage.
- src/lib/api.ts: HTTP client, deadline và validation runtime.
- src/generated/api.d.ts: schema sinh từ OpenAPI; src/types.ts dùng lại DTO, không định nghĩa contract song song.
- src/App.tsx: state, điều hướng History API, hủy request cũ và focus khi đổi trang.
- src/styles.css: tokens, responsive, focus và reduced motion.

Giữ URL /index.html, /recognition.html, /recipe.html và /. Back/Forward hoạt động; reload/deep-link không có state sẽ hướng dẫn bắt đầu lại. Ảnh chỉ ở RAM, object URL được giải phóng; không localStorage/sessionStorage/base64 persistence.

## Chạy Docker với AI thật

Từ root repository, sau khi đã build các image Phase 1–3 và image frontend:

```bash
docker build -f deploy/docker/Dockerfile.frontend -t cooklens-frontend:phase4 .
docker compose -p cooklens-phase4-local \
  -f deploy/compose/recipes.phase2.yml \
  -f deploy/compose/backend.phase3.yml \
  -f deploy/compose/frontend.phase4.yml up -d
```

Mở http://127.0.0.1:5173/. Đây là overlay dev/review của web Phase 4; hướng dẫn build/stage model của từng service nằm trong README backend/AI. Compose Phase 5 đã có image candidate; Docker Hub release và pull trên máy sạch thuộc Phase 6. Chưa phát hành `v2.0.0`.

Nginx phục vụ bundle và proxy /api cùng origin tới backend theo DNS Compose. Chỉ frontend publish loopback; backend/AI/Qdrant ở network internal. Runtime user 10001, read-only, tmpfs, budget 128 MiB/1 CPU. Không COPY source/tests/docs/node_modules vào runtime image. Liveness tại /health/live; readiness toàn stack tại /api/health.

Proxy giới hạn multipart 11 MiB và JSON search 8 KiB, stream body, không retry. Lỗi transport của Nginx trả JSON/request ID; lỗi nghiệp vụ backend được giữ nguyên. Kết nối không lập được trả 503; upstream đã kết nối nhưng phản hồi quá chậm trả 504. Backend và CV tiếp tục kiểm tra kích thước file/deadline/định dạng.

Dừng riêng stack review, giữ volumes:

```bash
docker compose -p cooklens-phase4-local \
  -f deploy/compose/recipes.phase2.yml \
  -f deploy/compose/backend.phase3.yml \
  -f deploy/compose/frontend.phase4.yml down
```

## Phát triển

Node 22.12+:

```bash
cd frontend
npm ci
npm run dev
```

Dev proxy /api về http://127.0.0.1:8080. Có thể copy .env.example thành .env.local và sửa VITE_API_PROXY_TARGET; không đặt token trong VITE_*. npm run build tạo dist; npm run preview chỉ dành kiểm tra build, không là production server.

Sau khi đổi controller/DTO, chạy deploy/scripts/generate_frontend_contract.sh từ root với backend đang chạy, rồi build frontend. Script pin generator và CI kiểm tra kết quả sinh lại. Phase 4 sửa OpenAPI thiếu schema 200/camelCase sai để khớp snake_case wire API v1.0.0 vốn có.

## Ranh giới dữ liệu

Một JPEG/PNG tối đa 10 MiB/25 triệu pixel; kéo-thả/chọn/chụp cùng validation. Camera tùy trình duyệt và có file picker thay thế. Top-3 không tự chọn; người dùng phải xác nhận hoặc sửa từ danh mục API. Query tùy chọn chỉ xếp hạng recipe trong món đã xác nhận. Confidence CV khác điểm cosine retrieval; không gắn nhãn cả hai là xác suất.

Client kiểm tra API version, UUID/header, shape và metadata versions, Top-3/rank/score, danh mục 30 món và recipe đúng món. Thay ảnh/món hoặc điều hướng hủy và bỏ qua response cũ. Text được escape; source links chỉ HTTP(S) không credential. Loading/empty/error/retry có thể thao tác; dữ liệu thời gian/khẩu phần thiếu hiển thị trung thực. Nguồn/license/AI-authored provenance và attribution có trong list/detail.

## Kiểm chứng

```bash
cd frontend
npx playwright install chromium
npm run build
npm run test:e2e
COOKLENS_REAL_API=1 COOKLENS_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
```

20 mocked tests và 6 tests với Docker/CV/E5/Qdrant thật ở desktop 1440×900, mobile 390×844. Bao gồm xác nhận thủ công, sửa món/query, đủ detail/provenance, lỗi/empty/timeout, navigation race, ảnh thay thế, escaping, keyboard, deep-link, không overflow hoặc request CDN. Mobile là emulation, chưa thử camera trên điện thoại thật. Có thể truyền PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH khi máy có Chromium tương thích; không hardcode đường dẫn thành viên.

Bốn baseline upload desktop/mobile, recognition desktop, recipe desktop trong docs được chụp bằng API thật. COOKLENS_CAPTURE_BASELINES=1 trong suite thật mới ghi đè chúng; test mặc định không ghi ảnh. Hai stitch-reference screenshots được chụp từ HTML tham chiếu tại cùng viewport để đối chiếu, có dùng CDN của nguồn khi chụp; CDN không có trong app runtime.

Từ root, python3 deploy/scripts/check_frontend_build.py kiểm tra bundle và notices. python3 deploy/scripts/smoke_frontend_container.py kiểm tra image/proxy và cố ý dừng rồi phục hồi backend của project review; không chạy harness fault trên project khác. Báo cáo đầy đủ tại docs/phases/phase-4.md.

Trước PR phải rà file/test tạm, build output, secrets và mọi literal mã/hash bị cấm, cả lockfile/static bundle. Không commit integrity metadata do npm sinh lại, không source maps, asset filenames ổn định. Giữ tests hồi quy có mục đích; không đưa trace/log/test-results vào Git hoặc image.
