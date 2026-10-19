# Phase 2 — Corpus và retrieval

Trạng thái: **triển khai và kiểm thử kỹ thuật đã hoàn tất, người dùng đã merge PR dữ liệu #10 rồi PR service #11; agent đã fetch xác nhận local develop đồng bộ origin/develop**. Corpus đã phủ 30/30 món; chưa chuyển Phase 3. Review bên ngoài và nấu kiểm chứng công thức tiếp tục được ghi là chưa thực hiện, thuộc nghiệm thu Phase 7.

## Dữ liệu và quyền biên soạn

33 công thức tiếng Việt: 21 bản Wikibooks giữ attribution, link phiên bản và CC BY-SA 4.0; 12 bản AI tự biên soạn theo quyền chủ dự án cấp ngày 2026-10-19, nguồn hiển thị rõ AI và CC BY 4.0. Xem [README corpus](../../data/recipes/README.md), [record tác giả](../../data/recipes/AUTHORSHIP.md) và [manifest](../../data/recipes/manifest.json). Bộ sưu tập giữ CC BY-SA 4.0, từng record giữ license của mình.

Không gán website hoặc tác giả giả cho công thức mới. Các định lượng/mốc thao tác là gợi ý chưa nấu kiểm chứng, tổng thời gian chưa đo để null. Nem chua dùng biến thể rán từ nem thành phẩm có nguồn gốc rõ, thể hiện trong tên/nguồn/hướng dẫn; không tự đưa quy trình lên men thịt sống vào ứng dụng. Các trang nguồn bị loại trước đây vẫn được ghi là bị loại, không chuyển thành nguồn của văn bản AI.

Corpus version mới là `cooklens-recipes-v1`, thay cho corpus thử 21 recipe `wikibooks-vi-v1`. CI data bắt buộc `--require-full-coverage`. Validator dùng chung kiểm tra schema, Unicode, taxonomy, số hữu hạn, steps, duplicate, URL, nguồn AI, license và manifest. Phở/bánh canh/bánh bột lọc mỗi món có hai recipe; các món khác có một, API trả số thật.

## Runtime và index

Service FastAPI cung cấp search/detail/catalog/health, request ID, JSON tối đa 8 KiB, bốn request AI đồng thời và readiness có deadline tổng hai giây. Model E5 load local một lần, dùng prefix query/passage, mean pooling, L2, chiều 384, tối đa 512 token; không LLM/chatbot hoặc tải thêm model lúc chạy.

Vectors được dựng lại trước build image cho toàn bộ 33 recipe. Qdrant lọc món/ngôn ngữ/cuisine/versions trước cosine, tie-break ID; có payload indices. Init dùng cùng image API, kiểm tra count/dimension/payload/vector trước chuyển alias active nguyên tử; chạy lại không nhân bản. Index cũ giữ riêng cho rollback, không bị ghi đè khi version mới vào active. Readiness kiểm tra alias/config/count; startup đối chiếu nội dung nếu Qdrant đã có dữ liệu.

Chỉ chạy một init job mỗi lần; kiểm tra alias trước chuyển không phải distributed lock. Version lỗi có sẵn bị từ chối overwrite; operator cần xử lý riêng collection chưa active hoặc xuất version mới. API/init chạy non-root, filesystem chỉ đọc; Qdrant upstream giữ user mặc định và volume ghi riêng. Compose Phase 2 không expose Qdrant ra host; Swagger ở localhost:8001/docs. Compose toàn sản phẩm thuộc Phase 5.

Model artifact [embedding-model-v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/embedding-model-v1) chứa sáu file model/tokenizer và MIT notice, được kiểm tra transfer trong RAM. Đây là artifact model; application release vẫn theo kế hoạch v2.0.0. Image chứa model, corpus/vectors và notices, bao gồm quyền/phạm vi AI-authored để có thể đọc offline.

## Bằng chứng kiểm tra

