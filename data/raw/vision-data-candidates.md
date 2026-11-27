# CookLens vision data candidates

Review record for [issue #67](https://github.com/tung51652-alt/Cooking-assistant/issues/67). Last updated 2026-11-27.

The reported Cơm tấm photo ranked the correct dish first at 53.7% and received no suggestion under the 65% cutoff. The data work starts with finding usable sources, then training and measuring on the resulting classes. Keep the issue photo and its crop as regression examples. [Existing threshold evaluation](../../docs/plan/2026-11-27-issue-49-vision-confidence.md)

## What to collect

- **Existing dish.** Keep the current [30-class taxonomy](../processed/30vnfoods-label-map.json). Collect additional examples where coverage is weak, such as photos in conditions underrepresented in the existing data.
- **New dish.** Let the available datasets determine the shortlist. Skip aliases, subtypes of current labels, and classes whose visual boundary is unclear. Use around 200 independent, usable photos as a pilot target, with roughly 150 for training and 25 each for validation and test. Aim for 50 independent test photos where possible for release decisions. Source diversity, clean labels, and held-out results determine whether a class is ready.
- **`other_food`.** Recognizable food outside the supported dish list, including visually similar foods. Keep it separate during collection so a two-class fallback can be compared with one combined fallback.
- **`non_food`.** No recognizable food, such as a wall, tree, chair, appliance, animal, or portrait. Include varied indoor and outdoor scenes.

When a supported dish is visible, keep its supported label even if other objects or foods appear. Hold ambiguous photos for review. Group near-duplicates, edits, crop variants, and photos from the same meal or session before splitting. Check against the original 30VNFoods splits. Multi-dish recognition is a separate experiment and needs complete labels for the distinct dishes visible in each photo.

## Source inventory

Prioritize public-domain, CC0, and CC BY photos. Retain attribution, the original photo URL or source ID, the license, the proposed label, and the review status. CC BY-SA samples are useful when their terms fit the intended use. A publisher license badge establishes the published claim. Record any gap in photo provenance before using the images. Keep source archives and preview photos outside Git.

| Source | Published terms and access | Evidence and fit |
| --- | --- | --- |
| [Open Images Extended, crowdsourced subset](https://storage.googleapis.com/openimages/web/extended.html#crowdsourced) | CC BY 4.0 in Google's [data card](https://sites.research.google/datacardsplaybook/activities/data-card-brief.pdf). Google describes the contributors' [opt-in terms](https://support.google.com/crowdsource/answer/7680293?hl=en). | The public annotations include 16,667 tree, 4,428 wall, 3,190 chair, and 324 couch image IDs with positive tags. Counts can overlap because an image may have several tags. The [image index](https://storage.googleapis.com/open-images-extended/extended-crowdsourced-image-ids.csv) includes the author, source, and license per photo. Faces in the published subset are blurred. |
| [WorldCuisines food knowledge base](https://huggingface.co/datasets/worldcuisines/food-kb) | [Downloadable photo metadata](https://huggingface.co/datasets/worldcuisines/food-kb/blob/main/worldcuisines.csv) includes the image URL and license per photo. | Counted 42 Vietnam-linked entries with 128 licensed photo records. Of these, 57 list CC0, public domain, or CC BY and 71 list CC BY-SA. A useful source for `other_food` and small positive supplements. |
| [SEA-VL Crowdsourcing](https://huggingface.co/datasets/SEACrowd/sea-vl_crowdsourcing) | CC BY-SA 4.0. The [authors' paper](https://aclanthology.org/2025.acl-long.916/) describes collecting images owned by contributors. | The public viewer statistics list 456 Vietnam-tagged captioned rows across food, places, objects, and activities. Candidate source for local `non_food` scenes after review of the photo. |
| [Vietnamese Street Food](https://huggingface.co/datasets/HoagMin/Vietnamese_StreetFood_Dataset/tree/main) | CC BY 4.0 listed on the card and bundled Roboflow README. The archive opens publicly. | Counted 3,526 labeled photos. 3,103 carry labels that map to ten existing CookLens dishes. There is one distinct annotated class per photo. The README describes a 7,839-photo export and some sampled labels look questionable. Verify the origin, labels, and duplicate rate before use. No distinct new class met the pilot target in this archive. |
| [Vietnamese Food Classifier](https://universe.roboflow.com/try-something-fun/vietnamese-food-classifier) | The project lists CC BY 4.0. Export returned HTTP 403 without sign-in. | The project overview lists 26,227 images and 42 labels. Several label names map to the same CookLens dish. Photo provenance and usable per-label counts still need verification. |
| [Food Object Detection](https://universe.roboflow.com/annotation-ejfhp/food-oszcf-hz6sc) | The publisher lists CC BY 4.0 and a [versioned export](https://universe.roboflow.com/annotation-ejfhp/food-oszcf-hz6sc/dataset/1). Photo provenance is undocumented on the overview. | The project lists 8,384 images and 68 labels, including named Vietnamese dishes, ingredients, broad categories, and people. An object label does not establish what else is visible in the photo. Distinct dishes and independent photo counts need an export audit. |
| [NHH Vietnamese Food](https://universe.roboflow.com/nhh/vietnamese-food/dataset/1) | The publisher lists CC BY 4.0. Export returned HTTP 403 without sign-in. | 1,000 images and five labels. One distinct new dish label is apparent from the class names. Its image count and overlap with similarly named Roboflow datasets are unverified. |
| [FoodLensVN](https://huggingface.co/datasets/Tamir39/foodlensvn) | CC BY-SA 4.0 on the dataset card. It describes source-image rights as best effort. | 299 original photos across 20 dishes according to the publisher. Count originals once. The extra question and answer rows and geometric variants are derived from those originals. |
| [Openverse](https://api.openverse.org/v1/images/?q=Vietnamese%20cuisine&license=by%2Ccc0%2Cpdm) | Public search filtered to CC BY, CC0, and public-domain listings. Check each original source's license. | The broad English query reported 240 results. The first page includes restaurant and event photos, so search hits are leads and need visual labeling. |

I checked the [Open Images Extended labels](https://storage.googleapis.com/open-images-extended/extended-crowdsourced-image-labels.csv) against the class names. The search found 21 Bánh mì, eight Phở, five Bún bò Huế, two Bánh canh, and five Nem rán image IDs. The 110 images tagged generic Bánh require individual classification. The checked dish tags provide small supplements. All 96 sampled metadata records for everyday objects, places, and out-of-catalog foods listed CC BY 4.0.

## Sources on hold

- **VinaFood21.** The original download is unavailable. The paper and registration link identify the source. [Paper](https://arxiv.org/abs/2108.02929)
- **Vietnamese Food Combined 2026.** The source lists CC BY-NC-SA 4.0 and incorporates 30VNFoods. The public metadata showed 73 additional label names. Of those, 26 carry at least 200 image rows and 15 meet the 150/25/25 published split counts before overlap and label review. Use the inventory as a reference when looking for independently sourced photos. [Dataset and license](https://huggingface.co/datasets/jeandeanny/vn-food-combined-2026)
- **VietFood67.** The authors limit the dataset to research and education with attribution and explicitly prohibit commercial use and redistribution. [Author terms](https://github.com/nvhnam/FoodDetector#support-this-project)

## Review batches

- The first street-food review batch contains 30 annotated photos, with original archive paths in its manifest.
- The fallback review batch has 35 source records and 16 viewable photos. It contains five `other_food` previews from WorldCuisines, nine proposed `non_food` previews from SEA-VL, and two CC BY 4.0 `non_food` previews retrieved from the original Open Images Extended archive. Two SEA-VL photos are flagged because food might be visible.

These are candidate samples. Record decisions after viewing the photos and checking duplicate groups. Compare the existing model and the model trained on accepted data on held-out supported dishes, `other_food`, and `non_food` before changing the confidence policy.
