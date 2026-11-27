# Kế hoạch điều chỉnh ngưỡng nhận diện món

[Issue #49](https://github.com/tung51652-alt/Cooking-assistant/issues/49)

1. Đo cùng checkpoint và tiền xử lý hiện tại trên ảnh bóng đèn, một nhóm ảnh ngoài danh mục và mẫu phân tầng từ split Test của 30VNFoods.
   So sánh ngưỡng 50%, 60%, 64%, 65%, 67%, 70% và 75% theo số ảnh ngoài danh mục bị chặn và số ảnh món Việt còn có gợi ý đúng trong top 3.
   Áp dụng kiểm tra ảnh mờ trước khi đo để phản ánh luồng người dùng.
2. Ưu tiên ngưỡng chặn ảnh bóng đèn có khoảng cách với điểm đo, giữ tỷ lệ gợi ý đúng cao và kiểm tra ảnh ngoài danh mục có điểm cao.
   Đồng bộ ngưỡng và thông báo trên Vision, gateway, web và Expo.
   Cho người dùng đổi ảnh hoặc chọn món theo tên khi hệ thống chưa đủ tự tin.
3. Kiểm tra hai phía của ngưỡng và chạy lại ảnh bóng đèn qua Docker, cùng các ca hồi quy API và giao diện.
   Ghi số liệu, nguồn ảnh và giới hạn của mẫu.

## Kết quả

Đo trên EfficientNet-B2 đang chạy của CookLens với cùng crop, softmax và kiểm tra ảnh mờ như luồng nhận diện.
Mẫu món Việt gồm 240 ảnh, lấy ngẫu nhiên 8 ảnh mỗi lớp từ manifest split Test với seed 49.
Đối chiếu tên tệp với bản `test.zip` đang được CI dùng.
Nhóm ngoài danh mục gồm 13 ảnh JPG/PNG của gói Ubuntu Wallpapers Noble và ảnh chó dùng trong nghiệm thu hiện tại.
Sáu ảnh ngoài danh mục bị bộ lọc ảnh mờ chặn trước khi áp dụng ngưỡng nhận diện. [30VNFoods](https://huggingface.co/datasets/vuongnhathien/30VNFoods) · [Ảnh Ubuntu Noble](https://packages.ubuntu.com/noble/ubuntu-wallpapers-noble) · [Ảnh chó](https://github.com/pytorch/hub/blob/master/images/dog.jpg)

| Ngưỡng | Ảnh ngoài danh mục bị chặn / 14 | Ảnh món có gợi ý / 240 | Ảnh món có đúng lớp trong top 3 / 240 |
| --- | ---: | ---: | ---: |
| 50% | 13 | 202 | 199 |
| 60% | 13 | 187 | 185 |
| 64% | 14 | 180 | 178 |
| **65%** | **14** | **179** | **177** |
| 67% | 14 | 178 | 176 |
| 70% | 14 | 173 | 171 |
| 75% | 14 | 166 | 164 |

Chọn 65% để có khoảng cách 1,94 điểm phần trăm với ảnh bóng đèn (63,06%).
So với 64%, ngưỡng này giảm một ảnh món có gợi ý đúng trong top 3.
So với 50%, giảm 22 ảnh có gợi ý đúng trong top 3, từ 82,9% xuống 73,8% trên nhóm ảnh này.
Ngưỡng 67% trở lên không chặn thêm ảnh ngoài danh mục trong mẫu.
Đây là phép thử trên mẫu nhỏ, chủ yếu gồm ảnh nền, nên ảnh ngoài danh mục khác vẫn có thể được gợi ý.
Chọn món trong danh mục là đường tiếp tục cho ảnh bị từ chối.

Chạy lại ca bóng đèn qua Docker với `COOKLENS_REAL_API=1` và `COOKLENS_LIGHTBULB_IMAGE` trỏ tới ảnh gốc trong gói Ubuntu.
Bộ nghiệm thu release giữ nguyên mẫu đầu tiên của mỗi lớp Test và ghi mã lỗi nếu ảnh bị từ chối.
Khi ảnh mờ hoặc điểm thấp, bộ kiểm thử vẫn tra công thức của món được chọn thủ công.
Lượt chạy Docker trên 30 ảnh cố định có 23 ảnh nhận gợi ý và 7 ảnh bị từ chối vì điểm thấp.
Cả 30 món tra được công thức và 12 ca trình duyệt dùng API thật đã qua.
