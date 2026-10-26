# Quyết định runtime và đầu vào — Phase 0

Ngày audit: 2026-10-19. Đây là quyết định runtime cho lần giao Top-3 + recipe; benchmark và giới hạn phát hành được ghi riêng trong báo cáo phase. Phase 0–5 hiện đã merge vào `origin/develop`; Docker Hub release và nghiệm thu cuối chưa hoàn tất.

## Stack và embedding

- React + TypeScript + Vite build static, Nginx phục vụ và proxy `/api`; giữ HTML nguồn theo [audit frontend](../frontend-reference/README.md).
- Spring Boot/Java 21 là public backend; vision FastAPI/PyTorch; recipes FastAPI + model local; Qdrant và một job init. Chưa cần PostgreSQL, LangGraph, LLM hay API key người dùng.
- Baseline embedding: `intfloat/multilingual-e5-small`, thông tin nguồn/bundle ở [artifact manifest](../../deploy/artifacts/manifest.json). Model card công bố MIT, embedding 384 chiều. Dùng masked mean pooling, L2 normalize, cosine; prefix `query: ` và `passage: ` cho cả tiếng Việt, tối đa 512 tokens.
- Passage text v1 theo thứ tự: `title`, tên món, tên nguyên liệu, steps; ghép plain text có nhãn trường. Phần đầu chứa title/món; tokenizer truncate 512 tokens và đo tỷ lệ truncate trong báo cáo. Full recipe vẫn lưu đủ trong payload; nếu chất lượng chưa đạt mới đánh giá chunking với version mới.
- Chọn model làm baseline không đồng nghĩa đã chứng minh retrieval tốt trên corpus dự án. Phase 2 phải đạt gate; thay model/bundle/pooling/text template cần version embedding mới, rebuild index và nghiệm thu lại, không đổi im lặng.
- Query không có threshold cắt similarity ở v1, không reranker, không LLM fallback. Filter cứng món/ngôn ngữ/cuisine; top 1–3 thật, không tạo đủ số lượng bằng bản trùng.
- Prefix/pooling theo [model card chính thức](https://huggingface.co/intfloat/multilingual-e5-small); nguồn upstream hiện ghi bằng tên nhánh `main`, không lưu mã revision. Phase 2 phải tạo bundle release có version dễ đọc và không đổi nội dung dưới cùng version.

## Tiêu chí nghiệm thu đã chọn cho bản v1

Giữ các gate của kế hoạch: CV Top-3 ≥95% trên clean test split 5.004 ảnh; đủ mapping 30 lớp; tối thiểu một recipe được review mỗi món hỗ trợ; retrieval ít nhất 150 query (5/món), Hit@1 ≥0.90, Hit@3 ≥0.95, báo MRR và không lẫn món xác nhận. Không dùng cùng query set để tối ưu cấu hình rồi báo như test độc lập.

P95 warm inference ≤10 giây, search ≤3 giây ở concurrency 1, ít nhất 100 lần/API; cold boot/seed đo riêng. CPU baseline mục tiêu: 4 logical cores/8 GiB RAM; chưa tuyên bố đã chạy stack đầy đủ với mức này.

Máy audit thực: Intel Core i5-10300H @2.50GHz, 8 logical CPUs, tổng RAM 7.59 GiB theo `/proc/meminfo`; Linux x86_64, Docker 29.8.1, Compose v5.5.1. Khi benchmark phải ghi RAM cấp Docker và tải nền, giới hạn CPU tương ứng; không coi tổng RAM máy là RAM stack được phép dùng. Test release `linux/amd64` trước, chưa hứa `arm64` hay GPU.

## Checkpoint và artifact supply

Đã load file checkpoint local bằng `torch.load(..., map_location="cpu", weights_only=True)`, đối chiếu architecture, classes, image size và shape classifier; đây là kiểm tra format, không phải chạy lại benchmark accuracy. Metadata kiến trúc/kích thước nằm trong manifest; binary không vào Git.

Build staging chuẩn: `deploy/artifacts/staging/vision/efficientnet_b2_best.pt`. Runtime path `/opt/cooklens/models/efficientnet_b2_best.pt`. Nguồn chuẩn là GitHub Release `vision-model-v1`, URL cố định trong manifest. Developer/CI dùng Python 3.11+ chạy `python3 deploy/scripts/fetch_vision_checkpoint.py`; script tải không cần token, kiểm tra kích thước và toàn vẹn nội bộ trước khi atomically đặt file vào staging, từ chối file đang có không vượt kiểm tra toàn vẹn nội bộ và dọn file tải dở khi lỗi. Không thay asset dưới tag cũ; checkpoint mới phải có release/model version mới. Workflow `.github/workflows/mvp-inputs.yml` kiểm tra transfer và tải cùng đầu vào public, chỉ có quyền đọc repository. Người dùng cuối kéo image đã chứa trọng số, không cần chạy script này.

Embedding chỉ tải ở giai đoạn chuẩn bị build với bundle release có version; chọn safetensors thay vì đóng gói đồng thời cả `.bin` và `.safetensors`. Runtime bật offline và chỉ đọc model bundle. Model/tokenizer configs phải được kiểm tra khi tạo bundle Phase 2; hiện **chưa tải/kiểm chứng bundle**. Không lưu giá trị mã kiểm tra vào repo/tài liệu; metadata cần kiểm tra được dùng tạm trong bộ nhớ, không in ra.

## Nguồn recipe và quyền dùng

Nguồn khởi đầu được chọn: văn bản recipe Wikibooks Cookbook. [Policy chính thức](https://en.wikibooks.org/wiki/Wikibooks:Copyrights) cho phép dùng lại văn bản theo CC BY-SA 4.0 với attribution và điều kiện tương ứng. Phase 2 phải lưu URL/revision, tác giả hoặc history link, license notice và ghi phần dịch/chỉnh sửa; nguồn có ghi chú license riêng phải được xét từng trang. Không tự lấy ảnh vì media có license riêng.

Ứng viên đầu tiên để khảo sát là [Phở bò](https://en.wikibooks.org/wiki/Cookbook:Ph%E1%BB%9F_B%C3%B2_%28Vietnamese_Beef_Noodle_Soup%29) và [Phở gà](https://en.wikibooks.org/wiki/Cookbook:Ph%E1%BB%9F_G%C3%A0_%28Vietnamese_Chicken_Noodle_Soup%29); chưa nhập/chuyển ngữ/review recipe nào trong Phase 0. Bản tiếng Việt cần ghi là bản dịch/adaptation và được review; không coi bài giới thiệu món ăn là recipe, không chế định lượng còn thiếu. Không khẳng định nguồn này phủ đủ 30 món. Coverage hiện 0/30; thiếu lớp nào phải bổ sung nguồn có phép hoặc recipe do nhóm biên soạn có license rõ ràng trước nghiệm thu corpus.

PTIT recipe dataset và notebook tìm web không là corpus được duyệt sẵn. Giữ nguyên quyết định không dùng kết quả LLM/web làm recipe mặc định. Nguồn/coverage còn thiếu không được che bằng fixture/demo recipe trong production.

Checkpoint do **Phạm Hoàng Minh** huấn luyện, người dùng xác nhận ngày 2026-10-19 và cho phép public trọng số, đóng gói vào image, lưu qua GitHub Releases. Ghi nhận quyền phân phối này làm căn cứ của dự án, không yêu cầu xác nhận lại. [Provenance/permission](../../deploy/artifacts/vision-model-v1.md) tách riêng quyền của checkpoint, license BSD-3-Clause của implementation torchvision và nguồn dataset. Không tự gán license BSD/MIT của code cho checkpoint hoặc toàn bộ ảnh; không phân phối dataset trong image. Notice torchvision được lưu và đính kèm release để các phase đóng gói giữ lại.

## Registry và giới hạn phát hành

Chọn Docker Hub làm registry, bốn image ứng dụng và image Qdrant chính thức. Người dùng đã xác nhận namespace `trantung2006`, visibility `public`; manifest ghi tên repository dự kiến. Quyền push và việc tồn tại đủ bốn repository chưa được kiểm tra, chưa có image release; chúng được kiểm tra khi chuẩn bị phát hành, không yêu cầu gửi mật khẩu/token qua chat.

Người dùng đã cho phép dựng CSS/JS từ HTML; frontend đã được tích hợp với API thật và merge qua PR #14. Web hỗ trợ trình duyệt điện thoại. App Expo dùng chung API, không build APK; PR #17 đang mở và chưa nghiệm thu thiết bị thật.

Các quyết định và đầu vào Phase 0 đã được merge; bằng chứng transfer được ghi trong [báo cáo Phase 0](../phases/phase-0.md). Corpus coverage/benchmark được nghiệm thu ở Phase 2. Quyền push registry và pull trên máy sạch vẫn thuộc Phase 6, chưa được xem là đã kiểm chứng.

## Quy tắc không công bố mã định danh

Theo yêu cầu người dùng, không ghi giá trị SHA/hash, mã revision/commit, checksum, digest, package integrity hoặc thông tin truy cập vào code, docs, manifests, lockfile, PR/release notes, asset và log do dự án quản lý. Chỉ dùng version/tag dễ đọc. Chạy scanner ở cổng cuối mọi phase; kiểm tra toàn vẹn khi tải chỉ xử lý metadata upstream tạm trong bộ nhớ, không lưu hoặc in giá trị.
