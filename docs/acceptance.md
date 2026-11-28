# Kết quả nghiệm thu

## Trạng thái phát hành

[`v2.0.0`](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/v2.0.0) phát hành ngày 2026-11-25, Linux amd64/CPU.
Bản này phát hành theo yêu cầu người dùng trước khi nghiệm thu thủ công đầy đủ (`release_acceptance_complete=false`).
Các mục hoãn: Android thật, đủ 50 câu đánh giá trợ lý trên cùng candidate và human review chất lượng câu trả lời.
Kiểm tra tự động, digest và pull ẩn danh vẫn bắt buộc và đã qua; `candidate.json` và `verification.json` trong gói ghi số đo của bộ phát hành.

`develop` đang chuẩn bị `2.1.0` qua [PR #64](https://github.com/tung51652-alt/Cooking-assistant/pull/64); việc còn mở ở [kế hoạch](plan/README.md).

## Nhận diện và tra công thức

Đo trên candidate `2.0.0-rc.2`; checkpoint vision và embedding không đổi ở `2.0.0`.

| Hạng mục | Kết quả |
| --- | --- |
| CV, 5.004 ảnh/30 lớp | Top-3 96,0831%; Top-1 87,5699%; Macro F1 0,876567 |
| Retrieval corpus v1, 204 query/30 món | Hit@1/Hit@3/MRR = 1; không sai món; 18 holdout đạt Hit@1 = 1 |
| Luồng ảnh đại diện | 30/30 luồng qua; Top-3 đúng ở 28/30 ảnh |
| Browser thật | 10/10 ca desktop/mobile, gồm ảnh ngoài miền và nhiều món |
| Runtime, 100 mẫu/API | P95 vision 0,1614 s; search 0,0887 s; cold start 37,336 s |
| Cùng giới hạn 4 logical CPU | P95 vision 0,6225 s; search 0,9101 s |

Fresh seed, seed lặp, persistence, upgrade/rollback, bundle sai, dependency recovery và offline đều qua.
Ảnh lỗi trả 400, upload quá lớn 413, món ngoài danh mục 422, recipe không tồn tại 404.

| Service | Giới hạn RAM (MiB) | Peak RAM (MiB) |
| --- | --- | --- |
| `qdrant` | 512 | 79.2 |
| `vision` | 1024 | 414.4 |
| `recipes` | 2048 | 755.1 |
| `backend` | 512 | 258.9 |
| `frontend` | 128 | 8.3 |

Các service dùng chung 4 logical CPU, cold start 49,534 s; peak RAM đo riêng từng service, không phải peak đồng thời.

## Ngưỡng nhận diện 65%

[Issue #49](https://github.com/tung51652-alt/Cooking-assistant/issues/49): ảnh bóng đèn được gợi ý là Bánh tét với 63,06%.
Đo trên checkpoint đang dùng, cùng tiền xử lý và kiểm tra ảnh mờ.
Mẫu món Việt: 240 ảnh, 8 ảnh/lớp lấy ngẫu nhiên từ split Test (seed 49).
Mẫu ngoài danh mục: 13 ảnh nền [Ubuntu Wallpapers Noble](https://packages.ubuntu.com/noble/ubuntu-wallpapers-noble) và [ảnh chó](https://github.com/pytorch/hub/blob/master/images/dog.jpg) của bộ nghiệm thu; 6 ảnh bị chặn bởi bộ lọc ảnh mờ.

| Ngưỡng | Ngoài danh mục bị chặn / 14 | Ảnh món có gợi ý / 240 | Đúng lớp trong Top-3 / 240 |
| --- | ---: | ---: | ---: |
| 50% | 13 | 202 | 199 |
| 60% | 13 | 187 | 185 |
| 64% | 14 | 180 | 178 |
| **65%** | **14** | **179** | **177** |
| 67% | 14 | 178 | 176 |
| 70% | 14 | 173 | 171 |
| 75% | 14 | 166 | 164 |

Chọn 65% để cách ảnh bóng đèn 1,94 điểm phần trăm.
So với 50%, ảnh có gợi ý đúng giảm từ 82,9% xuống 73,8% trên mẫu này; ảnh bị từ chối đi tiếp bằng chọn món theo tên.
Trên 30 ảnh cố định của flow runner qua Docker, 23 ảnh có gợi ý, 7 ảnh bị từ chối vì điểm thấp; cả 30 món tra được công thức.
Mẫu ngoài danh mục nhỏ và chủ yếu là ảnh nền, nên ảnh ngoài danh mục khác vẫn có thể được gợi ý.

## Corpus công thức v3

`cooklens-recipes-v3` (90 công thức, nay là `v3-1` sau khi sửa ghi chú biên tập ở #69) trên Recipes API và Qdrant 1.19.2 local, 259 query/30 món:
Hit@1 93,05%, Hit@3 100%, MRR 0,9646, không sai món.
Gói runtime v3, nghiệm thu ngoài nhóm và thử nấu chưa thực hiện.
Chi tiết và lịch sử đo ở [đánh giá truy xuất](../ai/rag/evaluation/REVIEW.md); rà soát nguồn ở [corpus](../data/recipes/README.md).

## Trợ lý

Các lần đo dùng cùng [fixture 50 request](testing.md#đánh-giá-trợ-lý), tuần tự; evaluator không tự gửi lại, chỉ retry nội bộ của adapter nằm trong deadline.

| Ngày | Provider/model | Kết quả |
| --- | --- | --- |
| 22/11 | NVIDIA Nemotron 3 Ultra | 50/50 HTTP/state, usage đạt; latency trượt (p95 14,07 s, sau sửa prompt 8,48 s) |
| 22/11 | NVIDIA Nemotron 3.5 Super (`2.0.0-rc.16` local) | 50/50; p50/p95/max 0,87/2,08/4,16 s; input TB 2.176, output TB 77 token |
| 22/11 | Gemma 4, Nemotron 3.5 Lightning, Bolt | Loại ở vòng sàng lọc: timeout hoặc trả lời sai lịch sử hội thoại |
| 25/11 | Gemini 3.1 Flash-Lite, deadline 20 s | Dừng ở 30/31 do timeout; 2/2 flow web thật qua |
| 27/11 | Gemini 3.1 Flash-Lite, deadline 8 s + retry | Dừng sau 2 request do 504; 2/2 flow web thật qua |
| **27/11** | **Gemini 3.5 Flash-Lite (mặc định)** | **50/50 HTTP/state; p50/p95/max 1,10/1,51/1,71 s; input TB 2.112 (p95 2.390), output TB 59 (max 225) token; 4/4 lỗi kiểm soát; 2/2 flow web thật** |

Gemini 3.5 Flash-Lite qua các gate HTTP/state, latency và usage; human review chất lượng câu trả lời vẫn chưa hoàn tất.
Restart/replay hội thoại giữ nguyên và không gọi thêm provider; key chỉ xuất hiện ở backend.
Latency gồm gateway, mạng và provider; usage lấy từ số provider báo, không phải hóa đơn.
Giá Gemini 3.5 Flash-Lite theo trần Standard $0,30 input / $2,50 output mỗi triệu token; mỗi câu giữ chỗ $0,631706 cho hai lần thử.

## Hồi quy source

| Kiểm tra | Trước `2.0.0` (25/11) | `develop` trước `2.1.0` (28/11) |
| --- | --- | --- |
| Backend Java 21 | 76 | 93, Spotless sạch |
| Deploy/release tooling | 65 | 70 |
| Dữ liệu | 7 | 15; 90 công thức đủ 30 món |
| Client dùng chung | 14 | 18 |
| Vision / RAG | — | 18 / 19 (RAG với Qdrant riêng) |
| Playwright, API mô phỏng | 44 | 74 |
| Playwright, stack Docker thật | — | 12, gồm trợ lý Gemini 3.5 và ảnh bóng đèn của #49; 2 ca cần ảnh nhiều món bị bỏ qua |
| Expo | 22 | 37, typecheck và kiểm tra dependency Expo |
| Lint/format | — | ESLint, Prettier, Ruff đạt |

Tất cả ca đã chạy đều qua; stack dùng image build từ source với corpus `cooklens-recipes-v3-1`.
Trên cùng stack, năm câu hỏi liên tiếp về Phở gà trả lời trong 1,1–1,8 s, và endpoint tùy chỉnh trỏ tới địa chỉ nội bộ bị từ chối ngay (#66).

## Giới hạn diễn giải

- Top-1 thấp hơn baseline lịch sử khoảng 0,04 điểm phần trăm (hai ảnh); chưa xác định nguyên nhân.
- Ảnh tải lại từ [mirror 30VNFoods](https://huggingface.co/datasets/vuongnhathien/30VNFoods) khớp tên/class trong manifest, chưa chứng minh byte identity.
  License mirror CC BY-NC-SA 4.0 chưa giải quyết mọi mâu thuẫn quyền upstream.
- Review công thức do nhóm triển khai thực hiện, không phải reviewer độc lập; thử nấu đã bỏ khỏi gate.
- Giới hạn 4 CPU được thử trên host 8 logical CPU/khoảng 7,6 GiB RAM; chưa xác định cấu hình tối thiểu.
- Image audit tập trung phần do dự án quản lý, không phải toàn bộ binary upstream.
- Expo mới được kiểm tra typecheck/bundle và một lần upload trên điện thoại; camera, quyền, background và accessibility trên Android thật còn mở.
