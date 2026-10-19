# Phase 2 — Corpus và retrieval

Trạng thái: phần kỹ thuật đã có bằng chứng chạy thật; **chưa đóng Phase 2** vì corpus thiếu 12 món và evaluation chưa review độc lập. Người dùng đã merge Phase 1, nhánh data/service cập nhật từ develop trước triển khai.

## Dữ liệu

21 công thức tiếng Việt, phủ 18/30 món. Có nguyên liệu, bước nấu, URL, liên kết phiên bản Wikibooks, lịch sử tác giả, CC BY-SA 4.0 và ghi chú chỉnh sửa. Không nhập ảnh. Xem [corpus README](../../data/recipes/README.md) và [manifest coverage](../../data/recipes/manifest.json).

Review hiện tại là đối chiếu cấu trúc/nguồn bởi agent, chưa nấu kiểm chứng hoặc được người dùng nghiệm thu ẩm thực. Không nhập trang chỉ giới thiệu món, thiếu bước thiết yếu hoặc dữ liệu placeholder; ghi các nguồn bị loại trong manifest. Các món thiếu trả rỗng thật, không sinh LLM hoặc dùng công thức của món khác.

## Service và artifact

- `ai/rag/api`: search, detail, dishes, liveness/readiness, typed input/error, request ID, JSON giới hạn 8 KiB và admission tối đa 4 request.
- `ai/rag/embeddings`: multilingual-e5-small CPU local, prefix query/passage, mean pooling, L2, chiều 384, tối đa 512 token. Không tải model hoặc gọi web lúc chạy.
- `ai/rag/ingestion`: validate bằng cùng validator data, precompute vectors trước build; seed CLI dùng cùng image API.
- `ai/rag/retrieval`: Qdrant filter món/ngôn ngữ/cuisine/versions trước exact cosine, tie-break ID. Collection theo version, payload indices, validate count/dimension/payload/vector trước chuyển alias nguyên tử. Seed lại không nhân bản, import lỗi không đổi active alias.
- Readiness từ chối alias/index không tương thích. Startup đối chiếu nội dung đã seed; model/tokenizer/corpus/vectors phải có trong image. Không thêm embedding inference vào health.
- [Embedding artifact v1](https://github.com/tung51652-alt/Cooking-assistant/releases/tag/embedding-model-v1): ZIP model/tokenizer và MIT notice; chỉ là artifact model, không phải release ứng dụng v2.0.0. CI tải artifact theo tag, kiểm tra transfer chỉ trong RAM. Stage từ model hub dành cho việc review bundle mới.

Chỉ chạy một init job mỗi lần; kiểm tra alias trước chuyển không phải distributed lock. Init từ chối overwrite version lỗi đã tồn tại; operator xử lý riêng collection chưa active hoặc xuất version mới. Không tự xóa version đang phục vụ/rollback. Qdrant dùng image upstream chính thức và user mặc định, API/init chạy user không phải root. Compose sản phẩm đầy đủ, rollback/volume và gateway/frontend còn thuộc các phase tiếp theo.

## Bằng chứng kiểm tra

- 6 bài kiểm tra data/taxonomy và 12 bài kiểm tra artifact/policy; validator input manifest vẫn qua.
- 10 runtime tests với model/Qdrant thật, bao gồm biến thể, metadata filter, tie-break, idempotence, lỗi import, alias sai, validation, deadline dependency, lỗi an toàn và quá tải. Fault injection kiểm tra lỗi riêng, không dùng kết quả giả để tính chất lượng retrieval.
- [Docker offline evidence](evidence/phase-2-recipes-container.json): image CPU 4 thread/2 GiB, non-root/read-only, Qdrant trên mạng internal chặn Internet; seed hai lần, API thật, 100 search; p95 khoảng 96.8 ms, memory peak khoảng 864.2 MiB. Đây là benchmark cục bộ, không bảo đảm trên mọi máy.
- Compose riêng Phase 2 chạy từ volume mới và seed lại thành công; health/Swagger trả 200. Không expose Qdrant ra host. Mạng browser riêng để mở Swagger local; kiểm thử chặn Internet dùng harness internal riêng như evidence.
- [Draft evaluation](evidence/phase-2-retrieval-draft.json): 150 query cố định; 90 positive trên 18 món có recipe, 60 empty của 12 món thiếu. Hit@1/Hit@3/MRR hiện bằng 1 trên 90 positive, không lẫn món. **Không coi đây là đạt quality gate:** đa số món chỉ có một ứng viên, query/ground truth do agent soạn và chưa review độc lập. 60 empty không được tính thành hit.

## Cổng còn mở

- [ ] Tối thiểu một công thức hợp lệ/review cho đủ 30 món; hiện 18/30. Lệnh `python3 data/recipes/validate.py --require-full-coverage` cố ý chưa qua.
- [ ] Review độc lập query/relevance và tăng trường hợp có biến thể; đo lại retrieval trên coverage hoàn chỉnh, không dùng số 1.0 của tập nhỏ để nghiệm thu.
- [ ] Người dùng merge PR data trước PR service; agent fetch xác nhận develop trước phần phụ thuộc tiếp theo.

## Rà soát kết thúc

Giữ tests/evaluation và hai evidence có mục đích rõ; không commit checkpoint, model embedding, vector bundle build, raw HTML crawl, ZIP download, log, cache hoặc output thử dư thừa. Image chỉ COPY các module runtime/validator, sáu file model, bốn JSON bundle và notices; không có tests, evaluation, notebook, frontend, docs hoặc file môi trường trong `/app`.

Đã chạy kiểm tra nội dung public trên file tracked và PR notes: không có literal secret/hash/checksum/digest/định danh revision dạng hash; không xuất giá trị phát hiện. Download kiểm tra toàn vẹn trong RAM, không ghi lại metadata đó. Các liên kết revision Wikibooks dùng số phiên bản bài viết để ghi công. Git/registry tự quản lý định danh nội bộ của nền tảng; không sao chép chúng vào project.

Chưa chuyển Phase 3 hoặc phát hành ứng dụng v2.0.0. Thứ tự PR là dữ liệu rồi service phụ thuộc; người dùng tự merge.
