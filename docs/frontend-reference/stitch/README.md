# Nguồn giao diện chuẩn Phase 4

Ngày 2026-10-19 người dùng sửa đường dẫn thành /home/trantung/ict/stitch_giao_di_n_chatbot_m_th_c. Hai file code.html (28614 bytes) và screen.png (742908 bytes, 1600×2065) là snapshot byte-for-byte từ nguồn này. Không sửa HTML demo để giả thành app tích hợp. .gitattributes chỉ miễn trailing-whitespace cho riêng snapshot bất biến này; source triển khai không kế thừa ngoại lệ. Snapshot FrontEndCookLens cũ giữ nguyên cho lịch sử Phase 0, không dùng làm baseline hiện tại.

Nguồn chỉ có một trang home/chat. Các màn nhận diện, danh sách và chi tiết công thức trong app là phần mở rộng từ design tokens, không có ảnh nguồn tương ứng.

| Thành phần nguồn | Áp dụng trong app |
| --- | --- |
| Nền #FAF0E1, cam #C84B00, hover #A83D00 | Tokens chung, wordmark, nút chính và tab |
| Xanh #2B8A3E | Accent; nút camera dùng #287D39 để tăng tương phản chữ trắng |
| Card #FFFDF8, surface #FBF4EA, border #EADBC8 | Upload/preview, prediction và recipe cards |
| Text #2A241F, muted #6E6359 | Heading/body/metadata |
| Epilogue và Plus Jakarta Sans | Fontsource local, OFL notices trong image |
| Hai panel, card bo góc 24px, pills và footer kem | Upload desktop; xếp dọc khi mobile |
| Material Symbols/Google Fonts/Tailwind CDN | Phosphor và CSS/font local; không CDN runtime |
| Chatbot, trạng thái online, saved/account/notification/cook mode | Bỏ khỏi runtime; panel dưới thành hướng dẫn luồng hiện có |

Giữ thương hiệu CookLens và nhãn tiếng Việt. Navigation chỉ có các bước đã triển khai. Không copy JS demo/fake chat hoặc sinh dữ liệu minh họa vào app. Dùng icon cùng một family; không chỉnh SVG của nhà cung cấp.

Đối chiếu ở 1440×900 và 390×844:

- [Nguồn desktop](../../../frontend/docs/stitch-reference-desktop.png), [app desktop](../../../frontend/docs/upload-desktop.png).
- [Nguồn mobile](../../../frontend/docs/stitch-reference-mobile.png), [app mobile](../../../frontend/docs/upload-mobile.png).
- [Nhận diện thật](../../../frontend/docs/recognition-desktop.png), [công thức thật](../../../frontend/docs/recipe-desktop.png).

Ảnh tham chiếu chụp viewport-only từ HTML gốc có CDN; ảnh app full-page từ suite API thật. Cùng viewport không có nghĩa cùng chiều cao nội dung: app thay chức năng chatbot bằng hướng dẫn và phải hiển thị trạng thái luồng hiện tại. screen.png gốc có viewport/DPR không được xác nhận, vì vậy giữ nguyên để tham khảo thay vì coi đó là baseline cùng viewport.

Design read: DESIGN_VARIANCE=3, MOTION_INTENSITY=1, VISUAL_DENSITY=4; bảo toàn thiết kế và accessibility cho product UI. Không tuyên bố pixel-perfect. Snapshot chỉ là tài liệu, bị loại khỏi Docker context/runtime; license font/icon được giữ riêng trong frontend/public/notices.
