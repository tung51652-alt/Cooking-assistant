# Kế hoạch đưa công thức vào hội thoại

[Issue #55](https://github.com/tung51652-alt/Cooking-assistant/issues/55) · Người nhận `tung51652-alt`

Sau khi gửi ảnh và xác nhận món, người dùng vào thẳng hội thoại CookLens để xem công thức, hỏi cách làm hoặc bắt đầu nấu.
Bản HTML duyệt trên máy local là mẫu giao diện cho web desktop, web mobile và app Expo.

## Phạm vi và thứ tự triển khai

1. Tích hợp luồng từ ảnh đến hội thoại trên web và Expo với API nhận diện, công thức và phiên trợ lý hiện có.
2. Kiểm tra điều hướng, nhập câu hỏi bằng bàn phím, khôi phục phiên và điều khiển bước nấu.

## Luồng hội thoại và công thức

- [x] Khi xác nhận món, mở hội thoại với ảnh vừa gửi và tên món.
  Gọi `searchRecipes` theo món đã xác nhận và hiển thị một thẻ cho mỗi kết quả, kèm tên, nguồn và nút **Xem công thức**.
  Hiển thị trạng thái đang tải, kết quả rỗng và nút thử lại hoặc đổi món ngay trong hội thoại.
- [x] Tích hợp màn hình vào [điều hướng web](../../frontend/src/App.tsx) và [điều hướng Expo](../../mobile/App.tsx).
  Dùng tông kem và cam đất của mẫu.
  Web desktop có khu thông tin món bên cạnh, còn màn hình hẹp và Expo dùng một cột với thanh nhập sát đáy.
- [x] Mở thẻ bằng `getRecipeDocument` để hiện nguyên liệu, các bước và nguồn.
  Trên mobile, trình bày chi tiết trong bảng trượt.
  Sau khi đóng, trả người dùng về vị trí vừa đọc và giữ bản nháp câu hỏi.
  Đưa ưu tiên nguyên liệu hoặc cách nấu hiện có vào thao tác tìm lại trong hội thoại.
- [x] Nếu chỉ có một công thức, chọn sẵn công thức đó làm ngữ cảnh.
  Nếu có nhiều, cho người dùng chọn công thức muốn hỏi và hiển thị tên công thức đang dùng.
  Mở phiên trợ lý khi người dùng hỏi hoặc bắt đầu nấu, dựa trên `recipe_id` và `corpus_version` từ chi tiết công thức.
- [x] Tái sử dụng [phiên trợ lý web](../../frontend/src/features/AssistantPage.tsx), [bộ điều khiển phiên Expo](../../mobile/src/assistant/session-controller.ts) và [contract phiên](../contracts/mvp-v1.md).
  Khi đổi công thức, dùng phiên tương ứng với đúng công thức và phiên bản, hoặc tạo phiên mới.
  Khi mở để nấu lại sau khi đã kết thúc, tạo phiên mới.
  Giữ cách khôi phục phiên, các nút bước nấu và quy tắc gửi lại theo `operation_id`.
  Hủy hoặc bỏ qua phản hồi cũ khi đổi ảnh, món hoặc công thức.
  Ảnh xem trước dùng state của luồng hiện tại.
  Khi mở lại app, khôi phục phiên từ bản lưu công thức phía máy chủ.

## Nghiệm thu

- Dùng một màn hình Trợ lý cho luồng xác nhận món từ ảnh, chọn món trong danh mục và mở lại phiên đã lưu.
  Giữ đường dẫn trang danh mục và trang nhận diện cho liên kết cũ.
  Chỉ hiện Nhận diện khi người dùng đang đi qua bước xác nhận từ ảnh.
- Kiểm tra bấm lại Trợ lý, lọc kết quả, mở hoặc đóng chi tiết công thức và tiếp tục phiên.
  Khi lọc, giữ công thức đang dùng và câu hỏi đang gõ cho đến khi người dùng đổi công thức.

- [ ] Trên web desktop và web mobile, thử Bún đậu mắm tôm có một công thức, Phở có nhiều công thức, tìm rỗng, lỗi tra cứu, mở rồi đóng chi tiết, đổi công thức, tải lại để khôi phục phiên và khung nhập khi bàn phím mở.
- [ ] Trên Expo Android và iOS, thử chọn ảnh, chuyển sang hội thoại, mở bảng công thức, nút Back, chuyển bước nấu, đóng mở lại app và kết thúc phiên.
  Ghi riêng kết quả máy ảo và thiết bị thật đã dùng.
- [x] Chạy hồi quy backend, thư viện API dùng chung, Playwright và Expo theo [hướng dẫn kiểm thử](../testing.md).
  Xác nhận gửi câu hỏi bằng bàn phím và các nút điều khiển bước nấu hoạt động trong hội thoại.

## Trạng thái bàn giao

Bản triển khai dùng bộ công thức `cooklens-recipes-v3` và các cập nhật giao diện Android từ `develop`.

- Kiểm thử Docker bao gồm luồng ảnh đến hội thoại, hỏi đáp với Gemini, tải lại hội thoại, điều khiển bước và kết thúc phiên.
  Bốn ca ảnh ngoài danh mục hoặc nhiều món cần ảnh kiểm thử riêng.
- Expo đã được kiểm tra kiểu và đóng gói JavaScript cho Android và iOS.
