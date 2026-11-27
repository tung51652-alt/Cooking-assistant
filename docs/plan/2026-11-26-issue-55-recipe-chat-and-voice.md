# Kế hoạch đưa công thức vào hội thoại và nhập giọng nói

[Issue #55](https://github.com/tung51652-alt/Cooking-assistant/issues/55) · Người nhận `tung51652-alt`

Sau khi gửi ảnh và xác nhận món, người dùng vào thẳng hội thoại CookLens để xem công thức, hỏi cách làm hoặc bắt đầu nấu.
Bản HTML duyệt trên máy local là mẫu giao diện cho web desktop, web mobile và app Expo.

## Phạm vi và thứ tự triển khai

1. Hoàn thành luồng ảnh đến hội thoại trên web và Expo với API nhận diện, công thức và phiên trợ lý hiện có.
   Kiểm tra điều hướng, nhập bằng bàn phím và điều khiển bước nấu trước khi gắn mic.
2. Trước khi thử nhận giọng nói, chốt bộ câu tiếng Việt, cấu hình máy và ngưỡng đạt cho chất lượng nhận chữ, thời gian phản hồi và tài nguyên.
   Dùng kết quả và các định dạng ghi thực tế để quyết định model, cách đóng gói và giới hạn request.
3. Chốt contract API chuyển giọng nói thành chữ trước khi sửa gateway và tích hợp mic vào hai client.
   Nghiệm thu luồng đầy đủ sau khi đạt các kiểm tra của từng phần.

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

## Thử nghiệm nhận giọng nói tiếng Việt

- [ ] Thử `whisper.cpp` với model đa ngôn ngữ, đặt ngôn ngữ tiếng Việt, trên cấu hình Linux amd64/CPU của CookLens.
  Đo thời gian từ khi dừng ghi đến khi nhận chữ, RAM, dung lượng image và tỷ lệ câu dùng được sau khi sửa nhỏ.
  Dùng câu ngắn có tên món, nguyên liệu và định lượng, với các giọng khác nhau và tiếng ồn bếp.
  Chọn model, giới hạn ghi âm và timeout dựa trên kết quả so với ngưỡng đã chốt. [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [ ] Ghi clip thật từ Chromium, Safari và Expo để kiểm tra định dạng thực tế trước khi chốt contract.
  Web dùng `getUserMedia` và `MediaRecorder`, kiểm tra định dạng trình duyệt hỗ trợ.
  Khi thử từ điện thoại, dùng URL HTTPS cho bản web.
  Expo dùng `expo-audio` để ghi vào cache và lấy quyền mic khi người dùng bấm nút. [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) · [Quyền mic trên web](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) · [Expo Audio SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/)
- [ ] Khi kết quả thử đạt ngưỡng, ghim phiên bản runtime và model, kèm nguồn và giấy phép.
  Phương án đề xuất là chạy nhận giọng nói ở dịch vụ nội bộ trong Compose hiện có, sau gateway Java.
  Dùng chung một API chuyển giọng nói thành chữ cho web và Expo để hai bản dùng cùng model và cùng cách báo lỗi. [Giao diện máy chủ whisper.cpp](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/server/README.md)

### Ngưỡng thử ban đầu

Thử model đa ngôn ngữ `base-q5_1` với 2 luồng CPU.
Bộ thử kỹ thuật gồm năm câu tổng hợp có tên món và định lượng, một clip im lặng và một clip quá thời lượng.
Ngưỡng thử kỹ thuật là nhận đủ từ khóa trong ít nhất bốn câu, thời gian xử lý tối đa 8 giây mỗi clip ngắn và RAM đỉnh dưới 768 MiB.
Ghi riêng chất lượng trên giọng nói thật với các thiết bị đã dùng.

## Tích hợp mic vào hội thoại

- [x] Chốt contract cho endpoint multipart `POST /api/assistant/transcriptions`, gồm định dạng đầu vào, giới hạn, response và mã lỗi theo envelope hiện tại.
  Cấu hình giới hạn request riêng ở gateway và Nginx vì các route trợ lý JSON hiện chỉ nhận 8 KiB.
  Kiểm tra media, giới hạn dung lượng và thời lượng, chuyển về âm thanh mono 16 kHz cho model, giới hạn xử lý đồng thời và dọn tệp tạm sau xử lý.
  Cập nhật DTO, controller và annotation OpenAPI trong cùng thay đổi.
  Sinh lại khai báo API bằng [script hiện có](../../deploy/scripts/generate_frontend_contract.sh) khi stack kiểm thử chạy và đồng bộ [client dùng chung](../../packages/cooklens-api/index.ts).
- [x] Bấm mic để nghe.
  Khi bấm dừng, hiển thị trạng thái chuyển thành chữ rồi chèn kết quả vào bản nháp để người dùng sửa và tự bấm **Gửi**.
  Giữ chữ đang gõ nếu người dùng hủy, từ chối quyền hoặc nhận giọng nói lỗi.
  Dừng mic và hủy hoặc bỏ qua phản hồi khi đổi phiên, rời màn hình hoặc đưa app xuống nền.
  Giữ nhập bằng bàn phím và các nút bước nấu khả dụng khi nhận giọng nói gặp lỗi.

## Nghiệm thu

- [ ] Trên web desktop và web mobile, thử Bún đậu mắm tôm có một công thức, Phở có nhiều công thức, tìm rỗng, lỗi tra cứu, mở rồi đóng chi tiết, đổi công thức, tải lại để khôi phục phiên và khung nhập khi bàn phím mở.
- [ ] Trên Expo Android và iOS, thử chọn ảnh, chuyển sang hội thoại, mở bảng công thức, nút Back, chuyển bước nấu, đóng mở lại app và kết thúc phiên.
  Ghi riêng kết quả máy ảo và thiết bị thật đã dùng.
- [ ] Dùng mic thật trên trình duyệt desktop và điện thoại, cùng Android và iOS trong app Expo.
  Kiểm tra lời nói tiếng Việt, từ chối quyền, dừng, hủy, clip rỗng, mất kết nối và bản nháp có thể sửa trước khi gửi.
- [x] Chạy hồi quy backend, client dùng chung, Playwright và Expo theo [hướng dẫn kiểm thử](../testing.md).
  Xác nhận chữ từ mic đi qua luồng gửi câu hỏi hiện tại, lỗi nhận giọng nói hiển thị cạnh ô nhập và người dùng vẫn tra công thức hoặc điều khiển bước nấu được.

## Trạng thái bàn giao

Bản duyệt local ban đầu dùng bộ công thức `cooklens-recipes-v2`.
Nhánh `feature/issue-55-recipe-chat-voice` đã cập nhật các thay đổi dành cho bộ công thức `cooklens-recipes-v3` và giao diện Android từ `develop`.

- Playwright qua 76 ca desktop và web mobile.
  Docker qua 8 ca dùng API thật, gồm hỏi đáp với Gemini, tải lại hội thoại, điều khiển bước và kết thúc phiên.
  Bỏ qua 4 ca ảnh ngoài danh mục hoặc nhiều món vì thiếu ảnh kiểm thử.
- Backend qua 86 ca, thư viện API qua 18 ca, Expo qua 27 ca và đóng gói JavaScript thành công cho Android và iOS.
  Đã kiểm tra khai báo quyền mic của hai nền tảng.
- Chromium ghi mẫu giọng tiếng Việt qua MediaRecorder ở hai kích thước màn hình.
  Dịch vụ trả chữ vào bản nháp đã có sẵn và chỉ gửi câu hỏi khi người dùng bấm Gửi.
  API cũng đã từ chối clip rỗng, tệp sai định dạng và clip quá thời lượng.
- Model `base-q5_1` chưa đạt mức nhận đủ từ khóa ở 4/5 câu tiếng Việt.
  Một mẫu WAV 4 giây trả chữ trong 3,98 giây, còn một lượt thử mẫu 7 giây chạm timeout.
  Profile `voice` vẫn dùng để thử nghiệm.
  Cần kiểm tra thêm tên món, định lượng và quyền mic trên Safari và thiết bị Android, iOS thật.
- Bản đang mở để duyệt dùng image Whisper đã build trước đó.
  Build mới từ Dockerfile còn chờ tải gói hệ thống.
