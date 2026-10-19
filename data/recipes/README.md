# Corpus công thức Phase 2

`corpus.json` chứa **21 công thức tiếng Việt, phủ 18/30 món**. Đây là corpus có nội dung thật để triển khai và kiểm thử retrieval; **chưa đạt cổng đủ 30 món**, chưa nấu kiểm chứng hoặc được người dùng nghiệm thu chất lượng ẩm thực. Không coi tên 30 lớp của CV là 30 công thức.

`manifest.json` ghi version, coverage từng món, phạm vi review và các nguồn bị loại. Mỗi recipe có trang nguồn, liên kết phiên bản bài viết và lịch sử tác giả trong attribution. Chỉ nhập văn bản, không nhập ảnh. Nội dung dịch/chỉnh sửa được chia sẻ theo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); quyền với mã ứng dụng không thay đổi vì license corpus.

Nguồn: cộng đồng Wikibooks tiếng Việt và Cookbook tiếng Anh. Giữ bản gốc ở liên kết revision, ghi rõ thay đổi trong `source.modifications`. Dịch năm công thức từ tiếng Anh. Chuẩn hóa Unicode NFC, số thứ tự bước, metadata và định lượng đơn giản; không tự đổi cup/chén sang gram. Định lượng phức tạp, lựa chọn nguyên liệu và khoảng số vẫn hiển thị trong tên/ghi chú; quantity và unit có thể null. Khẩu phần hoặc tổng thời gian không được xác định rõ để null, không cộng các thời gian chờ chồng lấn thành số giả.

Review hiện tại do agent đối chiếu nguồn và cấu trúc; chưa có review độc lập của người nấu. Bỏ chỉ dẫn luộc với ni lông và tuyên bố bảo quản bánh tét ở nhiệt độ phòng chưa kiểm chứng. Những trang thiếu bước thiết yếu hoặc chỉ giới thiệu món chưa được đưa vào corpus. Bộ global-recipes có license nhưng nguyên liệu/bước tiếng Việt là placeholder nên bị loại.

Các món còn thiếu: bánh căn, bánh cuốn, bánh giò, bánh khọt, bánh pía, bánh tráng nướng, bánh xèo, bún thịt nướng, cháo lòng, mì Quảng, nem chua, xôi xéo. Tiếp tục tìm nguồn hoặc biên soạn có căn cứ và review; không nhân bản recipe, đổi nhãn món hoặc tự nhận đã đủ coverage.

Kiểm tra từ thư mục gốc repo:

```sh
python3 data/recipes/validate.py
python3 -m unittest discover -s data/tests -v
python3 data/recipes/validate.py --require-full-coverage
```

Lệnh cuối **phải thất bại với corpus hiện tại**; đó là cổng phát hành bắt buộc, không được bỏ để đánh dấu Phase 2 hoàn thành. Validator chạy bằng thư viện chuẩn Python, được recipes/init dùng lại. Tất cả ID, thời gian, nguyên liệu, thứ tự bước, URL, license, duplicate và coverage đều được kiểm tra. Không gọi web khi validate hoặc phục vụ API.

Không lưu giá trị hash/checksum/digest hoặc secret vào corpus, metadata, URLs, tài liệu, output hay image; chạy `deploy/scripts/check_public_metadata.py` trước PR. Trang nguồn được mở và đối chiếu khi nhập ngày 2026-10-19; không tuyên bố đã kiểm tra lại URL trong chế độ offline.
