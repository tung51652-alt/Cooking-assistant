# Tài liệu CookLens

Nguồn tham chiếu chung cho quyết định kỹ thuật, dữ liệu, thí nghiệm và kết quả đánh giá. Phase 0–5 đã có trên `origin/develop`; Phase 6–7 chưa hoàn tất. Expo được tích hợp qua PR #17 theo yêu cầu merge trực tiếp của người dùng; upload ảnh trên điện thoại thật đã được xác nhận ngày 2026-10-26, nghiệm thu đầy đủ Android/iOS còn mở.

- [Kế hoạch MVP Top-3 món, công thức và Docker](plans/top3-recipes-docker-mvp.md): trạng thái từng phase, kiến trúc service, checklist file/test/secrets và phát hành.
- [Trạng thái Phase 0](phases/phase-0.md): kết quả audit thật, phần đã làm và đầu vào còn thiếu.
- [Backend và Phase 3](phases/phase-3.md): public gateway, Swagger, kiểm thử HTTP/AI thật và hợp đồng frontend sinh từ OpenAPI.
- [Frontend và Phase 4](phases/phase-4.md): nguồn Stitch đúng, giao diện Docker và kiểm thử desktop/mobile với AI thật.
- [Docker và Phase 5](phases/phase-5.md): Compose độc lập, candidate có version, lifecycle và kiểm tra offline.
- [Runbook Docker](runbooks/docker.md): build/chạy, dev/debug, volume, nâng/rollback và giới hạn phát hành.
- [Contract MVP v1](contracts/mvp-v1.md): API public/nội bộ, errors, timeout, upload và quy tắc xếp hạng.
- [Quyết định runtime/artifact](decisions/mvp-runtime.md): embedding bundle có version, nguồn recipe, nghiệm thu CPU và giới hạn phát hành.
- [Nguồn Stitch frontend](frontend-reference/stitch/README.md): snapshot chuẩn, tokens và đối chiếu desktop/mobile; snapshot cũ giữ cho lịch sử.
- [CV](cv/README.md)
- [Mobile Expo](phases/mobile-expo.md): client native dùng chung API, Expo Go, kiểm thử bundle/contract và phần chờ nghiệm thu trên thiết bị.
- [LangGraph](langgraph/README.md)
- [Data & RAG](data/README.md)
- [Chuẩn kỹ thuật MVP](technical-architecture.md): contract CV–RAG, API, persistence, observability và evaluation gates.
