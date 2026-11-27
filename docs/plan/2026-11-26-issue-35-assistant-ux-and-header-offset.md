# Kế hoạch xử lý UX lỗi chat inline và offset header dính (#35)

Người nhận: `tung51652-alt`
Phạm vi issue: [#35](https://github.com/tung51652-alt/Cooking-assistant/issues/35) (`issue của antigravity`)
Nhánh dự kiến: `fix/issue-35-ui-ux` (từ `origin/develop`)

## 1. Phân loại các mục trong #35

Issue #35 gồm 3 mục; sau khi đối chiếu với `origin/develop` và các PR đang mở:
- **Bug #1 — Thông báo lỗi 503/chat bị khuất khỏi màn hình (`assistant.html`)**: **Triển khai trong lượt này**.
  Khi người dùng cuộn xuống cuối trang để gửi câu hỏi trong `.assistant-form`, thông báo lỗi hiện đang render ở đầu trang (`.assistant-page`, dòng 164 `AssistantPage.tsx`), nằm ngoài viewport trên mobile/màn hình nhỏ.
- **Bug #2 — Nút `"Nhắc lại"` không có phản hồi trực quan (`assistant.html`)**: **Không sửa trong nhánh này để tránh xung đột**.
  Mục này trùng với [#31](https://github.com/tung51652-alt/Cooking-assistant/issues/31) đang được `sida1420` xử lý tại [PR #40](https://github.com/tung51652-alt/Cooking-assistant/pull/40) (gỡ nút `"Nhắc lại"`).
- **Bug #3 — Phần đầu trang/ảnh xem trước bị thanh header dính che nhẹ (`recognition.html` và điều hướng chuyển trang)**: **Triển khai trong lượt này**.
  - Trong `frontend/src/App.tsx`, `useEffect` theo dõi `view` chỉ gọi `main.current?.focus()` mà không đặt `window.scrollTo(0, 0)`, khiến khi người dùng đang cuộn ở dưới (nhấn `"Nhận diện món"` ở `index.html`, hoặc `"Xem công thức"` / chuyển sang `recognition.html`), trang mới giữ vị trí cuộn cũ hoặc chỉ cuộn vừa chạm `main`.
  - Trong `frontend/src/styles.css`, `html { scroll-padding-top: 104px; }` phù hợp desktop (`.navbar` cao 80 px), nhưng trên mobile (`@media (max-width: 767px)`) `.navbar` cao tối thiểu `108 px` + padding `24 px` (~133 px), vượt quá `104 px` nên phần đầu nội dung bị `.header` che nhẹ khi focus/neo `#main`.

## 2. Thiết kế chi tiết

### 2.1. Hiển thị lỗi chat inline trên `AssistantPage.tsx` (Bug #1)

- Tách rõ nguồn lỗi trên `AssistantPage.tsx`:
  - Thêm state `errorTarget: 'session' | 'message' | null` (hoặc `inlineChatError = !!session && (errorTarget === 'message' || retry?.kind === 'message')`), reset về `null` khi bắt đầu `run()`.
  - Khi lỗi phát sinh từ lượt gửi câu hỏi (`operation?.kind === 'message'`) hoặc đang có `retry?.kind === 'message'`:
    - Render khối `<div className="error-message error-message-inline" role="alert">` **ngay bên trong `.assistant-conversation`**, phía trên `<form className="assistant-form">` (cùng pattern `chatFeedback` của Mobile `CookingSessionScreen.tsx`).
    - Giữ nguyên đầy đủ các nút khôi phục (`Cấu hình API Key LLM`, `Thử lại yêu cầu`, `Gửi lại câu hỏi`, `Kiểm tra phiên`, `Bỏ câu hỏi đang chờ`) và `role="alert"`.
  - Các lỗi cấp phiên (`load`, `create`, `act`, `refresh`) giữ hiển thị ở banner đầu trang như cũ.
  - Thêm style `.error-message-inline` trong `frontend/src/styles.css` (giảm `margin-top` phù hợp trong card hội thoại, bố cục gọn trên cả desktop và mobile).

### 2.2. Đặt lại vị trí cuộn và `scroll-padding-top` / `scroll-margin-top` cho sticky header (Bug #3)

- Trong `frontend/src/App.tsx`:
  - Khi chuyển `view` (`previousView.current !== view`), gọi `window.scrollTo({ top: 0, behavior: 'auto' })` và `main.current?.focus({ preventScroll: true })` để không làm trình duyệt nhảy cuộn lệch dưới sticky header.
- Trong `frontend/src/styles.css`:
  - Thêm `scroll-margin-top: 104px;` cho `main` (và các anchor chính) trên desktop.
  - Trong `@media (max-width: 767px)`, nâng `html { scroll-padding-top: 196px; }` và `main { scroll-margin-top: 196px; }` để tương ứng chiều cao thực tế của `.header` trên mobile (logo + `.nav-links` + nút `.llm-nav-btn`).

## 3. Kế hoạch triển khai & kiểm thử

- [x] Cập nhật `frontend/src/features/AssistantPage.tsx` để hiển thị lỗi lượt chat inline trong `.assistant-conversation` (ngay trên ô nhập/nút gửi).
- [x] Cập nhật `frontend/src/App.tsx` và `frontend/src/styles.css` cho `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })` + `preventScroll: true` và `scroll-padding-top` / `scroll-margin-top` (`104px` desktop, `196px` mobile).
- [x] Bổ sung Playwright test trong `frontend/tests/assistant.spec.ts` và `frontend/tests/flow.spec.ts`:
  - Khi ở cuối trang `assistant.html` và gửi câu hỏi nhận `503`, `role="alert"` nằm trong `.assistant-conversation` và hiển thị trong viewport (`toBeInViewport()`).
  - Khi cuộn xuống cuối `index.html` rồi chuyển sang `recognition.html`, `.recognition-photo` và `#recognition-title` hiển thị trọn vẹn dưới `.header` (`scrollY === 0`, `top >= headerBottom`) trên cả desktop và mobile.
- [x] Chạy `npm --prefix frontend run build`, Playwright `tests/flow.spec.ts` + `tests/assistant.spec.ts` (`54/54` pass), và `python3 deploy/scripts/check_public_metadata.py` (`PASS`).
- [ ] Commit, push nhánh `fix/issue-35-ui-ux` và mở PR vào `develop` sau khi người dùng review diff (ghi chú rõ phạm vi không chạm Bug #2 để tránh xung đột PR #40).