- Full-coverage validator và 7 data/taxonomy tests đã qua, có test từ chối nguồn AI bị gán nhầm Wikibooks.
- 12 transfer/policy tests đã qua; input manifest Phase 0 vẫn hợp lệ.
- 15 tests runtime/evaluation đã qua: model/Qdrant thật cho search/detail đủ 30 món, biến thể, filter/tie-break, seed lặp lại, lỗi import giữ alias, readiness/deadline, quá tải và input/error. Test giả lập lỗi và future-empty chỉ kiểm tra contract, không đưa vào metric retrieval.
- [Docker evidence](evidence/phase-2-recipes-container.json): seed hai lần, 30 catalog search và detail, 100 search đo latency, mạng internal chặn Internet, CPU 4 thread/2 GiB, user non-root/read-only. Phép đo này p95 khoảng 110 ms, cgroup peak khoảng 623 MiB trên cache image/model đã ấm; không đại diện cho mọi máy hoặc mức RAM cold-cache. Giữ budget 2 GiB, không giảm theo một lần đo.
- Compose local đã khởi động với corpus version mới, active index có 33 point; old collection vẫn được giữ. Swagger và readiness trả 200, nguồn AI xuất hiện trong API.
- [Retrieval evidence](evidence/phase-2-retrieval.json): 204 positive cho 30 món, Hit@1/Hit@3/MRR = 1, không lẫn món. 18 contrastive holdout báo riêng cũng Hit@1 = 1. Cổng kỹ thuật ít nhất 150 query/30 món, Hit@1 ≥ 0.90, Hit@3 ≥ 0.95 được bật bắt buộc trong CI.

Query/relevance được rà ngữ nghĩa trong lượt riêng, giữ nguyên model/prefix/template, trước khi đo corpus mới. Cùng agent thực hiện; không tuyên bố có reviewer thứ hai. `technical_gate_met: true` và `external_review_complete: false` tách biệt. 27 món có một ứng viên nên metric tổng thể không chứng minh chất lượng xếp hạng trên corpus lớn hoặc chất lượng ẩm thực; xem [review record](../../ai/rag/evaluation/REVIEW.md). Phase 7 phải bổ sung review bên ngoài, ảnh/query thực tế và thử nấu trước phát hành sản phẩm.

## Rà soát và merge

Đã rà file thừa, recipes/query trùng, tests/fixtures tạm, secrets và literal hash/checksum/digest/định danh revision dạng hash trong nội dung public. Giữ test/query hồi quy và hai evidence hiện hành; bỏ report draft 18/30 đã lỗi thời. Không commit model, vector bundle build, raw HTML, ZIP tải, log hay script tạo tạm. Image không COPY tests/evaluation/notebook/frontend hoặc file môi trường vào `/app`; license/authorship được đặt riêng trong notices.

- [x] Đủ 30 món, ghi nguồn hợp lệ/AI và giới hạn biên soạn.
- [x] Precompute/index/runtime/Compose offline và các test kỹ thuật.
- [x] Cổng retrieval kỹ thuật, phân biệt với review bên ngoài.
- [x] Rà file thừa, tests tạm, secrets và mọi literal hash bị cấm.
- [x] Người dùng đã merge #10 trước #11; agent fetch xác nhận local develop đồng bộ origin/develop. Review độc lập và nấu kiểm chứng vẫn chưa thực hiện.

Không tự merge PR hoặc coi các công thức đã được nấu kiểm chứng.

## Kiểm tra develop sau merge

Ngày 2026-10-19, local develop được fast-forward tới origin/develop, không có commit riêng hoặc xung đột; giữ nguyên CHANGELOG.md chưa được track của người dùng. CI push cho corpus, artifacts và recipes đã qua. Workflow Vision thất bại ở bước metadata release vì GitHub trả HTTP 403 rate limit cho request ẩn danh. Bản sửa dùng token tự cấp của Actions với quyền contents: read chỉ cho metadata API; không ghi token vào source, không chuyển token sang tải asset hoặc image. Máy local không có token vẫn dùng release public.

Tài liệu và checklist merge được cập nhật theo trạng thái thực tế. Môi trường Python hệ thống thiếu thư viện CV; venv local thiếu test transport tương thích. Đây là hạn chế môi trường test local, không phải kết quả test runtime thất bại; kiểm tra CV cần bộ dependency đã pin riêng. Không thay đổi venv của người dùng.

Kiểm tra lại sau merge: 7 tests data/taxonomy, 13 tests transfer/policy (gồm hồi quy xác thực metadata tùy chọn và không gửi token sang asset), 16 tests CV với checkpoint thật và 204 query retrieval đều qua. CV dùng FOOD_MODEL_PATH trỏ checkpoint có sẵn ở root vì staging mặc định chưa có file, cùng dependency test đã pin cài trong thư mục tạm riêng. Metadata cả hai artifact đã được kiểm tra bằng request xác thực, chỉ giữ giá trị kiểm chứng trong RAM. Scanner và diff whitespace qua.
