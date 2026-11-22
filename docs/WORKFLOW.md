# Quy ước làm việc CookLens

Tổng hợp theo workflow người dùng cung cấp và các quyết định hiện hành của CookLens.
Ưu tiên yêu cầu mới nhất theo phạm vi công việc.

## 1. Lập kế hoạch trước khi sửa

- Công việc từ ba bước hoặc có quyết định kiến trúc cần plan/approach trước khi sửa code.
- Dùng Plan Mode khi môi trường hỗ trợ; kế hoạch dự án lưu trong [plan/](plan/README.md).
- Chỉ tạo spec riêng khi công việc cần và người dùng yêu cầu; không nhân bản cùng nội dung.
- Ghi rõ phạm vi, phụ thuộc, check khi làm và kiểm thử trước khi bắt đầu phase.

## 2. Làm đơn giản và sửa tận gốc

- Đọc luồng và các caller trước khi sửa; ưu tiên helper, thư viện chuẩn và pattern đã có.
- Chọn thay đổi nhỏ nhất giải quyết đầy đủ vấn đề; không thêm framework/service/dependency khi chưa cần.
- Lỗi chung sửa ở chỗ dùng chung, tránh vá riêng một caller rồi để lỗi ở caller khác.
- Khi được người dùng chỉnh, cập nhật quy ước/quyết định liên quan để không lặp lại sai sót.

## 3. Xác minh và kiểm thử

- Mặc định không tự chạy test hoặc khởi động app chỉ để verify.
- Khi chưa được giao kiểm thử, xác minh code bằng compile và đọc diff.
  Backend dùng `mvn -f backend/pom.xml compile`; sửa test source dùng `test-compile`.
- Khi người dùng yêu cầu test hoặc giao thực hiện phase có checklist kiểm thử đã chốt, thực hiện các check trong phạm vi đó; không coi thời gian chờ là sự đồng ý cho hành động khác.
- Chỉ báo đạt với kết quả thực tế; ghi rõ kiểm tra chưa chạy, lỗi, thiếu key/thiết bị hoặc Docker daemon chưa sẵn sàng.
- Kết quả phase ghi ngắn trong file phase; chỉ số sản phẩm tập trung ở [acceptance.md](acceptance.md).
  Không tạo thư mục evidence hoặc đưa raw log/dataset/build output vào docs.

## 4. Git và quyền thực hiện

- Có thể đọc, sửa file và thao tác local dễ hoàn tác trong phạm vi đã giao mà không hỏi lại từng bước.
- Không tự commit/push khi chưa có yêu cầu rõ ràng của người dùng; để người dùng review diff.
- Commit message luôn bằng tiếng Anh.
- Không tự rewrite lịch sử đã push, force-push, reset phá hủy hoặc dùng `--no-verify`.
  Những thao tác đó cần yêu cầu/chấp thuận rõ ràng; xóa file phải thuộc phạm vi đã được giao.
- Nếu được yêu cầu commit theo ngày cụ thể, chỉ đặt author date bằng `git commit --date`.
  Giữ committer date hiện tại; không tự amend/force-push commit đã công bố.

## 5. Contract, Swagger và code

- Với thay đổi API, thống nhất contract trước; cập nhật DTO/controller/springdoc annotation cùng thay đổi triển khai.
- OpenAPI sinh từ Java tại `/v3/api-docs`; không duy trì YAML schema thủ công song song.
- Swagger nội bộ ở `/swagger-ui/index.html`; đồng bộ type/client bằng script sinh contract hiện có.
- Giữ envelope, request ID và error contract trong [contracts/mvp-v1.md](contracts/mvp-v1.md).
- Luôn đọc cả bảng/danh sách cấu hình khi cập nhật; nguồn đầy đủ nằm ở schema hoặc `.env.example` tương ứng.

## 6. Cấu trúc và giới hạn CookLens

- Backend: Java 21, Spring Boot, Maven; package `com.cooklens` và các layer hiện có.
  Controller dùng DTO/validation, service điều phối, client gọi AI/API với timeout và lỗi rõ ràng.
- AI: `ai/cv` nhận diện; `ai/rag` xử lý corpus/embedding/retrieval.
  Dùng taxonomy/version chung, không suy nguyên liệu trực tiếp từ ảnh.
- Trợ lý mới thuộc [kế hoạch MVP](plan/mvp.md), chưa được xem là đã triển khai.
  Backend gọi một API Gemini/OpenAI/Anthropic; SQLite phiên theo plan, không tự thêm service chat/database riêng.
- Web và Expo dùng client/contract chung trong `packages/cooklens-api`.
- Ứng dụng có một project `cooklens`, một `compose.yaml` ở root và Dockerfile từng phần.
  Khởi động bằng `docker compose up` với image có sẵn; không tổ chức thêm môi trường dev/test cho người dùng.
- Giữ nguyên notices và provenance; không commit model/dataset lớn, secret hoặc dữ liệu phiên.
- Không log key, ảnh gốc hoặc nội dung hội thoại không cần thiết; key LLM chỉ ở backend.
- Không mở rộng thêm voice, web search, APK/store hoặc thử nấu ngoài phạm vi được giao.

## 7. Viết tài liệu và bàn giao

- Comment/docstring ngắn, thường 1–2 dòng, nêu hành vi hiện tại và lý do cần thiết.
  Không thuật lại lịch sử sửa hoặc phương án đã bỏ trong source/README.
- Markdown dùng semantic line breaks: mỗi câu nguồn bắt đầu ở một dòng mới.
  Câu tiếp trong bullet thụt lề theo item, không reflow tùy độ rộng cột.
- Mỗi chủ đề một file chính; folder chỉ dùng khi có nhiều thành phần như contract hoặc plan.
- Thông tin chưa chốt để trống; không ghi việc dự kiến thành kết quả đã xong.
- Trước bàn giao, đọc lại diff/comment/link và bỏ nội dung thừa.
  Báo rõ đã đổi gì, check nào đã chạy và điều gì còn thiếu.
- Chỉ sửa/thêm workflow CI theo yêu cầu đã giao; đổi tên/path/job phải cập nhật mọi tham chiếu liên quan.
