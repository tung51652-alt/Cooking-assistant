# Corpus công thức Phase 2

`corpus.json` có **33 công thức tiếng Việt, phủ 30/30 món**: 21 công thức nhập từ Wikibooks và 12 công thức nguyên gốc do AI biên soạn theo quyền chủ dự án cấp ngày 2026-10-19. Mỗi món có ít nhất một công thức; phở, bánh canh và bánh bột lọc có hai biến thể. Search trả số công thức thực tế, không nhân bản để đủ ba.

`manifest.json` ghi version `cooklens-recipes-v1`, coverage từng món, số lượng theo nguồn và review. Tất cả recipe có nguyên liệu, bước thực hiện, source/license và ghi chú chỉnh sửa. Không nhập ảnh. Bộ sưu tập theo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); từng record giữ giấy phép riêng trong source. Quyền với mã ứng dụng không thay đổi theo license corpus.

Với 21 record Wikibooks: giữ URL phiên bản bài viết, liên kết lịch sử tác giả, CC BY-SA 4.0 và chỉnh sửa. Có năm bản dịch từ tiếng Anh. Định lượng phức tạp vẫn nằm trong tên/ghi chú, không tự đổi cup/chén sang gram; trường số có thể null. Những trang chỉ giới thiệu món, thiếu bước thiết yếu hoặc chứa placeholder vẫn bị loại, kể cả khi món tương ứng đã được bổ sung bằng văn bản mới.

Với 12 record mới: source name và tag `ai_authored` công khai nguồn AI; giấy phép CC BY 4.0, `revision_url` null. Xem [Tác giả và phạm vi](AUTHORSHIP.md). Không gán nguồn Wikibooks/tác giả bên ngoài hoặc tạo liên kết bài viết giả. Công thức có định lượng gợi ý và bước làm đầy đủ, chưa nấu kiểm chứng; tổng thời gian để null. Món nem chua dùng biến thể rán từ nem thành phẩm và ghi rõ điều đó trong tên, tags, nguyên liệu, hướng dẫn và source.

Review hiện tại do agent đối chiếu cấu trúc, taxonomy, nguyên liệu/bước, tác giả/license và truy xuất; chưa có nghiệm thu của người nấu. Hoàn thành coverage kỹ thuật không đồng nghĩa đã xác thực chất lượng ẩm thực ngoài thực tế; phần đó phải được kiểm tra trong Phase 7.

Kiểm tra từ thư mục gốc:

```sh
python3 data/recipes/validate.py --require-full-coverage
python3 -m unittest discover -s data/tests -v
python3 deploy/scripts/check_public_metadata.py
```

CI bắt buộc full coverage; không hạ gate để công thức thiếu vẫn qua. Validator thư viện chuẩn được dùng lại bởi recipes/init, kiểm tra schema, ID, số hữu hạn, steps, Unicode, URL, license, duplicate, nguồn AI và manifest. Không gọi web trong runtime/validate. Model/vectors build giữ ngoài Git.

Không lưu giá trị hash/checksum/digest hoặc secret trong dữ liệu, URLs, code, tài liệu, notes hoặc output project. Source Wikibooks được mở khi nhập; source mới nằm trực tiếp trong PR dữ liệu, không tuyên bố đã tải từ website bên ngoài.
