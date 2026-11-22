# Kết quả nghiệm thu

Bộ ứng viên **2.0.0-rc.2**, Linux amd64/CPU. Kiểm thử kỹ thuật gần nhất: **2026-11-22**.
Các gate kỹ thuật đã đạt;
[PR nghiệm thu #20](https://github.com/tung51652-alt/Cooking-assistant/pull/20) là đầu mối review.
Bản chính thức `v2.0.0` chưa phát hành.

Các kết quả dưới đây chỉ áp dụng luồng nhận diện/tra công thức. Trợ lý trò chuyện
và hướng dẫn nấu mới được bổ sung vào [kế hoạch MVP](plan/assistant.md), chưa triển khai/đánh giá.

## Số đo chính

| Hạng mục | Kết quả |
| --- | --- |
| CV, 5.004 ảnh/30 lớp | Top-3 96,0831%; Top-1 87,5699%; Macro F1 0,876567 |
| Retrieval, 204 query/30 món | Hit@1/Hit@3/MRR = 1; không sai món; 18 holdout đạt Hit@1 = 1 |
| Luồng ảnh đại diện | 30/30 luồng qua; Top-3 đúng ở 28/30 ảnh, tách khỏi thành công sửa món |
| Browser thật | 10/10 ca desktop/mobile; gồm ảnh ngoài miền và nhiều món |
| Regression | 28 deploy, 7 data, 13 backend và 20 browser mô phỏng đều qua |
| Runtime, 100 mẫu/API | P95 vision 0,1614 s; search 0,0887 s; cold start 37,336 s |
| Cùng giới hạn 4 logical CPU | P95 vision 0,6225 s; search 0,9101 s |

Fresh seed, seed lặp, persistence, upgrade/rollback, bundle sai, dependency recovery
và offline đều qua. Ảnh lỗi trả 400, upload quá lớn trả 413, món ngoài danh mục
trả 422, recipe không tồn tại trả 404. Ba ảnh confidence dưới 0,3 vẫn qua luồng xác nhận/sửa món.
Fixture UI chỉ dùng kiểm tra luồng, không dùng để tính accuracy.

## Tài nguyên runtime

Tất cả service dùng chung 4 logical CPU; cold start 49.534 s.
Peak dưới đây đo riêng từng service, không cộng thành peak đồng thời toàn stack.

| Service | Giới hạn RAM (MiB) | Peak RAM (MiB) |
| --- | --- | --- |
| `qdrant` | 512 | 79.2 |
| `vision` | 1024 | 414.4 |
| `recipes` | 2048 | 755.1 |
| `backend` | 512 | 258.9 |
| `frontend` | 128 | 8.3 |

## Phân phối và mobile

- Registry: bốn image ứng dụng public đã pull ẩn danh và kiểm tra trên runner sạch.
- Expo: [PR #17](https://github.com/tung51652-alt/Cooking-assistant/pull/17) tích hợp
  client dùng chung API. Người dùng xác nhận upload ngày 2026-10-26; kiểm thử đầy đủ
  Android/iOS, camera/HEIC, permission, Back và accessibility còn mở.

## Giới hạn diễn giải

- Top-3 bằng baseline lịch sử; Top-1 thấp hơn khoảng 0,0400 điểm phần trăm (hai ảnh).
  Chưa xác định nguyên nhân khác biệt.
- Ảnh tải lại từ [mirror 30VNFoods](https://huggingface.co/datasets/vuongnhathien/30VNFoods)
  khớp tên/class trong manifest; chưa chứng minh byte identity với dữ liệu lịch sử.
  License mirror CC BY-NC-SA 4.0 chưa giải quyết mọi mâu thuẫn quyền upstream.
- 27 món chỉ có một ứng viên: điểm retrieval không chứng minh ranking trên corpus lớn.
- Review công thức do cùng agent triển khai,
  không tự nhận reviewer độc lập. Thử nấu đã bỏ khỏi gate theo yêu cầu người dùng.
- Giới hạn 4 CPU được thử trên host 8 logical CPU/khoảng 7,6 GiB RAM, có CV chạy
  đồng thời; chưa xác định cấu hình vật lý tối thiểu. Peak RAM theo service không phải peak đồng thời.
- Image audit tập trung phần do dự án quản lý, không phải toàn bộ binary upstream.

Cách chạy lại ở [testing.md](testing.md); công việc tiếp theo ở [plan/mvp.md](plan/mvp.md).
