# Taxonomy món ăn dùng chung

`30vnfoods-label-map.json` là mapping authoritative của cả vision, recipes, backend và frontend API; version được công bố qua `taxonomy_version`.

- `class_id`: vị trí 0-based trong checkpoint, giữ nguyên thứ tự 30 lớp.
- `original_label`: nhãn huấn luyện chính xác, dùng để kiểm tra compatibility khi load checkpoint.
- `normalized_dish`: khóa canonical gửi giữa các service, không tự suy từ tên hiển thị.
- `display_name`: tên tiếng Việt NFC.
- `aliases`: các dạng gõ bảo thủ có dấu/không dấu, không thêm món con hoặc tên chung có thể nhập nhằng. So khớp alias bằng casefold, bỏ dấu, đổi đ thành d và gộp khoảng trắng; không cho một alias thuộc hai lớp khác nhau.

Mapping tận dụng nguồn ở nhánh `sida/data-30vnfoods-manifest`; enrich tên hiển thị/alias và kiểm tra thứ tự bằng manifest checkpoint đã duyệt Phase 0. Không phải corpus recipe. Các service đọc/copy cùng file có version, không hardcode lại danh mục riêng.

```bash
python3 -m unittest discover -s data/tests -v
python3 deploy/scripts/check_public_metadata.py
```

Ảnh dataset vẫn ở kho ngoài Git/image; `data/raw/source-manifest.json` giữ nguồn, trạng thái quyền dùng và thống kê báo cáo, không giả là dataset đang có local. CV PR Phase 1 nhập split/audit tương ứng để đối chiếu toàn bộ class indexes; không public hash hoặc thông tin truy cập.
