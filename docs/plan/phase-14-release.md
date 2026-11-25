# Phase 14 — Phát hành và bàn giao

Trạng thái: công cụ phát hành đã triển khai và kiểm tra local; chưa đủ điều kiện công bố.
Phụ thuộc [Phase 13](phase-13-acceptance.md) đã đạt đầy đủ.

## Cách thực hiện đợt này

Quyết định mới ngày 25/11/2026: người dùng yêu cầu "release luôn", sau đó kiểm thử như người dùng và tạo GitHub issues.
Cho phép phát hành MVP kèm giới hạn đã biết trước nghiệm thu thủ công đầy đủ; các mục hoãn được ghi trong `deploy/artifacts/mvp-release-policy.json`.
Không đánh dấu các mục này đạt hoặc thay kết quả thật; kiểm chứng tự động, source, digest và anonymous pull vẫn bắt buộc.

1. Đối chiếu source, PR và kết quả từng phase; giữ các gate chưa có kết quả ở trạng thái mở.
2. Bổ sung promote cùng digest, gói final và workflow chỉ nhận ứng viên đã nghiệm thu trên đúng source `main`.
3. Kiểm thử các trường hợp thiếu gate, sai source, tag tồn tại và bundle sai; chạy hồi quy tự động hiện có.
4. Chạy candidate mới, đánh giá LLM thật và Android khi có key/thiết bị; chỉ công bố sau khi toàn bộ gate đạt.

Nhà cung cấp hiện tại do người dùng xác nhận: Gemini / Google AI Studio.
Đã bổ sung endpoint tương thích OpenAI của Google, policy usage/chi phí cho Gemini 3.1 Flash-Lite và cấu hình mặc định đồng bộ.
Evaluator hỗ trợ khoảng nghỉ giữa request để phù hợp quota; giữ nguyên latency HTTP, không retry hoặc ghép run.
Preview local dùng một project `cooklens` và image đã build; cấu hình override nằm trong `.env` bị Git ignore.
Khi chuyển khỏi project kiểm tra, dừng backend và giữ nguyên SQLite/ledger bằng bản sao volume; giữ volume cũ để rollback.

## Mục tiêu

Phát hành MVP `v2.0.0` có trợ lý; người nhận cấu hình key và chạy được bằng Docker Compose.

## Thực hiện

- [ ] Chuẩn bị PR release từ `develop` sang `main` theo phiên bản đã nghiệm thu.
- [x] Bổ sung workflow phát hành chính thức, tách khỏi luồng build ứng viên `v2.0.0-rc.N`.
- [ ] Promote đúng image ứng viên đã đạt sang `2.0.0`, không rebuild hoặc ghi đè tag đã công bố.
- [ ] Đồng bộ tag image, Compose, version ứng dụng, notes và tài liệu; giữ version dữ liệu/model riêng.
- [ ] Đóng gói `compose.yaml`, ví dụ cấu hình không có key, notices, hướng dẫn và bản tóm tắt kết quả.
- [ ] Giữ ứng viên/image cũ và backup dữ liệu cần thiết để rollback.

## Kiểm thử trước công bố

- [ ] Xác nhận source release, image được promote và bộ đã nghiệm thu tương ứng nhau.
- [x] Kiểm thử tự động từ chối thiếu gate, sai source/version/digest, tag tồn tại và bundle không phù hợp.
- [ ] Pull ẩn danh bộ final từ máy sạch; giải nén gói ngoài source và chạy `docker compose up`.
- [ ] Cấu hình key của provider đã chọn; thử ảnh → recipe → chat → bước nấu và restart giữ phiên.
- [ ] Thử không có key: phần ảnh/công thức vẫn chạy, trợ lý thông báo chưa sẵn sàng.
- [ ] Xác nhận rollback/restore bằng hướng dẫn bàn giao; kiểm tra gói không có secrets, dữ liệu phiên hoặc build output.
- [ ] Kiểm tra link tải, tag và nội dung tài liệu nhất quán; chỉ ghi số đo thực tế.

## Điều kiện hoàn thành

- [ ] PR release được review/merge theo phạm vi người dùng giao và CI bắt buộc qua.
- [ ] Công bố GitHub release `v2.0.0` cùng gói chạy và image public đã kiểm chứng.
- [ ] Người nhận có thể làm theo README để chạy web/Expo trong phạm vi đã nghiệm thu.
- [ ] [acceptance.md](../acceptance.md) và kế hoạch cập nhật trạng thái phát hành thực tế.

## Thông tin bàn giao

Link release:

Phiên bản image và phạm vi nền tảng:

## Kết quả kiểm tra

25/11/2026: đã thêm `final_release.py` và workflow **Promote accepted MVP release**.
Đầu vào phải là artifact của run publish prerelease thành công trên cùng commit `main`; luồng kiểm tra gói công khai, giữ manifest digest và chạy smoke final trước khi công bố.
Chi tiết vận hành ở [deployment.md](../deployment.md#phát-hành-chính-thức).
Hồi quy local đạt 76 backend, 65 deploy, 7 data, 14 shared client, 44 Playwright mô phỏng API và 22 Expo tests.
Web build, mobile TypeScript/export Android+iOS, Compose config, actionlint và scanner đạt; số liệu tập trung ở [acceptance.md](../acceptance.md#rà-soát-chuẩn-bị-release--25112026).
Smoke Compose local 100 mẫu/API có contract check đạt, gồm mất key/offline, giữ phiên qua restart/recreate, backup/restore và dependency recovery.
Backend/frontend build mới, AI dùng lại image cũ; chưa tính là pull/kiểm thử bộ final.
Preview đã chuyển về một project `cooklens`, `.env` chọn image local để `docker compose up` chạy source mới tại cổng 8080.
SQLite/ledger được sao chép và kiểm tra toàn vẹn, giữ volume cũ làm backup.
Web thật desktop/mobile qua hai lượt chat, điều khiển bước, reload và kết thúc trên prompt cuối.
Gemini vẫn chưa đạt bộ nghiệm thu 50 câu trên source cuối: các lần đo gặp 429/503/timeout; không ghép run hoặc dùng 5 ca screen sau sửa prompt để đóng gate.

Rà soát GitHub: Phase 8–11 đã tích hợp vào `develop`; PR [#23](https://github.com/tung51652-alt/Cooking-assistant/pull/23) chứa Expo/gate Phase 12–13 còn mở, CI đã qua.
CI xanh của PR chưa bao gồm chạy candidate tag, LLM thật hoặc Android thật.
Chưa công bố `v2.0.0`, chưa đổi tag mặc định Compose và chưa đánh dấu Phase 13 đạt.
