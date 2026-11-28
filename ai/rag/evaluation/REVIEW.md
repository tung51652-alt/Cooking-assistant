# Đánh giá truy xuất công thức

Tập `cooklens-recipes-v3` có 259 query có đáp án trên 30 món, gồm 80 query đối chiếu. Mỗi ID đáp án phải tồn tại và thuộc đúng món đã xác nhận. Query tên món chấp nhận các biến thể phù hợp. Query nêu nguyên liệu, cách làm hoặc cách dọn chỉ chấp nhận công thức đáp ứng yêu cầu đó. Ví dụ, bánh chưng gù không phải đáp án cho yêu cầu gói vuông. Hai query về nem chua cùng trỏ đến nem chua Yên Mạc đã lên men, một query nêu rõ lá ổi, lá sung và mắm chanh tỏi.

`technical_gate_met` yêu cầu ít nhất 150 query có đáp án, đủ 30 món, Hit@1 ≥ 90%, Hit@3 ≥ 95%, không lẫn món và có lượt rà soát đáp án riêng. `acceptance_gate_met` còn yêu cầu nghiệm thu ngoài nhóm triển khai. Mô hình E5, tokenizer, prefix, pooling, giới hạn 512 token và cosine được giữ nguyên. Với món chỉ có một công thức, query chủ yếu xác nhận luồng tìm kiếm. Các query đối chiếu đánh giá thứ hạng giữa các biến thể.

## Kết quả

Trên Recipes API và Qdrant 1.19.2 cục bộ, corpus v3 đạt Hit@1 93,05%, Hit@3 100% và MRR 0,9646. Trong 80 query đối chiếu, 76 có đáp án ở hạng nhất. Không có kết quả sai món. Phép đo dùng vector tính bằng NumPy từ trọng số E5 đã pin. Mốc kỹ thuật đã đạt. Nghiệm thu bên ngoài và thử nấu vẫn đang chờ.

| Tập đã đo trước đó | Số query | Hit@1 | Hit@3 |
| --- | ---: | ---: | ---: |
| v1 phát hành | 204 | 100% | 100% |
| Thử mở rộng Wikibooks, 62 công thức | 237 | 98,31% | 100% |
| Bản nháp 100 công thức trước rà soát món | 275 | 92,00% | 100% |
| Bản nháp 90 công thức trước khi tích hợp phần chuẩn hóa từ develop | 259 | 93,05% | 100% |

Các query bánh mì nhắc pa-tê và rau mùi được giữ lại để theo dõi lỗi xếp hạng với bánh mì cá mòi. Các công thức phở cuốn, nem chua rán và các món sai nhãn đã được loại cùng những query chỉ tìm các bản ghi đó. [Chi tiết rà soát](../../../data/recipes/README.md#rà-soát-corpus-v3)
