# Phase 2 — Corpus và retrieval

Phần dữ liệu đã đủ 30/30 món: 33 recipe gồm 21 bản Wikibooks có attribution và 12 bản AI biên soạn theo quyền chủ dự án cấp ngày 2026-10-19. Cổng `--require-full-coverage` được bật bắt buộc trong CI data. Corpus version mới `cooklens-recipes-v1` cần được service PR dựng lại vectors/index trước nghiệm thu runtime.

Xem [README corpus](../../data/recipes/README.md), [record biên soạn và quyền sử dụng](../../data/recipes/AUTHORSHIP.md), [manifest](../../data/recipes/manifest.json). Source của văn bản mới ghi rõ AI, không gán nhầm Wikibooks hoặc người nấu. Công thức chưa nấu kiểm chứng, tổng thời gian chưa đo để null; nem chua dùng biến thể rán từ nem thành phẩm có nguồn gốc rõ.

Validator dùng chung kiểm tra schema, taxonomy, số hữu hạn, steps, duplicate, Unicode, URL, source/license và nguồn AI. Giữ tests hồi quy hữu ích; loại file tải, script tạo tạm, logs, model/vectors build khỏi Git. Không ghi literal secret/hash/checksum/digest/định danh revision dạng hash vào nội dung public; kiểm tra toàn bộ file tracked và PR notes trước push.

PR dữ liệu là nền cho PR service; người dùng tự merge data trước service. Runtime/evaluation version mới và báo cáo đóng Phase 2 được cập nhật ở PR service. Nghiệm thu ẩm thực và review ngoài agent còn thuộc Phase 7; không nhận đã nấu kiểm chứng công thức AI.
