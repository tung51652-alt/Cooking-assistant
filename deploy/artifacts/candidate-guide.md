# Chạy candidate local

Tài liệu được đóng vào gói candidate local. Gói có cấu hình và notices,
không chứa image/model binary hoặc xác nhận image đã có trên registry.
`candidate.json` ghi version và tên image cần có trên máy.

## Chuẩn bị

Cần Docker Linux containers và Compose ≥2.24.4. Build image từ source hoặc nhận
bộ image bằng `docker save`/`docker load`; giữ đúng tên/tag trong metadata.
Recipes và recipe-init dùng chung image. Không pull image local chưa công bố.

## Chạy và theo dõi

Từ thư mục có `compose.yaml`:

```sh
docker compose -f compose.yaml up -d --pull never --wait --wait-timeout 240
docker compose -f compose.yaml ps -a
docker compose -f compose.yaml logs --tail=80 recipe-init recipes vision backend frontend
```

Mở **http://127.0.0.1:8080/**; readiness tại **http://127.0.0.1:8080/api/health**.
Đổi cổng bằng `HOST_PORT`. Init kết thúc 0 là thành công; service dài hạn cần healthy.
Không cần model/Python/Java/Node trên host; điện thoại cần gateway LAN/HTTPS riêng.

## Dữ liệu và rollback

`docker compose -f compose.yaml down` giữ volume; không thêm `-v`
nếu muốn giữ index. Dùng cùng project, không chạy nhiều init job đồng thời.
Giữ image/gói cũ; với Qdrant healthy, dừng recipes/backend, chạy một
`run --rm --no-deps recipe-init` từ bộ mới rồi `up` lại toàn stack.
Rollback bằng bộ cũ và cùng volume, chạy lại init cũ; không xóa volume để né lỗi.

`verification.json`, nếu có, ghi số đo thực tế. Candidate local không tự chứng minh
pull máy sạch, accuracy hoặc nghiệm thu đủ mobile. Không đăng credential/ảnh gốc/log thô.
