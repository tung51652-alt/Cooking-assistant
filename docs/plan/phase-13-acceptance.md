# Phase 13 — Nghiệm thu toàn bộ MVP

Trạng thái: chưa bắt đầu.
Phụ thuộc [Phase 12](phase-12-mobile.md).

## Mục tiêu

Kiểm chứng cùng một bộ phiên bản có cả trợ lý, sẵn sàng đưa lên release chính thức.

## Thực hiện

- [ ] Tạo version ứng viên mới và build image từ source đã tích hợp; không ghi đè tag cũ.
- [ ] Cập nhật Compose, metadata và cấu hình LLM/SQLite; giữ một project và lệnh `docker compose up`.
- [ ] SQLite ghi được trên volume với backend non-root/read-only; chỉ backend cần đường ra LLM.
- [ ] Cấu hình key riêng ở runtime, không đưa vào build args/layers hoặc gói phân phối.
- [ ] Bổ sung gate trợ lý vào CI; push ứng viên sau kiểm tra nội bộ đạt, chuẩn bị gói cho runner sạch và chỉ công bố prerelease sau khi pull/kiểm thử gói thành công.
- [ ] Cập nhật hướng dẫn khởi động, cấu hình provider, dữ liệu phiên, backup và rollback.

## Kiểm thử

- [ ] Chạy toàn bộ unit/contract, backend, web và Expo checks của source cuối.
- [ ] Pull ẩn danh image ứng viên trên môi trường sạch, không source/model/cache từ máy dev.
- [ ] Chạy đúng Compose trong gói mới bằng `docker compose up`, kiểm tra readiness và fresh seed.
- [ ] Chạy toàn luồng web/thiết bị thật: ảnh → recipe → hội thoại nhiều lượt → các bước → khôi phục phiên.
- [ ] Hồi quy CV Top-3 ≥95% trên split cố định; retrieval ≥150 query/30 món, Hit@1 ≥0,90, Hit@3 ≥0,95, không lẫn món; ghi bộ model/corpus thực tế.
- [ ] Đo lại ≥100 mẫu warm/API cũ: P95 vision ≤10 s, search ≤3 s; ghi CPU/RAM và cấu hình máy.
- [ ] Chạy bộ tình huống trợ lý đã chốt; ghi số ca đạt/lỗi, provider/model, latency và usage nếu có.
- [ ] Ngắt LLM/Internet: nhận diện/recipe/điều khiển bước còn dùng được; chat báo lỗi rõ.
- [ ] Kiểm tra restart/recreate giữ SQLite và index, seed lỗi, dependency recovery, backup và restore.
- [ ] Thử rollback đúng bộ image/index/schema; không hạ schema SQLite không tương thích một cách âm thầm.
- [ ] Rà secrets, log, notices, file thừa và hướng dẫn; không thêm thư mục evidence vào repository.

## Điều kiện hoàn thành

- [ ] Các gate đạt trên đúng ứng viên mới; không dùng kết quả `2.0.0-rc.2` để chứng minh trợ lý đã đạt.
- [ ] Số đo và giới hạn cập nhật ngắn trong [acceptance.md](../acceptance.md); lỗi chặn release đã xử lý.
- [ ] PR/CI được review và tích hợp; đủ điều kiện cho [Phase 14](phase-14-release.md).
- [ ] Không yêu cầu thử nấu hoặc cả ba provider cùng chạy thật để đóng phase.

## Kết quả kiểm tra
