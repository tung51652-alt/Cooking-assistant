# Lộ trình hoàn thiện và release MVP

Phạm vi đích: ảnh → Top-3 → xác nhận món → công thức → trò chuyện/hướng dẫn nấu.
Phần ảnh/công thức đã có số đo; source có API phiên/bước nấu kiểm chứng local, chat/provider/giao diện chưa triển khai.
Nối tiếp các phase trước, Phase 8–14 dưới đây là kế hoạch còn lại, chưa được đánh dấu hoàn thành.

## Thứ tự thực hiện

| Phase | Kế hoạch | Kết quả cần có |
| --- | --- | --- |
| 8 | [Nền tảng và contract](phase-08-foundation.md) | Docker chạy thật, contract/giới hạn/provider đầu tiên đã chốt |
| 9 | [Phiên và bước nấu](phase-09-sessions.md) | State đúng, SQLite lưu bền vững, API/actions có test |
| 10 | [Kết nối LLM](phase-10-llm.md) | Hỏi đáp theo recipe với một API thật, có giới hạn và xử lý lỗi |
| 11 | [Giao diện web](phase-11-web.md) | Chat và điều khiển bước hoàn chỉnh trên web |
| 12 | [Expo Go](phase-12-mobile.md) | Luồng native đạt trên nền tảng/thiết bị bàn giao đã chốt |
| 13 | [Nghiệm thu MVP](phase-13-acceptance.md) | Ứng viên mới có trợ lý đạt hồi quy, runtime và kiểm tra API thật |
| 14 | [Release và bàn giao](phase-14-release.md) | Image/gói final và GitHub release `v2.0.0` dùng được |

## Quy tắc chung

- Mỗi phase có checklist thực hiện, kiểm thử, điều kiện hoàn thành và chỗ ghi kết quả.
- Chỉ đánh dấu hoàn thành sau khi có kết quả thực tế; phần chưa quyết định để trống.
- Ghi PR/CI, lệnh kiểm tra và số ca đạt/lỗi ngắn trong file phase; số đo sản phẩm tập trung ở [acceptance.md](../acceptance.md), không thêm thư mục evidence.
- PR được review/tích hợp và các phụ thuộc đạt trước khi chuyển sang phase kế tiếp.
- Giữ một project `cooklens`, một Compose; khởi động bằng `docker compose up`.
- Một provider Gemini/OpenAI/Anthropic là đủ cho MVP; key chỉ ở backend.
- LLM cần Internet/key; lỗi chat không chặn ảnh/công thức hoặc điều khiển bước.
- Thử nấu, voice, web search, thay nguyên liệu phức tạp và APK/store release không là gate đợt này.
- Bộ `2.0.0-rc.2` chưa có trợ lý; phải build/nghiệm thu ứng viên mới trước promote final.

Phạm vi ở [product.md](../product.md), thiết kế trợ lý ở [assistant.md](assistant.md).
