# Phát triển

Các lệnh chạy từ root repository trên Linux/macOS.
Quy ước thực hiện và xác minh theo [WORKFLOW.md](WORKFLOW.md).

## Môi trường

| Công việc | Công cụ |
| --- | --- |
| Chuẩn bị artifact AI | Python 3.12 và venv |
| Build/chạy toàn bộ | Docker Linux containers, Compose ≥2.24.4 |
| Web | Node ≥22.12, npm |
| Backend ngoài Docker | JDK 21, Maven; xem [backend README](../backend/README.md) |
| Mobile | Expo Go, Node theo [mobile README](../mobile/README.md) |

## Chuẩn bị artifact

Build từ source dùng checkpoint 32 lớp epoch 5. Lấy file weights qua kênh nội bộ của nhóm.

Tạo venv riêng, rồi chuẩn bị artifacts từ root repo.

```sh
python3.12 -m venv .venv-build
. .venv-build/bin/activate
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
python -m pip install -r ai/rag/requirements.txt
mkdir -p deploy/artifacts/staging/vision
cp "/path/to/team/efficientnet_b2_epoch5.pt" deploy/artifacts/staging/vision/efficientnet_b2_epoch5.pt
python deploy/scripts/fetch_embedding_model.py
python deploy/scripts/verify_mvp_inputs.py --checkpoint deploy/artifacts/staging/vision/efficientnet_b2_epoch5.pt
python -m ai.rag.ingestion.bundle --model deploy/artifacts/staging/embedding --output deploy/artifacts/staging/recipes
```

Downloader kiểm tra artifact có version, đặt vào staging bị Git ignore và dừng nếu
file đang có không phù hợp. Xem [quy ước artifact](../deploy/artifacts/README.md).

## Docker từng thành phần

Toàn dự án dùng một `compose.yaml` ở root. `docker compose up` chạy image đã đóng gói;
chỉ build source khi cần. Sau khi chuẩn bị artifact ở trên, từ root chạy:

```sh
docker build -f ai/cv/Dockerfile -t cooklens-vision:local .
python deploy/scripts/smoke_vision_container.py --image cooklens-vision:local
docker build -f ai/rag/Dockerfile -t cooklens-recipes:local .
docker build -f backend/Dockerfile -t cooklens-backend:local .
docker build -f frontend/Dockerfile -t cooklens-frontend:local .
COOKLENS_IMAGE_PREFIX=cooklens COOKLENS_IMAGE_TAG=local docker compose up
```

Kiểm tra `/api/health` sau khi khởi động. `dependencies.vision.model_version` phải là `efficientnet-b2-32class-epoch5`. Image vision cục bộ chứa weights nội bộ của nhóm.

Vẫn dùng project `cooklens`, không có Compose hoặc project phát triển riêng.
Khi build lại cùng tag, thêm `--force-recreate` vào lệnh `up` để thay container.
Dùng cùng biến image khi chạy `up`/`down`; `down` giữ volume công thức.

## Phát triển từng thành phần

- Web: `npm --prefix frontend ci`, sau đó `npm --prefix frontend run dev`.
  Vite proxy `/api` tới backend; cấu hình qua `frontend/.env.example`.
- Backend: chạy hai AI service đúng version trước, rồi dùng lệnh trong [backend README](../backend/README.md).
- Sau khi sửa DTO/controller, với stack đang chạy: `sh deploy/scripts/generate_frontend_contract.sh`.
- Mobile: xem [Expo Go và LAN](../mobile/README.md). Điện thoại cần gateway truy cập được;
  release mặc định chỉ bind loopback.
- Cấu trúc mã: `ai/` cho AI; `data/` cho taxonomy/corpus; `backend/` cho gateway;
  `frontend/`, `mobile/`, `packages/` cho client; `deploy/` cho build/vận hành.

## Trước khi gửi PR

1. Lập kế hoạch trong [plan/](plan/README.md) khi công việc có nhiều bước.
2. Chạy [kiểm thử](testing.md) phù hợp và `python3 deploy/scripts/check_public_metadata.py`.
3. Rà diff, file thừa và tài liệu bị ảnh hưởng; không commit dataset, weights, secret,
   log, cache hoặc build output. Giữ notices và provenance cần thiết.
4. Giữ credential và hash bị cấm ngoài Git. Giữ giá trị npm integrity do npm sinh tại trường `packages.*.integrity` hợp lệ trong `mobile/package-lock.json`.
5. Gửi PR kèm kết quả kiểm tra; người dùng review/merge theo phạm vi đã giao.
