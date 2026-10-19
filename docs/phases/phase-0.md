# Phase 0 — Contract và audit đầu vào

Ngày: 2026-10-19. Nhánh: `feature/mvp-contracts`, base `origin/develop` sau khi người dùng merge PR #5. Trạng thái: **đã triển khai phần contract/audit; chưa đạt đầy đủ điều kiện ra phase**. Không có service runtime hoặc Docker image phát hành trong PR này.

## Kết quả có thể review

| Phần | Kết quả và bằng chứng |
| --- | --- |
| Public/internal API | [Contract v1](../contracts/mvp-v1.md): endpoint, DTO, versions, MIME/byte/pixel limits, confirmation, filters, ranking, health, errors và deadlines |
| UI | Ba HTML tham chiếu được lưu cùng checksum trong [frontend-reference](../frontend-reference/README.md); xác nhận chưa chatbot, không thiết kế lại khung |
| Checkpoint | Load format thật với `weights_only=True`, classes/shape khớp nhánh CV; SHA-256, 31.434.209 bytes và transform nằm trong [manifest](../../deploy/artifacts/manifest.json) |
| Embedding | Chọn multilingual-e5-small revision cố định, 384d, MIT theo model card; upstream LFS weight hash được ghi lại, chưa tải/benchmark weights |
| Recipe source | Chọn Wikibooks text với policy attribution/share-alike theo từng revision; 0 recipe nhập, coverage hiện 0/30, chưa khẳng định đủ lớp |
| Gates | [Quyết định runtime](../decisions/mvp-runtime.md) chốt các gate trước nghiệm thu; CPU/memory host được ghi, chưa benchmark stack |
| Hygiene | `.gitignore`, `.dockerignore` và `deploy/env/.env.example`; checkpoint/venv/cache vẫn ở máy, không nằm trong thay đổi Git/image context mặc định |
| Kiểm tra lặp lại | `python3 deploy/scripts/verify_mvp_inputs.py --checkpoint efficientnet_b2_best.pt` kiểm tra invariants/fingerprint, không truy cập mạng và không cần torch |

## Các mục còn mở và phạm vi ảnh hưởng

| Mục | Thông tin đã có | Cần bổ sung để đóng | Chặn phần nào |
| --- | --- | --- | --- |
| Style baseline | Có HTML, thiếu CSS/JS được tham chiếu | Đường dẫn bộ CSS/JS/assets gốc, hoặc quyết định có ghi nhận để dựng bổ sung và review style | Hoàn tất audit style Phase 0 và nghiệm thu UI Phase 4 |
| Artifact CI | Checkpoint local có checksum xác định | Kho artifact có quyền truy cập, URI/version cố định và cơ chế CI lấy bằng secret ngoài image; không ghi token/signed URL vào Git | Build CV tái lập từ CI/máy khác |
| Checkpoint redistribution | Repo upstream có MIT cho software; chưa có bằng chứng rõ cho ảnh/checkpoint nhóm cung cấp | Bằng chứng provenance và quyền sử dụng/phân phối liên quan checkpoint | Phát hành image chứa checkpoint; không tự public hoặc private thay cho việc xác minh |
| Docker Hub | Chọn registry/provider, platform `linux/amd64` | Namespace, public/private và quyền push | Image naming/login/publish Phase 6; không đoán từ tên GitHub |
| Corpus coverage | Policy nguồn chọn được; chưa nhập/review recipe | Phase 2 kiểm kê từng lớp, thêm nguồn có phép hoặc tác giả nhóm cho món thiếu; tối thiểu một recipe/món | Nghiệm thu 30 món và release, không chặn review contract |

Các giá trị còn thiếu để `null`/pending có nghĩa rõ trong manifest; verifier không chuyển chúng thành “đạt release”. Merge PR này có thể lưu kết quả hợp lệ đang có, nhưng không đánh dấu Phase 0 đã xong hoặc tự nhảy sang phase phụ thuộc khi prerequisite còn mở. Người dùng merge và cung cấp/quyết định phần thiếu, agent cập nhật báo cáo rồi xác nhận `origin/develop` trước tiếp tục.

## Rà soát cuối phase / PR

- [ ] Các điều kiện ra Phase 0 trong kế hoạch đã đạt đầy đủ (còn mục mở ở bảng trên).
- [x] Đối chiếu file/diff, test/fixture tạm và trạng thái untracked; chỉ stage file thuộc Phase 0, giữ local artifacts của người dùng. `CHANGELOG.md` có sẵn vẫn ngoài PR.
- [x] Kiểm tra manifest/reference bytes thật, checkpoint thiếu/sai size/sai checksum, preset torchvision sau chuẩn hóa scalar crop thành H/W, 47 Markdown relative links/fences và `git diff --check`.
- [x] Rà credential/private key/password hash bằng 8 nhóm pattern trên các file Phase 0 và commit PR, không có phát hiện; không in giá trị khớp. Hash artifact/revision/reference có mục đích được giữ. Đây không phải audit mọi nhánh/lịch sử upstream và không thay thế scanner chuyên dụng.
- [x] Rà ignore/build context bằng static review và `git check-ignore`; chưa build image nên chưa có layer/history/runtime bundle để kiểm tra ở phase này. Test negative dùng thư mục tạm tự dọn, verifier giữ lại vì dùng được cho kiểm tra artifact lần sau.
- [ ] Tạo PR; người dùng review/merge, agent không auto-merge.

Kết quả chạy thực tế và giới hạn kiểm tra được ghi trong body PR. Không đánh dấu những mục phụ thuộc dữ liệu người dùng như thể chúng đã được công cụ tự xác minh.
