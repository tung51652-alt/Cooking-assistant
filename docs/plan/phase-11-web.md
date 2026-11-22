# Phase 11 — Trợ lý trên web

Trạng thái: implementation web local đã hoàn tất; các check trợ lý cần thiết qua, human review Phase 10 và tích hợp PR/CI còn mở.
Phụ thuộc [Phase 10](phase-10-llm.md).
Phase 10 có các gate runtime kỹ thuật qua, human review/PR còn mở.
Tiếp tục phần implementation/test Phase 11 để không chặn công việc local đã được giao; không coi việc này là đóng các gate nghiệm thu Phase 10 hoặc cho phép publish/commit/push.

## Cách triển khai

Thêm route `assistant.html` vào SPA hiện có, lối vào từ recipe detail và nav để khôi phục phiên gần nhất.
Dùng nguyên shared API client; lấy `corpus_version` từ recipe document, không tự tạo snapshot hay state nấu ở client.
Chỉ lưu session ID/recipe ID trong localStorage; text/lịch sử/key không persist ở client.
Abort và generation guard khi unmount/đổi recipe, mutex đồng bộ chặn double submit, giữ operation ID khi retry yêu cầu có kết quả chưa rõ.
Error có mã/version conflict refresh phiên, expiry/terminal có lối tạo/chọn phiên mới; không auto retry chat hoặc tự điều khiển từ nội dung model.
Render text model bằng React text nodes, recipe/source từ snapshot server; UI tiếng Việt, bước nấu responsive và keyboard/focus.
Kiểm tra Playwright API mock cho lifecycle/race/retry/security/expiry, client/build/scanner và Docker/browser flow thật với provider được chọn.

## Mục tiêu

Người dùng đi từ công thức sang chat và hướng dẫn nấu ngay trên web.

## Thực hiện

- [x] Thêm lối vào trợ lý từ recipe detail, tạo/khôi phục phiên bằng client dùng chung.
- [x] Hiển thị chat, công thức đang chọn, bước hiện tại/tổng bước và các nút điều khiển.
- [x] Có loading, lỗi, retry, phiên hết hạn và trạng thái trợ lý chưa được cấu hình.
- [x] Khi đổi recipe/phiên hoặc rời màn hình, hủy/bỏ qua response cũ.
- [x] Khôi phục phiên khi reload; chỉ giữ định danh cần thiết ở client, không giữ API key.
- [x] Giữ tiếng Việt, responsive, keyboard/focus và cách hiển thị nguồn/gợi ý rõ ràng.

## Kiểm thử

- [x] Playwright với API mô phỏng: tạo phiên, chat, chuyển bước, reload, hết hạn và lỗi provider.
- [x] Kiểm tra đổi phiên khi đang chờ trả lời, double click/gửi trùng và response sai thứ tự.
- [x] Nội dung model được hiển thị an toàn; script/HTML hoặc link nguy hiểm không thực thi.
- [x] Desktop/mobile viewport dùng được, không overflow; thao tác bàn phím và focus đúng.
- [x] Chạy Docker/backend/API LLM thật: ảnh → xác nhận → recipe → chat → các bước → kết thúc.
- [ ] Chạy lại toàn bộ hồi quy upload/Top-3/search/detail trên source mới; đã lược bỏ theo yêu cầu người dùng.
- [x] Build, shared client và scanner static frontend qua.

## Điều kiện hoàn thành

- [x] Luồng web hoàn chỉnh qua cả test lỗi có kiểm soát và API thật.
- [ ] PR/CI tích hợp; sẵn sàng cho [Phase 12](phase-12-mobile.md).

## Kết quả kiểm tra


2026-11-22 (+07): candidate local `phase10-local/cooklens-<service>:2.0.0-rc.17` đang chạy bằng project Compose `cooklens` với volume hiện có.
Frontend mới; backend/AI giữ nguyên nội dung candidate Phase 10 trước đó, model/key chỉ cấu hình riêng ở backend.

- Build TypeScript/Vite và build Docker/Nginx qua; stack healthy.
- 24 case trợ lý desktop/mobile: 20 qua lần đầu; 4 case retry/recipe entry được sửa và chạy lại qua.
  Lỗi thực tế đã sửa: refresh sau mất response không được làm ẩn nút retry và khóa vĩnh viễn draft; chặn mutation mới trong khi operation cũ chưa được xác nhận.
  Fixture search bổ sung metadata bắt buộc; giữ validation production nghiêm ngặt.
- Hai browser flow thật desktop/mobile qua, mỗi flow gọi LLM một câu: ảnh → xác nhận → recipe → tạo phiên → bắt đầu → chat → bước tiếp → reload → kết thúc.
  Không mock CV/retrieval/provider trong flow này; đã kiểm tra focus, hội thoại/state sau reload và không overflow.
- Shared client 14/14 và static asset/notices/metadata scanner qua; không thêm dependency hoặc contract mới.
- Theo yêu cầu bỏ check không cần thiết, không chạy lại bộ backend/deploy, toàn bộ hồi quy ảnh/công thức hoặc evaluation LLM 50 câu đã có kết quả trước đó.
  Không tự nhận các check chưa chạy lại là pass mới.
- Screenshot local nằm trong `backend/target/phase11-browser/`, không đưa transcript/ảnh/browser trace vào docs hoặc Git.

Quality review Phase 10 vẫn pending, không có đánh giá human được tự điền.
Không tự commit/push hoặc publish image; checklist PR/CI vẫn mở theo [workflow](../WORKFLOW.md#4-git-và-quyền-thực-hiện).
