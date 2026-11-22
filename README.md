# CookLens

Nhận diện món Việt từ ảnh, xác nhận món và tra cứu công thức có nguồn.
Hiện hỗ trợ 30 món, 33 công thức; web responsive và Expo Go dùng chung API.

## Chạy nhanh

Cần Docker với Compose ≥2.24.4, chạy Linux containers.
Bộ ứng viên đã kiểm chứng trên Linux amd64/CPU: `2.0.0-rc.2`.

Từ thư mục gốc dự án:

```sh
docker compose up
```

Mở **http://localhost:8080/**. Lần đầu Docker tải image; model và dữ liệu đã nằm
trong image, không cần cài Python, Java hoặc Node. Chạy nền bằng `docker compose up -d`.
Xem [triển khai](docs/deployment.md) để theo dõi, dừng hoặc nâng phiên bản.

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

CV Top-3 đạt 96,08% trên 5.004 ảnh test. Bản chính thức `v2.0.0` chưa phát hành.
Model hỗ trợ danh mục 30 món; người dùng luôn xác nhận món trước khi tra công thức.

MVP được bổ sung [trợ lý trò chuyện/hướng dẫn nấu bằng API LLM](docs/plan/assistant.md);
phần này đang ở kế hoạch, chưa có trong image hiện tại.
