# Corpus công thức

`corpus.json` có **90 công thức tiếng Việt cho đủ 30 món**, gồm 42 công thức từ Wikibooks, 37 bản ghi dựa trên công thức từ nguồn tiếng Việt khác và 11 công thức có gắn nhãn AI từ [Phase 2](AUTHORSHIP.md).
Nem chua có một công thức Yên Mạc. Mỗi món còn lại có ít nhất hai biến thể. Số lượng của từng món được ghi trong `manifest.json`.
Search trả số công thức phù hợp trong giới hạn `top_k` từ 1 đến 3. Tạo lại vector bundle và chạy `recipe-init` để dùng collection v3 khi dựng từ source. [Hướng dẫn dựng image](https://github.com/tung51652-alt/Cooking-assistant/blob/main/docs/development.md)

`manifest.json` ghi version `cooklens-recipes-v3`, coverage từng món, số lượng theo nguồn và review.
Mỗi công thức có nguyên liệu, bước làm, thông tin nguồn, giấy phép và ghi chú chỉnh sửa.
Bộ sưu tập văn bản theo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) và mỗi bản ghi ghi rõ giấy phép riêng trong `source`.
Giấy phép của 37 bản ghi từ nguồn ngoài Wikibooks áp dụng cho bản chuẩn hóa trong corpus. Quyền dùng lại văn bản và hình ảnh của nguồn gốc được ghi riêng trong ghi chú nguồn.

Các bản ghi Wikibooks giữ URL phiên bản bài viết, liên kết lịch sử tác giả, CC BY-SA 4.0 và ghi chú chỉnh sửa.
Các bản ghi từ những nguồn tiếng Việt khác dẫn trang công thức và ghi tên tác giả hoặc đơn vị đăng khi xác định được.
Tách định lượng rõ ràng vào `quantity` và `unit`. Giữ khoảng lượng và lựa chọn thay thế trong ghi chú, dùng `null` nếu thiếu số. Các đơn vị như `muỗng canh`, `muỗng cà phê`, `cốc`, `pao` và `lít` giữ nguyên lượng của nguồn. Nguồn chỉ có tổng thời gian thì ghi trong `source.modifications`.
Chỉ nhập công thức đủ nguyên liệu và các bước thiết yếu. Với nguồn gốc văn bản chưa rõ, bản ghi dùng các dữ kiện nấu ăn và ghi rõ bài đăng đối chiếu trong `source.modifications`. Các nguồn có hạn chế rõ ràng được loại khỏi đợt nhập.

Công thức do AI biên soạn dùng tên nguồn và tag `ai_authored`, giấy phép CC BY 4.0 và `revision_url` là `null`.
Định lượng là hướng dẫn cho bếp gia đình. Công thức đang chờ thử nấu và tổng thời gian để `null`.
Bản ghi nem chua dùng nem Yên Mạc thành phẩm đã lên men, cuốn lá ổi hoặc lá sung và chấm mắm chanh tỏi. Sở Du lịch Ninh Bình ghi lại cách ăn này.

Lần rà soát phân loại đã kiểm tra món hoàn chỉnh, nguyên liệu và cách làm của cả 100 bản ghi trước khi giữ lại 89.
Kết quả tìm kiếm và trạng thái thử nấu được ghi ở `docs/plan/2026-11-26-recipe-dataset-expansion.md` trong kho mã nguồn.

Kiểm tra từ thư mục gốc:

```sh
python3 data/recipes/validate.py --require-full-coverage
python3 -m unittest discover -s data/tests -v
python3 deploy/scripts/check_public_metadata.py
```

CI và bản phát hành vẫn yêu cầu đủ 30 món bằng `--require-full-coverage`. Validator thư viện chuẩn được dùng lại bởi recipes/init, kiểm tra schema, ID, số hữu hạn, steps, Unicode, URL, license, duplicate, nguồn AI và manifest. Không gọi web trong runtime/validate. Model/vectors build giữ ngoài Git.

Không lưu giá trị hash/checksum/digest hoặc secret trong dữ liệu, URLs, code, tài liệu, notes hoặc output project. URL nguồn và ghi chú đối chiếu được lưu cùng mỗi bản ghi.
