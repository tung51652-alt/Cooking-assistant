# Phase 4 — Frontend Stitch và API thật

Trạng thái: triển khai và kiểm thử kỹ thuật hoàn tất trên feature/frontend-phase4, chờ người dùng review/merge. Develop đã chứa PR Phase 3 #13 trước khi tách nhánh. Chưa phát hành v2.0.0 hoặc push bộ image Docker Hub; Compose release/pull thuộc Phase 5–6.

## Nguồn và thiết kế

Người dùng sửa nguồn thành /home/trantung/ict/stitch_giao_di_n_chatbot_m_th_c. Giữ code.html và screen.png byte-for-byte trong [snapshot chuẩn](../frontend-reference/stitch/README.md). Snapshot FrontEndCookLens cũ vẫn bất biến để audit Phase 0, được đánh dấu đã thay thế. Không copy demo/chat vào runtime.

Frontend giữ nền kem, cam, typography Epilogue/Plus Jakarta Sans, hai panel, card bo góc và footer. Font/icon self-host có OFL/MIT notices. Nút camera xanh đậm hơn nguồn để tăng tương phản. Navigation chỉ giữ chức năng thật; panel chat trở thành hướng dẫn ba bước. Recognition/list/detail mở rộng theo tokens vì nguồn chỉ có home/chat. Không chatbot/accounts/saved/cook mode, không APK; Expo giữ cho mốc sau.

Nguồn và app được chụp ở viewport desktop 1440×900 và mobile 390×844. Hai ảnh tham chiếu chụp viewport-only từ HTML nguồn dùng CDN; bốn baseline app full-page được chụp với API thật, fonts local. Screen PNG gốc có viewport/DPR chưa biết, giữ để tham khảo; không tuyên bố pixel-perfect. Đã xem ảnh upload/recognition/detail và kiểm tra responsive trong browser. Design read: DESIGN_VARIANCE=3, MOTION_INTENSITY=1, VISUAL_DENSITY=4; skill design-taste chỉ áp dụng audit/preservation/accessibility cho product UI.

## Tích hợp và contract

Luồng ảnh → Top-3 → xác nhận/sửa từ danh mục API → search theo món → detail hoạt động với CV/E5/Qdrant thật. Query tùy chọn không được đổi món đã xác nhận. Ingredients/steps/nguồn/license/attribution và AI-authored provenance lấy từ DTO; null/empty hiển thị trung thực, không thêm dữ liệu demo.

Client dùng types sinh từ OpenAPI, kiểm tra API version, UUID header/envelope, metadata versions, shape/Top-3/rank/score/catalog và recipe đúng món. Không hardcode bản sao taxonomy hoặc model version trong UI. Thay ảnh/món/điều hướng hủy request và bỏ qua kết quả cũ; object URL được giải phóng, không lưu ảnh/state qua reload. Text escape, link nguồn chỉ HTTP(S) không credential.

Phát hiện OpenAPI Phase 3 sinh camelCase khác snake_case wire API và thiếu schema 200. Bổ sung tên JsonProperty rõ ràng và typed success schemas, sinh lại TypeScript; top_k vẫn optional dù có default. API wire/version không đổi. JUnit bổ sung assertion cho schema để tránh tái diễn.

## Docker và proxy

Image frontend nhiều stage Node → Nginx, user 10001, read-only/tmpfs, budget 128 MiB/1 CPU. Không source/tests/docs/node_modules trong runtime. Font/icon và notices ở local; assets dùng tên ổn định, no-cache, không source maps hoặc mã hash trong tên file. Build checker kiểm tra cả output local và static files copy từ image.

Overlay Phase 4 gộp các Compose Phase 2/3, chỉ publish frontend loopback 5173; backend/AI/Qdrant internal. Nginx proxy /api qua DNS service, giới hạn JSON/upload, stream body, không retry, typed error JSON và request ID. Không thay lỗi nghiệp vụ upstream bằng HTML. Kết nối không lập được trả 503, timeout sau kết nối trả 504. Không coi browser bridge của frontend là network bị chặn Internet; app không phụ thuộc external requests, còn service AI/backend chỉ trên internal network.

[Evidence container](evidence/phase-4-frontend-container.json) kiểm tra user/read-only, ports/networks, nginx -t, artifact policy, 8 KiB JSON/11 MiB multipart early rejection, envelope/UUID, giữ 422 nghiệp vụ, dừng/phục hồi backend và trang static vẫn mở khi backend dừng. Frontend memory peak khoảng 8,3 MiB trong riêng lượt smoke sau khi recreate; không phải benchmark browser/concurrency hoặc toàn stack. Giữ budget 128 MiB; Phase 5/7 tiếp tục nghiệm thu tài nguyên.

## Kiểm chứng và giới hạn

- 20 Playwright mocked tests: 10 ca trên hai viewport, gồm flow/confirmation, upload lỗi, empty/malformed/cross-dish, unsafe text/URL, timeout/retry, đổi ảnh/món và navigation race.
- 6 Playwright với AI thật: ảnh fixture chạy CV, chọn dự đoán thứ hai, search/detail đầy đủ; sửa sang Phở, scoped query; sửa sang Bánh căn và hiển thị provenance AI; local fonts/no external requests, keyboard skip-link, deep-link, không overflow.
- 13 JUnit backend integration tests qua, gồm assertion OpenAPI mới. TypeScript/build frontend qua; schema sinh lại phải giống bản commit. CI frontend dựng stack và chạy lại cả suite giả lập/thật/proxy.
- Mobile là browser emulation, chưa nghiệm thu camera/permissions trên điện thoại thật. Không coi smoke ảnh fixture là benchmark accuracy hoặc kiểm chứng dinh dưỡng/ẩm thực. Review độc lập/thử nấu và nghiệm thu chất lượng Phase 7 vẫn còn.
- README gốc hướng dẫn đúng bản local hiện tại: stage model, precompute bundle, build bốn image, Compose, thử ảnh, health/logs, dừng/reboot. Chưa hứa chỉ pull Docker Hub ở Phase 4.

## Rà soát cuối phase

Giữ tests hồi quy và sáu ảnh đối chiếu/baseline có mục đích; loại output tạm khỏi Git/image. Không sửa file CHANGELOG.md chưa track của người dùng, không xóa stack/volume các phase trước. Khung HTML tham chiếu chỉ là tài liệu và không COPY vào image.

Scanner kiểm tra source/docs/lockfile/notices và static bundle; không literal secret/token/SHA/hash/checksum/digest/revision identifiers. Transfer verification chỉ trong RAM theo policy. Npm integrity metadata được loại trước commit; không nới scanner để bỏ qua bundle/font/icon. Không lưu request ID hoặc model binaries vào evidence.

- [x] Đối chiếu nguồn đúng, UI responsive và notices local.
- [x] API/DTO thật, xác nhận thủ công, query/detail/provenance và cancellation.
- [x] Docker/proxy và test desktop/mobile với AI thật.
- [x] Rà metadata/whitespace và file/test tạm trước PR; 13 deploy tests và 7 data tests cũng qua.
- [ ] Người dùng review/merge PR Phase 4; fetch develop trước Phase 5.
