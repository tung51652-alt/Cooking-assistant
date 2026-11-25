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
