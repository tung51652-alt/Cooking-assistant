# Changelog

Tài liệu này lưu những thay đổi đã hoàn thành theo ngày của CookLens.
Nó phản ánh kết quả đang có trong repository, không thay thế issue, pull request hoặc kế hoạch tương lai.

## Quy ước cập nhật

- Thêm một mục theo ngày `YYYY-MM-DD` khi công việc đã hoàn thành và được kiểm tra ở mức phù hợp.
- Dùng một hoặc nhiều nhóm: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.
- Viết kết quả hiện tại, ngắn gọn; kèm link issue/PR/commit nếu có.
- Không ghi secret, dữ liệu người dùng, đường dẫn local, hoặc nội dung chỉ là kế hoạch.
- Cập nhật trong cùng pull request với thay đổi có ảnh hưởng đến sản phẩm, kiến trúc, dữ liệu hoặc vận hành.

## [Unreleased]

### Added

- Sau khi xác nhận món từ ảnh hoặc danh mục, mở hội thoại CookLens để xem công thức, hỏi cách làm hoặc bắt đầu nấu trên web và Expo.
  Phiên nấu đã lưu mở lại trong cùng giao diện. [#55](https://github.com/tung51652-alt/Cooking-assistant/issues/55)
- Chọn món trực tiếp từ danh mục 30 món mà không cần ảnh. [#48](https://github.com/tung51652-alt/Cooking-assistant/issues/48)
- Người dùng web có thể nhập API key LLM riêng trong Cài đặt trợ lý; key lưu trên trình duyệt và không tính vào ngân sách server. [#36](https://github.com/tung51652-alt/Cooking-assistant/issues/36)
- Corpus `cooklens-recipes-v3` với 90 công thức cho 30 món, chuẩn hóa định lượng và rà soát nguồn. [#32](https://github.com/tung51652-alt/Cooking-assistant/issues/32) [#60](https://github.com/tung51652-alt/Cooking-assistant/pull/60)

### Changed

- Ảnh mờ hoặc có điểm cao nhất dưới 65% không hiện gợi ý; người dùng đổi ảnh hoặc chọn món theo tên. [#37](https://github.com/tung51652-alt/Cooking-assistant/issues/37) [#49](https://github.com/tung51652-alt/Cooking-assistant/issues/49)
- Làm rõ cài đặt trợ lý, thông báo khi máy chủ chưa bật hỏi đáp và bỏ thuật ngữ kỹ thuật ở gợi ý món, ghi chú nguồn. [#47](https://github.com/tung51652-alt/Cooking-assistant/issues/47) [#51](https://github.com/tung51652-alt/Cooking-assistant/issues/51)
- Trang đầu Expo chỉ mời tiếp tục khi có phiên nấu đã lưu. [#50](https://github.com/tung51652-alt/Cooking-assistant/issues/50)
- Gộp tài liệu theo chủ đề, bỏ kế hoạch đã hoàn tất và thư mục ảnh kiểm chứng.

### Fixed

- Chấp nhận phản hồi Gemini hợp lệ khi chạm giới hạn token và thử lại một lần khi provider trả 502/503; web hiện lỗi ngay trong hội thoại kèm nút gửi lại. [#28](https://github.com/tung51652-alt/Cooking-assistant/issues/28) [#29](https://github.com/tung51652-alt/Cooking-assistant/issues/29) [#35](https://github.com/tung51652-alt/Cooking-assistant/issues/35)
- Cuộn về đầu khi mở chi tiết công thức, giữ món đã chọn qua reload và tránh header dính che nội dung. [#33](https://github.com/tung51652-alt/Cooking-assistant/issues/33) [#35](https://github.com/tung51652-alt/Cooking-assistant/issues/35)
- Sửa lỗi ảnh mờ, nút đổi ảnh bị khuất, focus bàn phím thoát khỏi hộp cấu hình và tìm "pho" không ra Phở. [#45](https://github.com/tung51652-alt/Cooking-assistant/issues/45) [#46](https://github.com/tung51652-alt/Cooking-assistant/issues/46) [#52](https://github.com/tung51652-alt/Cooking-assistant/issues/52)
- Mở kết quả nhận diện và danh sách công thức từ đầu trang; thêm nút tải lại khi hỏi đáp hết giờ trên Android. [#53](https://github.com/tung51652-alt/Cooking-assistant/issues/53) [#54](https://github.com/tung51652-alt/Cooking-assistant/issues/54)
- Khi mở lại trợ lý từ chi tiết công thức, tạo phiên nấu mới nếu phiên trước đã kết thúc. [#30](https://github.com/tung51652-alt/Cooking-assistant/issues/30)
- Rút gọn phần xem trước công thức theo ranh giới từ và thêm dấu chấm lửng. [#34](https://github.com/tung51652-alt/Cooking-assistant/issues/34)
- Hiển thị ghi công và giấy phép ở các công thức có nguồn là pull request GitHub trên web và Expo Go. [#38](https://github.com/tung51652-alt/Cooking-assistant/issues/38)

### Removed

- Bỏ nút nhắc lại bước nấu trên web và Expo Go. [#31](https://github.com/tung51652-alt/Cooking-assistant/issues/31)

## 2.0.0 — 2026-11-25

### Added

- Trợ lý nấu ăn trên web và Expo Go, phiên SQLite lưu bền vững, điều khiển bước và hỏi đáp theo recipe snapshot.
- Tích hợp Gemini qua API tương thích OpenAI, giới hạn token/chi phí, xử lý lỗi provider và giữ key ở backend.
- Pipeline promote image cùng digest, gói Compose độc lập, kiểm chứng pull ẩn danh và chính sách phát hành với giới hạn được người dùng chấp thuận.

### Changed

- Đồng bộ phiên bản ứng dụng và image `2.0.0`; giữ version model/corpus riêng.
- Làm rõ prompt về dữ liệu thiếu, dị ứng, tính tỉ lệ và giới hạn thao tác phiên.

### Known limitations

- Android thật, đủ 50 câu LLM trên cùng candidate và human quality review được hoãn theo yêu cầu release trước của người dùng.
- Gemini có thể trả rate limit, lỗi dịch vụ hoặc timeout; ảnh/công thức và các nút điều khiển vẫn dùng được.

## 2026-11-22

### Added

- Source backend có API phiên nấu lưu SQLite, snapshot recipe/version, điều khiển bước và chống request trùng/ghi đè state.
- Bổ sung contract/OpenAPI/type/client phiên dùng chung cho web và Expo; messages trả lỗi chưa cấu hình cho tới Phase 10.
- Thêm volume phiên và native library SQLite trong image backend; kiểm chứng Docker còn mở.
- Bổ sung kết quả nghiệm thu nhận diện, retrieval, latency và tài nguyên trong `docs/acceptance.md`.
- Bổ sung kế hoạch Phase 8–14 với checklist triển khai, kiểm thử và release MVP có trợ lý qua API LLM.
- Bổ sung workflow chung tại `docs/WORKFLOW.md` và cấu hình cổng/IP tùy chọn trong `.env.example`.

### Changed

- Tổ chức tài liệu theo chủ đề và tập trung kế hoạch trong `docs/plan/`.
- Chuẩn hóa một project `cooklens`, khởi động từ root bằng `docker compose up` với image có sẵn.
- Đặt Dockerfile tại từng thành phần và cấu hình Nginx trong `frontend/nginx/`.
- Đồng bộ script đóng gói, kiểm tra và CI với cấu trúc Compose/Dockerfile hiện tại.

### Removed

- Bỏ các Compose theo phase, overlay phát triển/LAN/debug và thư mục evidence trong docs.
- Bỏ bộ skill cục bộ trong `ai/.codex/skills` và `backend/.agent/skills`.

## 2026-09-23

### Added

- Bổ sung chuẩn kỹ thuật MVP cho contract CV–RAG, API, state persistence, observability và evaluation gates.
- Thêm bộ skill AI tại `ai/.codex` cho LangGraph, RAG, Hugging Face và dependency management.
- Thêm bộ skill/agent backend tại `backend/.agent`, được đổi tên từ `.claude`.

### Changed

- Chốt backend là Java 21 + Spring Boot 3.x + Maven + Spring Data JPA thay cho giả định FastAPI trước đó.
- Chuẩn hóa backend giao tiếp với các dịch vụ CV, RAG và LangGraph trong `ai/` qua HTTP client/API contract.
- Cập nhật cấu trúc backend đích: controller, service, client, DTO, domain, repository, config, exception và test Java.

## 2026-09-13

### Added

- Khởi tạo CookLens với định hướng Vision-RAG cho nhận diện món Việt và trợ lý nấu ăn có state.
- Tạo README theo dõi phase MVP, tiêu chí hoàn thành và stack đề xuất.
- Tạo tài liệu cho Computer Vision, Data/RAG, LangGraph và cấu trúc repository.
- Thiết lập skeleton theo sáu miền: `ai`, `data`, `backend`, `frontend`, `deploy`, `docs`.
