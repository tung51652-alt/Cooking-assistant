# Fixture contract nội bộ

`vision-predict.json` là response Top-3 thực từ image CV Phase 1, với fixture ảnh figure notebook tại `ai/cv/inference/tests/fixtures/food.png`. Chỉ ghi DTO nội bộ; request ID được sinh ở runtime/header và public envelope do backend thêm, không lưu mã thật vào ví dụ.

API regression kiểm tra fixture này theo schema/model và thứ tự class/canonical/rank. Backend Phase 3 dùng cùng fixture để kiểm tra typed HTTP client và thêm envelope public theo contract; không chép danh mục 30 món thành code hardcode. Không coi confidence trên ảnh figure có nhãn là accuracy evidence. Fixtures thuộc test/documentation, không nằm trong image runtime.
