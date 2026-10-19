# Quyết định runtime và đầu vào — Phase 0

Ngày audit: 2026-10-19. Đây là cấu hình/contract cho lần giao Top-3 + recipe, chưa là kết quả benchmark hoặc bằng chứng release.

## Stack và embedding

- React + TypeScript + Vite build static, Nginx phục vụ và proxy `/api`; giữ HTML nguồn theo [audit frontend](../frontend-reference/README.md).
- Spring Boot/Java 21 là public backend; vision FastAPI/PyTorch; recipes FastAPI + model local; Qdrant và một job init. Chưa cần PostgreSQL, LangGraph, LLM hay API key người dùng.
- Baseline embedding: `intfloat/multilingual-e5-small`, revision và weight checksum ở [artifact manifest](../../deploy/artifacts/manifest.json). Model card công bố MIT, embedding 384 chiều. Dùng masked mean pooling, L2 normalize, cosine; prefix `query: ` và `passage: ` cho cả tiếng Việt, tối đa 512 tokens.
- Passage text v1 theo thứ tự: `title`, tên món, tên nguyên liệu, steps; ghép plain text có nhãn trường. Phần đầu chứa title/món; tokenizer truncate 512 tokens và đo tỷ lệ truncate trong báo cáo. Full recipe vẫn lưu đủ trong payload; nếu chất lượng chưa đạt mới đánh giá chunking với version mới.
- Chọn model làm baseline không đồng nghĩa đã chứng minh retrieval tốt trên corpus dự án. Phase 2 phải đạt gate; thay model/revision/pooling/text template cần version embedding mới, rebuild index và nghiệm thu lại, không đổi im lặng.
- Query không có threshold cắt similarity ở v1, không reranker, không LLM fallback. Filter cứng món/ngôn ngữ/cuisine; top 1–3 thật, không tạo đủ số lượng bằng bản trùng.
- Prefix/pooling theo [model card chính thức](https://huggingface.co/intfloat/multilingual-e5-small); revision được lấy từ Hugging Face API ngày audit, không dùng `main` khi build.

## Tiêu chí nghiệm thu đã chọn cho bản v1

Giữ các gate của kế hoạch: CV Top-3 ≥95% trên clean test split 5.004 ảnh; đủ mapping 30 lớp; tối thiểu một recipe được review mỗi món hỗ trợ; retrieval ít nhất 150 query (5/món), Hit@1 ≥0.90, Hit@3 ≥0.95, báo MRR và không lẫn món xác nhận. Không dùng cùng query set để tối ưu cấu hình rồi báo như test độc lập.

P95 warm inference ≤10 giây, search ≤3 giây ở concurrency 1, ít nhất 100 lần/API; cold boot/seed đo riêng. CPU baseline mục tiêu: 4 logical cores/8 GiB RAM; chưa tuyên bố đã chạy stack đầy đủ với mức này.

Máy audit thực: Intel Core i5-10300H @2.50GHz, 8 logical CPUs, tổng RAM 7.59 GiB theo `/proc/meminfo`; Linux x86_64, Docker 29.8.1, Compose v5.5.1. Khi benchmark phải ghi RAM cấp Docker và tải nền, giới hạn CPU tương ứng; không coi tổng RAM máy là RAM stack được phép dùng. Test release `linux/amd64` trước, chưa hứa `arm64` hay GPU.

## Checkpoint và artifact supply

Đã load file checkpoint local bằng `torch.load(..., map_location="cpu", weights_only=True)`, đối chiếu architecture, classes, image size và shape classifier; đây là kiểm tra format, không phải chạy lại benchmark accuracy. Hash/metadata chính xác nằm trong manifest; binary không vào Git.

Build staging chuẩn: `deploy/artifacts/staging/vision/efficientnet_b2_best.pt`. Runtime path `/opt/cooklens/models/efficientnet_b2_best.pt`. Người build lấy bản đã được nhóm cho quyền truy cập, kiểm tra bằng `python3 deploy/scripts/verify_mvp_inputs.py --checkpoint <path>` rồi đưa vào staging. CI phải dùng cùng checksum từ kho artifact đã chốt; manifest hiện ghi `ci_source_uri: null` vì chưa có kho chuyển giao được xác nhận, không giả định file laptop là nguồn CI.

Embedding chỉ tải ở giai đoạn chuẩn bị build với revision cố định; chọn safetensors thay vì đóng gói đồng thời cả `.bin` và `.safetensors`. Runtime bật offline và chỉ đọc model bundle. Model/tokenizer configs cũng phải được fingerprint khi tạo bundle Phase 2; checksum weight hiện lấy từ metadata LFS upstream, **chưa là kiểm tra bytes tải về**.

## Nguồn recipe và quyền dùng

Nguồn khởi đầu được chọn: văn bản recipe Wikibooks Cookbook. [Policy chính thức](https://en.wikibooks.org/wiki/Wikibooks:Copyrights) cho phép dùng lại văn bản theo CC BY-SA 4.0 với attribution và điều kiện tương ứng. Phase 2 phải lưu URL/revision, tác giả hoặc history link, license notice và ghi phần dịch/chỉnh sửa; nguồn có ghi chú license riêng phải được xét từng trang. Không tự lấy ảnh vì media có license riêng.

Ứng viên đầu tiên để khảo sát là [Phở bò](https://en.wikibooks.org/wiki/Cookbook:Ph%E1%BB%9F_B%C3%B2_%28Vietnamese_Beef_Noodle_Soup%29) và [Phở gà](https://en.wikibooks.org/wiki/Cookbook:Ph%E1%BB%9F_G%C3%A0_%28Vietnamese_Chicken_Noodle_Soup%29); chưa nhập/chuyển ngữ/review recipe nào trong Phase 0. Bản tiếng Việt cần ghi là bản dịch/adaptation và được review; không coi bài giới thiệu món ăn là recipe, không chế định lượng còn thiếu. Không khẳng định nguồn này phủ đủ 30 món. Coverage hiện 0/30; thiếu lớp nào phải bổ sung nguồn có phép hoặc recipe do nhóm biên soạn có license rõ ràng trước nghiệm thu corpus.

PTIT recipe dataset và notebook tìm web không là corpus được duyệt sẵn. Giữ nguyên quyết định không dùng kết quả LLM/web làm recipe mặc định. Nguồn/coverage còn thiếu không được che bằng fixture/demo recipe trong production.

Checkpoint: [repo 30VNFoods](https://github.com/ds4v/30VNFoods) ghi MIT cho phần software. Điều này chưa chứng minh quyền của toàn bộ ảnh nguồn hoặc của checkpoint do nhóm cung cấp. Manifest nhánh data trước đó còn ghi license dataset cần xác minh; Kaggle data card không đọc được bằng lần kiểm tra này. Vì thế `redistribution_status` vẫn pending; cần bằng chứng nguồn/permission/checkpoint license từ nhóm, không tự kết luận đã được phép phát hành public hay private.

## Registry và giới hạn phát hành

Chọn Docker Hub làm registry, bốn image ứng dụng và image Qdrant chính thức. Người dùng đã xác nhận namespace `trantung2006`, visibility `public`; manifest ghi tên repository dự kiến. Quyền push và việc tồn tại đủ bốn repository chưa được kiểm tra, chưa có digest release; chúng được kiểm tra khi chuẩn bị phát hành, không yêu cầu gửi mật khẩu/token qua chat.

Người dùng cũng đã cho phép dựng CSS/JS từ khung HTML khi thiếu tài nguyên gốc. Được làm sớm khung frontend độc lập để review bằng PR riêng; không tự coi là nghiệm thu Phase 4 hoặc đã nối backend/CV/recipe thật. Đây là điều chỉnh phạm vi công việc theo yêu cầu mới, không tự vượt cổng merge cho các phase tích hợp phụ thuộc.

Phase 0 cho phép review/merge phần contract/audit độc lập, nhưng **chưa đạt đầy đủ điều kiện ra phase** khi các mục ở [báo cáo Phase 0](../phases/phase-0.md) còn mở. Không khởi động Phase 1 phụ thuộc như thể toàn bộ prerequisite đã hoàn tất; merge PR tài liệu không thay thế xác nhận artifact/license/registry còn thiếu.
