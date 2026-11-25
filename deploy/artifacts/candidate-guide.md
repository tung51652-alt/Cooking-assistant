# Chạy ứng viên CookLens

Gói chứa cấu hình Compose, metadata và notices. `candidate.json` ghi tag và các image đã chọn.
Gói phát hành ghi kết quả nghiệm thu và dùng các image Docker Hub đã kiểm tra pull ẩn danh.

## Chuẩn bị

Cần Docker Linux/amd64 containers và Compose ≥2.24.4 trên máy chạy stack.
Với gói công khai, chạy `docker compose pull` trong thư mục giải nén.
Với ứng viên local, nạp bộ image tương ứng trước khi chạy. Recipes và recipe-init dùng chung image.

## Chạy và theo dõi

Từ thư mục có `compose.yaml`:

```sh
docker compose up -d --pull never --wait --wait-timeout 240
docker compose ps -a
```

Mở **http://127.0.0.1:8080/**; readiness tại **http://127.0.0.1:8080/api/health**.
Đổi cổng bằng `HOST_PORT`. Init kết thúc 0 là thành công; service dài hạn cần healthy.
Để dùng Expo Go Android SDK 58, trỏ Metro tới `EXPO_PUBLIC_API_BASE_URL` của cùng gateway (URL kết thúc bằng `/api`).
Kiểm tra `/api/health` từ trình duyệt điện thoại. Dùng HTTPS của nhóm chuyển đến gateway, hoặc đặt `HOST_BIND` thành IP máy Docker trong LAN riêng.
Mặc định gateway bind loopback. Chỉ cổng frontend được publish.

## Hỏi đáp và cấu hình runtime

Trên máy Docker, dùng `.env` riêng hoặc biến môi trường runtime.
Mặc định Google AI Studio: `LLM_PROVIDER=openai`, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, model `gemini-3.1-flash-lite`.
Với ứng viên NVIDIA, đặt endpoint `https://integrate.api.nvidia.com/v1`; luôn dùng provider/model selector đã nghiệm thu.
Khi dùng gói có phần `phase13_acceptance`, đối chiếu `assistant.provider` và `assistant.model_selector` trong `candidate.json`.
Cấp `LLM_API_KEY` riêng cho backend. Khi thay đổi biến môi trường, chạy `docker compose up -d --force-recreate backend`.
Ảnh, công thức và điều khiển bước dùng được khi chưa có key hoặc provider gặp lỗi. Chỉ tính năng hỏi đáp cần Internet.
Giữ ảnh gốc, key, transcript, session ID và output cấu hình chi tiết ngoài báo cáo công khai.

## Dữ liệu và rollback

`docker compose down` giữ `recipe-index` và `assistant-sessions`. Giữ project `cooklens` nhất quán và chạy mỗi lần một `recipe-init`.
Phiên có thời hạn 24 giờ. Dữ liệu phiên và hội thoại nằm tại `/app/data/assistant.sqlite` trên volume `assistant-sessions`.
Để sao lưu, dừng backend và xuất toàn bộ volume bằng công cụ quản trị volume; sau đó khởi động lại backend.
Khôi phục toàn bộ bản sao vào volume thử trước, giữ UID/GID 10001 và kiểm tra GET trả đúng bước, hội thoại và version.
Giữ một bản sao trước khi nâng schema. Dùng bộ image và index tương thích, chạy `recipe-init` của bộ rollback nếu cần.
SQLite schema 3 cần image tương thích hoặc backup cũ đi cùng bộ rollback; giữ nguyên volume schema mới để quay lại phiên bản mới.

`verification.json` ghi smoke và các số đo runtime. Kết quả nghiệm thu CV, retrieval, live assistant và Android nằm trong `candidate.json` của gói đã qua Phase 13.
