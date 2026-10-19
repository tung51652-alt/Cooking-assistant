# Data & RAG

Milestone hiện tại là retrieval từ corpus có nguồn, chưa gọi LLM/web search trong runtime. [Quyết định Phase 0](../decisions/mvp-runtime.md) chọn Wikibooks Cookbook text làm nguồn khởi đầu theo policy từng trang/revision; chưa nhập/review recipe nào và chưa chứng minh phủ đủ 30 món. [Artifact manifest](../../deploy/artifacts/manifest.json) ghi trạng thái này; không dùng sample bên dưới như dữ liệu production.

## Nguyên tắc

- Recipe là nguồn sự thật cho nguyên liệu, định lượng và bước nấu; ảnh chỉ nhận diện món.
- Mỗi nguồn cần provenance, quyền sử dụng và thời điểm thu thập.
- Tách `raw`, `interim`, `processed`; validate schema trước khi nạp vector DB.

## Danh mục dữ liệu

| Nguồn | Mục đích | Trạng thái | Quyền / hành động |
| --- | --- | --- | --- |
| [Vietnamese Recipe Dataset](https://github.com/PTIT-KLTN/vietnamese_recipe_dataset) | Tham chiếu recipe Việt, normalization | Đang đánh giá | Crawl bên thứ ba; chỉ research/education đến khi xác minh quyền. |
| Recipe tự biên soạn/cấp phép | Corpus MVP | Chưa có | Lưu tác giả, nguồn, license. |
| Wikibooks Cookbook text | Nguồn khởi đầu cho corpus v1 | Chọn policy nguồn, chưa nhập/review | Lưu URL/revision, attribution/history, CC BY-SA notice và phần dịch/chỉnh sửa; kiểm tra license từng trang, không tự lấy media. |
| [RecipeNLG](https://github.com/Glorf/recipenlg) | Thử nghiệm retrieval | Chưa dùng | Chỉ dùng subset sau kiểm tra license. |
| 30VNFoods | Label map CV → `normalized_dish` | Chưa dùng | Không phải recipe source. |

## Recipe schema chuẩn

```json
{
  "id": "recipe_001", "title": "Cơm tấm sườn", "normalized_dish": "com_tam",
  "language": "vi", "cuisine": "vietnamese", "servings": 4,
  "prep_time_minutes": 20, "cook_time_minutes": 35,
  "ingredients": [{"name":"sườn heo","normalized_name":"pork_rib","quantity":500,"unit":"g","optional":false,"note":null}],
  "instructions": [{"step":1,"text":"Sơ chế và ướp sườn.","duration_minutes":20}],
  "tags": ["vietnamese", "rice", "pork"],
  "source": {"name":"Tên nguồn","url":"https://example.com","license":"permission-reference","retrieved_at":"YYYY-MM-DD","attribution":"Tác giả hoặc history link","revision_url":null,"modifications":"Mô tả phần dịch/chuẩn hóa nếu có"},
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

Contract v1 yêu cầu thêm `source.attribution`, `revision_url` (nullable với dữ liệu nhóm tự biên soạn), `modifications`. Quantity có thể `null` khi nguồn không có số chính xác; giữ khoảng/“tùy khẩu vị” ở note. Placeholder license trong ví dụ không là bằng chứng quyền phân phối. Search/detail/error schema và metadata bắt buộc nằm ở [contract v1](../contracts/mvp-v1.md).

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
