# Tài liệu CookLens

Mỗi chủ đề có một tài liệu chính. Đọc theo nhu cầu:

| Tài liệu | Nội dung |
| --- | --- |
| [WORKFLOW.md](WORKFLOW.md) | Quy ước làm việc, kiểm tra, tài liệu và Git |
| [product.md](product.md) | Chức năng, luồng sử dụng và giới hạn |
| [architecture.md](architecture.md) | Service, dữ liệu, model và ranh giới API |
| [development.md](development.md) | Môi trường, build và quy trình đóng góp |
| [deployment.md](deployment.md) | Chạy Docker, theo dõi, nâng cấp và rollback |
| [testing.md](testing.md) | Các lớp kiểm thử, lệnh chạy và tiêu chí đạt |
| [acceptance.md](acceptance.md) | Kết quả nghiệm thu, chỉ số và giới hạn đo |

Chỉ dùng thư mục cho tài liệu nhiều thành phần:

- [contracts/](contracts/mvp-v1.md): quy ước API và fixture dùng chung với test.
- [plan/](plan/README.md): lộ trình Phase 8–14 tới release, mỗi phase có checklist và kiểm thử.

Khi đổi chức năng, cập nhật tài liệu chủ đề tương ứng. Kế hoạch mô tả việc cần làm;
kết quả và chỉ số đã kiểm chứng ghi trực tiếp trong `acceptance.md`.
Không đưa dataset, trọng số, secret, log thô hoặc build output vào docs.
