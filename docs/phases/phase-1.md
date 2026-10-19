# Phase 1 — CV Top-3 và taxonomy

Ngày: 2026-10-19. Phase 0 đã merge và được xác nhận trên `origin/develop`. Hai nhánh cùng phase: `feature/data-recipes` chỉ nhập/enrich taxonomy từ nhánh data hiện có; `minh/cv` được đồng bộ develop và dùng đúng phần mapping đó. Không kéo web-search prototype vào runtime.

Trạng thái: **phần triển khai và kiểm thử kỹ thuật đã sẵn sàng review; chờ người dùng merge mapping trước, CV sau**. Chưa bắt đầu Phase 2 hoặc phát hành CookLens v2.

## Thay đổi và bằng chứng

| Phần | Kết quả |
| --- | --- |
| Mapping | [Taxonomy](../../data/processed/30vnfoods-label-map.json) giữ thứ tự 30 nhãn checkpoint, canonical key, tên Việt NFC và alias không nhập nhằng. Metadata test đối chiếu 25.032 hàng split, gồm 5.004 hàng Test; không đổi split |
| Model | CPU, eval/inference mode; load một lần/process từ staging hoặc FOOD_MODEL_PATH. Strict weights, architecture, image size, transform và class/taxonomy compatibility; không tải pretrained weights |
| Top-3 | Full softmax, sort stable và lấy ba mục đầu, tie theo class ID. Không normalize lại 3 mục, không round trước sort, không tự xác nhận món |
| API | [Fixture nội bộ dùng chung](../contracts/fixtures/vision-predict.json) cho typed-client tests ở backend; `/predict` nội bộ, `/health/live`, `/health/ready`, Swagger upload; model/taxonomy versions. `/health` giữ alias, shape Top-1 cũ được thay thế rõ trong tài liệu |
| Validation | Giới hạn file/request/pixels/frames, MIME-format match, corrupt/bomb và RGB conversion. Body chunked được giới hạn trước parser; một work slot, quá tải 503, deadline nhận body 15 giây |
| Lỗi | Code/message/request ID an toàn; không trả/log raw exception, stack hoặc path riêng. Model/mapping hỏng làm startup fail; health ready chỉ sau validation |
| Docker | Non-root, model/mapping/notice đóng gói, không fixture/tests/notebooks/dataset/frontend/docs/env trong application tree. Smoke offline/read-only; không publish Hub hoặc gắn tag release ứng dụng |

## Kiểm thử thực tế

- 1 test taxonomy độc lập ML và 16 integration/regression tests đạt với checkpoint thật: shape/order/probabilities, legacy Top-1 equivalence, stable tie, preprocessing, load một lần, RGB/L/RGBA/JPEG, upload lỗi, frame/pixel/bomb, missing/extra fields, busy, chunked overflow/disconnect/timeout, safe errors, readiness và startup mismatch.
- [CPU evidence](evidence/phase-1-cpu.json): 100 request qua ASGI TestClient, concurrency 1, 4 torch threads; P95 78.702 ms, peak RSS process 488.93 MiB. Máy Intel Core i5-10300H, 8 logical CPUs, tổng RAM khoảng 7.59 GiB; không tính tổng RAM máy như ngân sách cấp cho stack.
- [Docker evidence](evidence/phase-1-docker.json): linux/amd64, network none, root filesystem read-only, tmpfs upload 32 MiB, 4 CPU/2 GiB limit; health và ảnh thật trả Top-3, invalid MIME bị reject. Cgroup peak gồm cả các khoản bộ nhớ container, khác với process RSS.
- Ảnh smoke là figure món ăn đã có trong notebook do nhóm cung cấp, chứa nhãn dự đoán trên hình; chỉ dùng regression/latency, không dùng accuracy/generalization evaluation. Giữ thành một fixture có provenance; dọn output/execution metadata notebook để test không lệ thuộc cell index hoặc phát sinh mã trong output.
- Workflow `Vision Top-3` kiểm tra model thật và build/smoke image trên CI; xem checks PR cho trạng thái commit mới nhất. Workflow input chung kiểm tra taxonomy và public-content policy.

## Accuracy và giới hạn

[Báo cáo huấn luyện](../../ai/cv/experiments/efficientnet-b2-30vnfoods-2026-09-30/experiment_summary.json) trên split cố định 5.004 ảnh Test ghi Top-1 87.61%, Top-3 96.08%, macro F1 87.70%. Đây là số do nhóm train báo cáo, không phải kết quả chạy lại toàn bộ ảnh ở Phase 1. Máy hiện không có ảnh gốc, chỉ có manifest và checkpoint; đã đối chiếu mọi class/index của split, cùng transform, weights và Top-1 với inference cũ trên fixture thật.

Không dùng latency T4 trong báo cáo cũ làm cam kết CPU. Số đo CPU hiện tại chỉ là ảnh mẫu lặp lại; Phase 7 vẫn phải nghiệm thu ảnh đại diện/held-out, accuracy, concurrency và tài nguyên toàn stack theo kế hoạch. Không tuyên bố phát hiện món ngoài 30 lớp hoặc ảnh nhiều món.

## Cổng bàn giao

- [x] Giữ runtime code, shared taxonomy, test hồi quy/fixture có chủ đích và evidence chọn lọc; tách benchmark sang `ai/cv/evaluation`, không copy vào image.
- [x] Bỏ placeholder thừa ở thư mục đã có nội dung; dọn outputs/notebook metadata. Không commit checkpoint, venv, cache, dependencies hoặc reports tạm.
- [x] Chạy scanner toàn tracked text files, không có giá trị mã/hash hoặc credentials bị phát hiện. Không thêm ngoại lệ cho checksum, revision hoặc lockfile. Không viết lại lịch sử nhánh chia sẻ.
- [x] Rà build context/COPY, runtime application tree và offline non-root/read-only smoke. Platform/dependency metadata do công cụ bên ngoài tạo không được sao chép vào docs/source.
- [x] Kiểm tra Markdown links/fences, JSON/Python/YAML, diff whitespace và tests phù hợp. Không chạy lại frontend E2E vì không đổi UI.
- [ ] Người dùng merge PR #8 (mapping), sau đó PR CV; agent fetch xác nhận develop trước Phase 2.

Hướng dẫn chạy/API: [vision README](../../ai/cv/inference/README.md). Source mapping: [data README](../../data/processed/README.md). Các service tiếp theo dùng cùng file taxonomy/version, không hardcode lại class list.
