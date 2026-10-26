# Khung frontend người dùng cung cấp

> Nguồn lịch sử Phase 0. Người dùng đã sửa đường dẫn ở Phase 4; [Stitch là nguồn chuẩn hiện tại](stitch/README.md). Giữ snapshot và metadata cũ bất biến để audit, không dùng màu/font/bố cục nguồn này làm baseline mới.

Nguồn local lúc audit: `/home/trantung/ict/FrontEndCookLens`, ngày 2026-10-19. Người dùng yêu cầu tận dụng tối đa khung/style, chưa làm chatbot. Ba HTML ở đây là bản sao byte-for-byte để nhóm và CI xem được cùng nguồn mà không cần máy tác giả; kích thước/tên file lưu trong `manifest.json`.

Snapshot giữ CRLF của bản nguồn; `.gitattributes` chỉ áp dụng các file HTML này để checkout không đổi bytes và whitespace checker nhận CRLF hợp lệ. Các source triển khai mới tuân theo quy ước formatter của service, không kế thừa ngoại lệ snapshot.

Đây là reference thuộc tài liệu, chưa phải frontend được nối API hoặc thư mục public. Những link Chat/cooking và assets tương đối được giữ nguyên trong snapshot để ghi đúng bản nguồn; không copy nguyên các route/link đó vào bản phát hành. `.dockerignore` loại cả `docs/` khỏi build context runtime.

| File | Cấu trúc giữ để chuyển thành component Phase 4 |
| --- | --- |
| `index.html` | Navbar/brand CookLens; `upload-container`, `upload-box`, `preview-box`; file/camera input, chọn/xóa ảnh, nhận diện |
| `recognition.html` | `recognition-container`, `result-card`, `mainResult`, `confidence`, `topResults`, `confirmButton`; top chính và hai ứng viên thay thế |
| `recipe.html` | `recipe-info-grid`, `ingredients`, `recipeInfo`, `steps-card`, `recipeSteps`, footer; thêm recipe list và nguồn theo cùng ngôn ngữ UI |

Các trang nguồn khác: `chat.html` và `cooking.html` đã được nhận diện trong audit nhưng không cần nhập thêm bản sao cho milestone này. `FrontEndCookLens.iml` và `src/Main.java` là phần project IDE, không phải source frontend cần giữ.

## Tài nguyên đang thiếu

- `index.html` tham chiếu `css/style.css`, `css/upload.css`, `js/upload.js`.
- `recognition.html` tham chiếu `../css/style.css`, `../css/recognition.css`, `../js/recognition.js`.
- `recipe.html` tham chiếu `../css/style.css`, `../css/recipe.css`.
- Không tìm thấy các file trên dưới source root hoặc các thư mục `css/`, `js/` ở thư mục cha. Header/logo cũng đang có hai biến thể emoji khác nhau giữa trang home và trang con; Phase 4 cần thống nhất dựa trên bản thiết kế được review.

Người dùng đã xác nhận dựng frontend từ HTML đã gửi và cho phép bổ sung CSS/JS còn thiếu, tận dụng bố cục CookLens, chưa có chatbot. Đây là quyết định xử lý thiếu assets ở Phase 0; không còn chờ CSS gốc để bắt đầu khung UI. Khung độc lập đã được merge qua PR #7; bốn baseline được chọn nằm trong `frontend/docs/`. Phase 4 sau đó tích hợp UI với API thật. Web responsive chạy trên điện thoại; app Expo đang được review riêng ở PR #17, chưa merge và không build APK.

Do bản nguồn không có CSS/JS, không thể tuyên bố màu/font/spacing dựng mới giống CSS gốc chưa được cung cấp. Giữ cấu trúc/nội dung/tên lớp, bổ sung CSS nhẹ và chụp baseline mới ở 1440×900 và 390×844 để người dùng duyệt; nếu sau này có assets gốc, đối chiếu và cập nhật theo chúng. Snapshot HTML phía trên vẫn bất biến, không sửa để khớp bản triển khai mới.

Lộ trình UI đã chốt: chọn ảnh → nhận diện → chọn một trong Top-3 hoặc sửa từ danh mục → tự tìm recipe → list/detail. Không tự xác nhận Top-1. Bỏ Chat/Hỏi CookLens và cooking navigation chưa triển khai trong runtime. State ảnh chỉ ở RAM trình duyệt, không localStorage/base64 persistence; reload có thể bắt đầu lại, không tạo session backend ở bản này.

Kiểm tra metadata, không cần ML dependencies:

```bash
python3 deploy/scripts/verify_mvp_inputs.py
```

Không áp kiểm tra link runtime lên snapshot bất biến này như thể đây là sản phẩm chạy được; lỗi asset hiện có là finding được ghi lại để xử lý ở Phase 4.
