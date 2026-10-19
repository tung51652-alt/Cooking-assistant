# Phase 2 — Corpus và retrieval

Trạng thái: đang triển khai, chưa đóng phase. Người dùng đã merge Phase 1; nhánh data đã cập nhật từ develop trước khi làm.

## Dữ liệu hiện có

21 công thức có nguyên liệu, các bước thực hiện, source revision, lịch sử tác giả, license và chỉnh sửa; phủ 18/30 món. Chi tiết và 12 món thiếu trong [README corpus](../../data/recipes/README.md), số lượng từng món trong [manifest](../../data/recipes/manifest.json). Không đồng nhất review cấu trúc/nguồn của agent với review độc lập hoặc việc đã nấu kiểm chứng.

Dùng văn bản Wikibooks tiếng Việt và Cookbook tiếng Anh theo CC BY-SA 4.0, không nhập ảnh. Những trang chỉ giới thiệu món, thiếu bước thiết yếu hoặc nguyên liệu/bước không nhất quán bị loại. Bộ GitHub global-recipes bị loại do dữ liệu mẫu thay vì nguyên liệu thực. Không sử dụng sample FoodieAtlas có quyền giới hạn để đóng gói image public.

Validator thư viện chuẩn được dùng chung cho data/service/init. Kiểm tra ID, taxonomy, Unicode, kiểu số hữu hạn, thứ tự bước, duplicate, URL không chứa credentials, license, ngày và coverage. Test hồi quy giữ lại để ngăn corpus lỗi vào image; không giữ các file thử tải hoặc HTML crawl tạm trong Git.

## Kiểm tra và cổng còn mở

- Validator corpus và 6 bài kiểm tra data/taxonomy đã qua ở nhánh data.
- Input manifest Phase 0 vẫn qua kiểm tra.
- `--require-full-coverage` chưa qua: corpus chưa phủ đủ 30 món. Giữ cổng này bắt buộc trước phát hành.
- Chưa có kết quả evaluation độc lập, benchmark recipes hoặc nghiệm thu ẩm thực. Không công bố Hit@1/Hit@3 đã đạt.
- Model multilingual-e5-small đã tải vào staging bị Git ignore và load thử local thành công với chiều 384; chưa coi đó là đã hoàn thành image/runtime offline.

## Kết thúc và merge

Chưa đóng Phase 2. Tạo PR dữ liệu trước PR service phụ thuộc; người dùng tự merge. Không chuyển Phase 3 trước khi rà lại coverage, tiêu chí chất lượng và kết quả runtime.

Trước PR: rà files thừa, fixture/test tạm, secrets và mọi giá trị hash/checksum/digest/định danh revision dạng hash trong toàn bộ file public; không xuất giá trị phát hiện. Không commit model, cache, raw HTML crawl hoặc download log. Liên kết revision Wikibooks dùng số phiên bản bài viết phục vụ attribution, không sao chép định danh Git/model hub vào tài liệu.
