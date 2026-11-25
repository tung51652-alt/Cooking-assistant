# Review query và relevance Phase 2

Bộ cố định có 204 query: 150 query gốc (năm query cho mỗi món), thêm 36 query nguyên liệu/cách làm cho 12 món mới và 18 query phân biệt biến thể cho phở, bánh canh, bánh bột lọc. Không còn query của món thiếu được tính như thành công: toàn bộ 204 case đều có relevant IDs và được đánh giá như positive.

Ground truth được rà theo nội dung recipe trong một lượt riêng trước khi chạy trên index mới: recipe ID phải tồn tại và cùng món; query tên chung chấp nhận các biến thể cùng món; query có loại thịt/cách chế biến cụ thể chỉ chấp nhận recipe có nguyên liệu/thao tác đó. Biến thể nem chua được mô tả và hỏi đúng là món rán từ nem thành phẩm. Bộ query đã chốt trước phép đo corpus mới; giữ nguyên model E5, prefix, pooling, 512 token và passage template đã chọn, không đổi cấu hình để khớp điểm số.

Người rà là cùng agent triển khai, không có người/agent thứ hai. `review_status: separate_semantic_pass_same_agent` chỉ có nghĩa lượt review tách khỏi bước cấu hình/model; không tuyên bố review độc lập ngoài nhóm thực hiện. Nghiệm thu ngoài agent và thử nấu thuộc Phase 7, thể hiện riêng bằng `external_review_complete: false`. Người dùng có thể review file queries.json cùng nội dung corpus khi duyệt PR.

`technical_gate_met` cần ít nhất 150 positive, đủ 30 món, Hit@1 ≥ 0.90, Hit@3 ≥ 0.95 và không lẫn món. `acceptance_gate_met` còn cần review bên ngoài, nên không tự chuyển true theo metric. CLI/CI có `--require-technical-gate` để số đo không chỉ là báo cáo.

27 món hiện có một ứng viên; Hit/MRR tổng thể vì thế chủ yếu xác nhận luồng lọc/truy xuất. 18 contrastive holdout được báo Hit@1 riêng để thấy giới hạn khi phân biệt công thức. Số điểm cao không xác thực chất lượng ẩm thực của công thức AI, ảnh CV ngoài miền hay tính tổng quát trên corpus lớn hơn. Test fault injection và case API rỗng không đi vào phép đo retrieval.
