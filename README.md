# CookLens

Nhận diện món Việt từ ảnh, xác nhận món, tra cứu công thức có nguồn và hỏi đáp trong phiên nấu.
Hiện hỗ trợ 30 món, 33 công thức; web responsive và Expo Go dùng chung API.

## Chạy nhanh

Cần Docker với Compose ≥2.24.4, chạy Linux containers.
MVP `2.0.0` dùng Linux amd64/CPU; xem [kết quả và giới hạn nghiệm thu](docs/acceptance.md).

Từ thư mục gốc dự án:

```sh
docker compose up
```

Mở **http://localhost:8080/**. Lần đầu Docker tải image; model và dữ liệu đã nằm
trong image, không cần cài Python, Java hoặc Node. Chạy nền bằng `docker compose up -d`.
Xem [triển khai](docs/deployment.md) để theo dõi, dừng hoặc nâng phiên bản.
Để hỏi đáp, sao chép `.env.example` thành `.env` và điền Google AI Studio key vào `LLM_API_KEY`.
Mặc định dùng Gemini 3.1 Flash-Lite; ảnh, công thức và điều khiển bước vẫn chạy khi thiếu key hoặc provider lỗi.

## Tài liệu

| Nội dung | Tài liệu |
| --- | --- |
| Mục lục | [docs/README.md](docs/README.md) |
| Quy ước làm việc | [Workflow](docs/WORKFLOW.md) |
| Phạm vi và giới hạn | [Sản phẩm](docs/product.md) |
| Service, dữ liệu và API | [Kiến trúc](docs/architecture.md) |
| Build từ source | [Phát triển](docs/development.md) |
| Kiểm thử và số đo | [Kiểm thử](docs/testing.md) · [Nghiệm thu](docs/acceptance.md) |
| Công việc tiếp theo | [Kế hoạch MVP](docs/plan/mvp.md) |

CV Top-3 baseline đạt 96,08% trên 5.004 ảnh test; số đo của bộ phát hành ghi trong `candidate.json` và `verification.json` đi cùng gói.
Model hỗ trợ danh mục 30 món; người dùng luôn xác nhận món trước khi tra công thức.

MVP phát hành theo yêu cầu người dùng với các mục còn mở: Android thật, đủ 50 câu LLM trên cùng candidate và human quality review.
Gemini có thể bị rate limit/timeout; trợ lý không tự điều khiển bước hoặc bảo đảm an toàn dị ứng.
Thiết kế và phạm vi ở [kế hoạch trợ lý](docs/plan/assistant.md).
