# Data & RAG

## Nguyên tắc

- Recipe là nguồn sự thật cho nguyên liệu, định lượng và bước nấu; ảnh chỉ nhận diện món.
- Mỗi nguồn cần provenance, quyền sử dụng và thời điểm thu thập.
- Tách `raw`, `interim`, `processed`; validate schema trước khi nạp vector DB.

## Danh mục dữ liệu

| Nguồn | Mục đích | Trạng thái | Quyền / hành động |
| --- | --- | --- | --- |
| [Vietnamese Recipe Dataset](https://github.com/PTIT-KLTN/vietnamese_recipe_dataset) | Tham chiếu recipe Việt, normalization | Đang đánh giá | Crawl bên thứ ba; chỉ research/education đến khi xác minh quyền. |
| Recipe tự biên soạn/cấp phép | Corpus MVP | Chưa có | Lưu tác giả, nguồn, license. |
| [RecipeNLG](https://github.com/Glorf/recipenlg) | Thử nghiệm retrieval | Chưa dùng | Chỉ dùng subset sau kiểm tra license. |
| 30VNFoods | Label map CV → `normalized_dish` | Đã tạo manifest và mapping v1.0.0 | Không phải recipe source; xác minh license trước khi phân phối. |

## CV dataset manifest

The 30VNFoods provenance record is stored in
[`data/raw/source-manifest.json`](../../data/raw/source-manifest.json). Its
images remain in external artifact storage and are not committed to Git.

The authoritative 30-class mapping from the CV branch is stored in
[`data/processed/30vnfoods-label-map.json`](../../data/processed/30vnfoods-label-map.json).
It maps the model's original class names to the shared `normalized_dish`
taxonomy used by retrieval. This mapping does not provide recipe ingredients or
instructions; those must come from a separately verified recipe source.

## Recipe schema chuẩn

```json
{
  "id": "recipe_001", "title": "Cơm tấm sườn", "normalized_dish": "com_tam",
  "language": "vi", "cuisine": "vietnamese", "servings": 4,
  "prep_time_minutes": 20, "cook_time_minutes": 35,
  "ingredients": [{"name":"sườn heo","normalized_name":"pork_rib","quantity":500,"unit":"g","optional":false,"note":null}],
  "instructions": [{"step":1,"text":"Sơ chế và ướp sườn.","duration_minutes":20}],
  "tags": ["vietnamese", "rice", "pork"],
  "source": {"name":"Tên nguồn","url":"https://example.com","license":"permission-reference","retrieved_at":"YYYY-MM-DD"},
  "created_at": "YYYY-MM-DD", "updated_at": "YYYY-MM-DD"
}
```

| Trường | Ràng buộc |
| --- | --- |
| `id` | Duy nhất, ổn định. |
| `normalized_dish` | `snake_case`, khớp label map CV nếu có thể. |
| thời gian / servings | Số dương hoặc `null`, không tự bịa. |
| `instructions` | Step liên tục từ 1. |
| `source` | Bắt buộc provenance và quyền dùng. |

## Qdrant document

```json
{"id":"recipe_001","text":"Cơm tấm sườn... Nguyên liệu... Hướng dẫn...","metadata":{"dish":"com_tam","cuisine":"vietnamese","language":"vi","cook_time_minutes":35,"servings":4,"source_id":"source_slug"}}
```

`text` được dựng từ schema, không dùng HTML thô.

## Pipeline

`Nguồn → raw + source manifest → cleaning → normalization → deduplicate → validation → processed recipe JSON → embedding → Qdrant → retrieval evaluation`

## Checklist

- [ ] Chốt policy quyền/source manifest và label map CV → dish.
- [ ] Viết schema validator và từ điển đồng nghĩa nguyên liệu/đơn vị.
- [ ] Chuẩn hóa tên món/biến thể, loại trùng, review corpus MVP.
- [ ] Chọn embedding/chunking/filter, nạp thử Qdrant và đo Hit@K/MRR.
