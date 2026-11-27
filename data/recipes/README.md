# Corpus công thức

`corpus.json` có **90 công thức tiếng Việt cho đủ 30 món**, gồm 42 công thức từ Wikibooks, 37 bản ghi dựa trên công thức từ nguồn tiếng Việt khác và 11 công thức có gắn nhãn AI từ [Phase 2](AUTHORSHIP.md).
Nem chua có một công thức Yên Mạc. Mỗi món còn lại có ít nhất hai biến thể. Số lượng của từng món được ghi trong `manifest.json`.
Search trả số công thức phù hợp trong giới hạn `top_k` từ 1 đến 3.
Tạo lại vector bundle, build image recipes/backend và chạy `recipe-init` để dùng collection v3-1 khi dựng từ source.
[Hướng dẫn dựng image](https://github.com/tung51652-alt/Cooking-assistant/blob/main/docs/development.md)

`manifest.json` ghi version `cooklens-recipes-v3-1`, coverage từng món, số lượng theo nguồn và review.
Mỗi công thức có nguyên liệu, bước làm, thông tin nguồn, giấy phép và ghi chú chỉnh sửa.
Bộ sưu tập văn bản theo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) và mỗi bản ghi ghi rõ giấy phép riêng trong `source`.
Giấy phép của 37 bản ghi từ nguồn ngoài Wikibooks áp dụng cho bản chuẩn hóa trong corpus. Quyền dùng lại văn bản và hình ảnh của nguồn gốc được ghi riêng trong ghi chú nguồn.

Các bản ghi Wikibooks giữ URL phiên bản bài viết, liên kết lịch sử tác giả, CC BY-SA 4.0 và ghi chú chỉnh sửa.
Các bản ghi từ những nguồn tiếng Việt khác dẫn trang công thức và ghi tên tác giả hoặc đơn vị đăng khi xác định được.
Tách định lượng rõ ràng vào `quantity` và `unit`. Giữ khoảng lượng và lựa chọn thay thế trong ghi chú, dùng `null` nếu thiếu số. Các đơn vị như `muỗng canh`, `muỗng cà phê`, `cốc`, `pao` và `lít` giữ nguyên lượng của nguồn. Nguồn chỉ có tổng thời gian thì ghi trong `source.modifications`.
`ingredients.note` chỉ chứa thông tin hữu ích cho người nấu; ghi chú biên tập đặt trong `source.modifications`.
Việt hóa thuật ngữ trong nội dung nấu ăn, dùng mức lửa mô tả thay cho số mức phụ thuộc bếp.
Validator chặn các mẫu ghi chú nội bộ, thuật ngữ nguồn chưa dịch đã biết và mức bếp bằng số; khi nhập nguồn mới cần rà soát ngôn ngữ và bổ sung danh sách thuật ngữ nếu cần.
Mỗi bản sửa nội dung cần version corpus mới vì initializer không ghi đè collection đã tồn tại.
Phiên nấu giữ snapshot cũ; sau khi cập nhật dịch vụ, chọn lại công thức và tạo phiên mới để dùng nội dung mới.
Chỉ nhập công thức đủ nguyên liệu và các bước thiết yếu. Với nguồn gốc văn bản chưa rõ, bản ghi dùng các dữ kiện nấu ăn và ghi rõ bài đăng đối chiếu trong `source.modifications`. Các nguồn có hạn chế rõ ràng được loại khỏi đợt nhập.

Công thức do AI biên soạn dùng tên nguồn và tag `ai_authored`, giấy phép CC BY 4.0 và `revision_url` là `null`.
Định lượng là hướng dẫn cho bếp gia đình. Công thức đang chờ thử nấu và tổng thời gian để `null`.
Bản ghi nem chua dùng nem Yên Mạc thành phẩm đã lên men, cuốn lá ổi hoặc lá sung và chấm mắm chanh tỏi. Sở Du lịch Ninh Bình ghi lại cách ăn này.

## Rà soát corpus v3

v3 giữ 32 công thức từ v2, thêm 58 công thức có nguồn và bỏ bản nem chua tẩm bột chiên cũ; v2 dùng collection Qdrant riêng để rollback.
Lần rà soát kiểm tra món hoàn chỉnh, nguyên liệu và cách làm của cả 100 bản ghi trong bản nháp.
Biến thể vùng miền hoặc chay được giữ khi còn đặc trưng cách làm hoặc cách dọn của món, ví dụ bánh cuốn Cao Bằng, mì Quảng cá lóc, bún đậu chay.

| Bản ghi bị loại | Lý do |
| --- | --- |
| `wb_banh_beo_phong_tom_tom_chay` | Bánh phồng tôm thay cho bánh hấp gạo của món |
| `wb_banh_mi_chien_tom`, `wb_banh_mi_hap_bo_heo_xa`, `wb_banh_mi_nuong_muoi_ot` | Là món ăn vặt chế biến riêng, không phải bánh mì |
| `vn_banh_mi_xiu_mai_nuoc_sa_te` | Nguồn là canh xíu mại; bản nháp tự thêm bánh mì ăn kèm |
| `wb_bun_bo_chay` | Thiếu mắm ruốc chay và dầu điều của nguồn |
| `wb_pho_cuon_bo_xao_gung_toi`, `wb_pho_cuon_bo_bam_nuoc_cham_giam` | Phở cuốn là món khác với nhãn phở nước |
| `wb_pho_ga_nam_dong_co` | Nguồn dùng bún; bản nháp thay bằng bánh phở |
| `cooklens_nem_chua_home`, `vi_nem_chua_ran_thit_heo_bi_ao_bot` | Thành phẩm là nem tẩm bột chiên, không phải nem chua lên men |

Kết quả truy xuất ở [đánh giá retrieval](../../ai/rag/evaluation/REVIEW.md). Gói runtime v3, nghiệm thu ngoài nhóm và thử nấu chưa thực hiện.

## Kiểm tra

Từ thư mục gốc:

```sh
python3 data/recipes/validate.py --require-full-coverage
python3 -m unittest discover -s data/tests -v
python3 deploy/scripts/check_public_metadata.py
```

CI và bản phát hành vẫn yêu cầu đủ 30 món bằng `--require-full-coverage`. Validator thư viện chuẩn được dùng lại bởi recipes/init, kiểm tra schema, ID, số hữu hạn, steps, Unicode, URL, license, duplicate, nguồn AI và manifest. Không gọi web trong runtime/validate. Model/vectors build giữ ngoài Git.

Không lưu giá trị hash/checksum/digest hoặc secret trong dữ liệu, URLs, code, tài liệu, notes hoặc output project. URL nguồn và ghi chú đối chiếu được lưu cùng mỗi bản ghi.
