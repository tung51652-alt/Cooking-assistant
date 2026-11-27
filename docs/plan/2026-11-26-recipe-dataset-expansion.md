# Vietnamese recipe dataset expansion

## Corpus for the next build

`cooklens-recipes-v3` has 90 recipes across the existing 30 dish labels. It retains 32 recipes from `develop`, adds 58 sourced recipes and retires the legacy breaded nem chua recipe. The corpus contains 42 Wikibooks recipes, 37 recipes based on other Vietnamese-language publications and 11 labeled AI-authored recipes from Phase 2. The released `2.0.0` images use the 33-recipe v1 corpus.

`develop` uses `cooklens-recipes-v2` for its 33-recipe normalization pass. The v3 bundle preserves that ingredient and serving normalization for every retained recipe and uses a separate Qdrant collection. Build the backend and recipes images from the same source version, then activate the rebuilt collection with `recipe-init`. The 30 classifier labels, vision checkpoint, E5 encoder and public API contract remain unchanged. [Source-build instructions](../development.md) · [Upgrade and rollback](../deployment.md)

## Source and dish review

Each retained variant preserves the dish’s defining preparation or serving form. The review checked all 100 records in the expansion draft. Regional and vegetarian variants qualify when they preserve that identity, as bánh cuốn Cao Bằng, mì Quảng cá lóc and bún đậu chay do. The corpus credits the actual publication, notes changes and records any uncertainty over reuse of upstream prose or images. It retains Wikibooks revisions and contributor history links where available. The later expansion used Vietnamese-language sources and independently phrased ingredient and cooking facts. [Corpus and attribution](../../data/recipes/README.md) · [Bánh cuốn Cao Bằng](https://bepxua.vn/lam-banh-cuon-cao-bang-chuan-vi-la-mieng-tai-nha/) · [Mì Quảng cá lóc](https://cookpad.com/vn/cong-thuc/1742835) · [Bún đậu chay](https://chefq.vn/bun-dau-mam-tom-chay)

| Removed from the expansion draft | Reason |
| --- | --- |
| `wb_banh_beo_phong_tom_tom_chay` | Softened shrimp crackers replace the dish’s steamed rice cakes. [Vietnam Tourism](https://vietnam.travel/things-to-do/21-must-try-vietnamese-dishes/) |
| `wb_banh_mi_chien_tom`, `wb_banh_mi_hap_bo_heo_xa`, `wb_banh_mi_nuong_muoi_ot` | Shrimp toast, topped steamed slices and flattened grilled bread are separately prepared snacks. [Shrimp toast](https://monngonmoingay.com/banh-mi-chien-tom/) · [Steamed and grilled bread](https://cookpad.com/vn/challenges/11916) |
| `vn_banh_mi_xiu_mai_nuoc_sa_te` | The source prepares xíu mại soup. The draft added bread as an accompaniment. The pairing itself is a documented Đà Lạt dish. [Exact recipe](https://cookpad.com/vn/cong-thuc/12094321) · [Đà Lạt bánh mì xíu mại](https://vietnam.travel/vi/things-to-do/eating-dalat-chef-peter/) |
| `wb_bun_bo_chay` | The stored method omitted the source’s mắm ruốc chay and dầu điều and only offered sa tế at serving. [Exact recipe](https://cookpad.com/vn/cong-thuc/12646009) |
| `wb_pho_cuon_bo_xao_gung_toi`, `wb_pho_cuon_bo_bam_nuoc_cham_giam` | The finished dish is rolled sheets with a dipping sauce. The phở label describes the bowl of noodles and broth. [Phở cuốn](https://vi.wikibooks.org/wiki/Nấu_ăn:Phở_cuốn) · [Phở](https://vietnam.travel/things-to-do/21-must-try-vietnamese-dishes/) |
| `wb_pho_ga_nam_dong_co` | The cook used bún. The draft substituted bánh phở and omitted the listed phở seasoning. [Exact recipe](https://cookpad.com/vn/cong-thuc/12213665) |
| `cooklens_nem_chua_home`, `vi_nem_chua_ran_thit_heo_bi_ao_bot` | Both finish as breaded, fried snacks. The newer one uses unfermented meat. [Nem chua rán source](https://cookpad.com/vn/cong-thuc/6586187) · [Thanh Hóa tourism](https://visitthanhhoa.vn/vi/introduction) |

`vi_nem_chua_yen_mac_la_oi_la_sung` restores coverage for nem chua. The record starts with ready-to-eat fermented nem chua Yên Mạc and covers preparing the lime-garlic fish sauce and serving the nem with guava or fig leaves and herbs. Two Vietnamese sources document this preparation. The scope follows the food-safety guidance for fermented pork production. [Ninh Bình Tourism Department](https://sodulich.ninhbinh.gov.vn/vi/am-thuc-ninh-binh/nem-chua-yen-mac-nem-tien-vua-62.html) · [Independent Vietnamese source](https://sunworld.vn/vi/ha-nam/am-thuc/tron-bo-an-gi-o-ninh-binh-ngon-va-noi-tieng-cho-hoi-me-am-thuc-29065) · [Food-safety research](https://vnua.edu.vn/tin-tuc-su-kien/nghien-cuu-khoa-hoc/danh-gia-va-de-xuat-bien-phap-cai-thien-tinh-trang-an-toan-vi-sinh-vat-cua-cac-san-pham-thit-len-men-truyen-thong-cua-viet-nam-53143)

## Verification and release

- The source evaluation covers 259 queries across 30 labels. Query relevance retains ingredients, techniques and serving constraints. The previous nem chua rán cases were retired, and the generic and Yên Mạc queries target the fermented nem.
- The Recipes runtime workflow builds and tests the source corpus. Published-image acceptance uses the v1 fixtures and manifest bundled with the `v2.0.0` tag.
- The local Recipes API and Qdrant retained the v2 collection when activating v3. Retrieval passed at 93.05% Hit@1 and 100% Hit@3 with no cross-dish results. Both nem chua queries returned the Yên Mạc recipe.
- Packaged v3 runtime testing, external acceptance and kitchen testing are pending. [Evaluation evidence](../../ai/rag/evaluation/REVIEW.md)
