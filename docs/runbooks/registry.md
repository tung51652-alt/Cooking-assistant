# CookLens — chạy bản ứng viên từ Docker Hub

Gói này là bản ứng viên Phase 6 cho CPU/Linux amd64. Xem `candidate.json` để biết version image/model/taxonomy/corpus/embedding và `verification.json` để xem kết quả pull ẩn danh trên runner sạch. Bản chính thức `v2.0.0` chỉ được công bố sau nghiệm thu Phase 7; việc tải được image không thay thế kiểm chứng accuracy, công thức hoặc toàn bộ thiết bị mobile.

## Chạy lần đầu

1. Cài Docker Engine với Compose hoặc Docker Desktop chạy Linux containers, Compose 2.24.4 trở lên. Máy ARM chưa được kiểm chứng; bộ image hiện chỉ Linux amd64.
2. Tải gói `cooklens-2.0.0-rc.N.tar.gz` từ GitHub prerelease tương ứng, giải nén vào thư mục riêng và mở terminal tại đó. Đây là gói cấu hình, report và giấy phép; image được Docker tải từ bốn repository public `trantung2006/cooklens-*` cùng Qdrant chính thức. Không cần đăng nhập Docker Hub cho public pull.
3. Chạy:

```sh
docker compose -f compose.release.yaml up -d --pull always --wait --wait-timeout 240
```

Mở **http://localhost:8080/**, chọn ảnh món ăn → nhận Top-3 → chọn/xác nhận món → công thức → chi tiết. Health tại `http://localhost:8080/api/health`. Chỉ cần Docker để chạy; trọng số CV, embedding, tokenizer, corpus và vector bundle đã nằm trong image. Không tải model, seed thủ công hoặc cài Python/Java/Node trên máy runtime.

Lần đầu cần Internet để pull image. Mốc 240 giây chờ startup bắt đầu sau bước tải, không phải cam kết thời gian tải mạng. `recipe-init` kết thúc 0 là thành công; các service dài hạn cần healthy. Số đo CI trong report mô tả máy đã kiểm chứng, không phải cấu hình tối thiểu hoặc benchmark accuracy.

Nếu cổng 8080 bận, Linux/macOS dùng `HOST_PORT=8090` trước lệnh Compose; PowerShell dùng `$env:HOST_PORT = '8090'`, rồi mở `http://localhost:8090/`. Gateway mặc định chỉ mở trên chính máy chạy Docker. Điện thoại cần cấu hình LAN/HTTPS riêng; model luôn chạy trên server.

## Theo dõi và khởi động lại

```sh
docker compose -f compose.release.yaml ps -a
docker compose -f compose.release.yaml logs --tail=80 recipe-init recipes vision backend frontend
docker compose -f compose.release.yaml restart
docker compose -f compose.release.yaml down
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
```

Giữ project `cooklens` và volume cũ. `down` giữ named volume; `down -v` xóa index và lần sau phải seed lại, không dùng trong vận hành thường ngày. Sau khi image và index đã có, luồng ảnh/công thức chạy không cần Internet; dùng `--pull never`. Mở link nguồn công thức bên ngoài vẫn cần Internet. Không chạy nhiều init job cùng lúc.

| Hiện tượng | Cách xử lý |
| --- | --- |
| Pull bị giới hạn hoặc mạng lỗi | Kiểm tra kết nối/quota Docker Hub và thử lại; không đổi tag sang latest |
| Không đủ RAM/disk | Xem tài nguyên trong verification.json và Docker settings; không tăng số worker/model |
| Init thất bại hoặc readiness 503 | Xem logs và versions trong candidate.json; chờ model/index hoặc xử lý bundle không tương thích |
| Container running nhưng UI chưa dùng được | Kiểm tra health và dependency, chờ tới ready; không coi running là sẵn sàng |
| Image của bản cũ không tương thích volume | Dùng đúng gói phiên bản và quy trình init/rollback bên dưới; không xóa volume để né lỗi |

## Nâng cấp và rollback

Giữ gói cũ và image cũ. Với gói mới, dùng cùng project `cooklens`, pull đầy đủ bộ image trước, giữ Qdrant đang healthy rồi chạy đúng một init job:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml stop recipes backend
docker compose -f compose.release.yaml run --rm --no-deps recipe-init
docker compose -f compose.release.yaml up -d --pull never --wait --wait-timeout 240
```

Nếu init thất bại, dừng nâng cấp và kiểm tra version/bundle; không sửa dữ liệu dưới version đã có. Rollback bằng Compose và bộ image cũ, giữ project/volume, chạy lại init từ bản cũ rồi `up` như trên. Collection cũ được giữ để rollback. CI kiểm tra đổi corpus/alias và rollback trong volume riêng; chưa phải bằng chứng hai bản ứng dụng khác nhau đều đã được nghiệm thu.

Giấy phép/provenance nằm trong `notices/`; corpus có công thức AI biên soạn được ghi nhãn, chưa thử nấu độc lập. Không đưa ảnh gốc hoặc logs chưa rà soát vào issue. Không cần API key LLM cho luồng này.
