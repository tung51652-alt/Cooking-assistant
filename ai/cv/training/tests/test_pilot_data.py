import io
import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from PIL import Image

from ai.cv.training.pilot_data import ImageIdentity, balance_fallback, possible_match, prepare, sample_epoch


def row(label, identifier, selected=True):
    return {"label": label, "id": identifier, "selected_for_pilot": selected}


class PilotDataTests(unittest.TestCase):
    def test_reserves_restore_double_non_food_without_moving_photos(self):
        photos = [
            row("other_food", "food-1"),
            row("other_food", "food-2"),
            row("non_food", "scene-1"),
            row("non_food", "scene-2"),
            row("non_food", "reserve-1", False),
            row("non_food", "reserve-2", False),
            row("non_food", "reserve-3", False),
        ]
        self.assertEqual(
            {item["id"] for item in balance_fallback(photos, limit=25)},
            {"food-1", "food-2", "scene-1", "scene-2", "reserve-1", "reserve-2"},
        )

    def test_epoch_samples_non_food_twice_as_often_as_each_class(self):
        groups = {0: [0, 1, 2], 1: [3], 2: [4, 5]}
        draws = sample_epoch(groups, non_food_index=2, draws_per_class=4, seed=67)
        self.assertEqual([sum(index in group for index in draws) for group in groups.values()], [4, 4, 8])
        self.assertEqual(draws, sample_epoch(groups, non_food_index=2, draws_per_class=4, seed=67))

    def test_promoted_reserve_is_used_without_changing_fallback_ratio(self):
        photos = [row("other_food", "food"), row("non_food", "scene-1"), row("non_food", "scene-2"),
                  row("ramen", "ramen-reserve", False)]
        self.assertEqual(balance_fallback(photos, limit=25), photos)

    def test_duplicate_check_requires_agreement_in_both_image_directions(self):
        original = ImageIdentity(b"original", ((0, 0), (0, 0)))
        similar = ImageIdentity(b"different", ((15, 7), (15, 7)))
        unrelated = ImageIdentity(b"different", ((15, 511), (15, 511)))
        self.assertTrue(possible_match(original, similar))
        self.assertFalse(possible_match(original, unrelated))

    def test_fallback_duplicate_of_baseline_test_photo_is_held_and_replaced_in_train(self):
        def image(seed):
            rng = random.Random(seed)
            with io.BytesIO() as stream:
                Image.frombytes("L", (64, 64), rng.randbytes(64 * 64)).save(stream, format="PNG")
                return stream.getvalue()

        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            csv_rows = ["relative_path,split,class_name,class_index"]
            fallback = []
            for index, (display, split) in enumerate((("Train", "train"), ("Validate", "validation"), ("Test", "test"))):
                original = f"{display}/Banh beo/{index}.png"
                csv_rows.append(f"{original},{display},Banh beo,0")
                with ZipFile(root / f"{split}.zip", "w") as archive:
                    archive.writestr(f"Images/{original}", image(index))
                for number, label in enumerate(("other_food", "non_food", "non_food")):
                    identifier = f"{split}-{number}"
                    (root / f"{identifier}.png").write_bytes(image(2 if identifier == "train-0" else 100 + index * 10 + number))
                    fallback.append({
                        **row(label, identifier), "path": f"{identifier}.png", "collection_label": label,
                        "dish_key": "ramen" if label == "other_food" else None, "split": split,
                        "split_group": identifier, "review_status": "screened_candidate",
                        "source_url": "https://example.org/photo", "license_url": "https://creativecommons.org/licenses/by/4.0/",
                    })
            reserve = {**fallback[0], "id": "reserve", "path": "reserve.png", "selected_for_pilot": False}
            (root / "reserve.png").write_bytes(image(42))
            (root / "manifest.jsonl").write_text(
                "".join(json.dumps(item) + "\n" for item in [*fallback, reserve]), encoding="utf-8",
            )
            manifest = root / "original.csv"
            manifest.write_text("\n".join(csv_rows) + "\n", encoding="utf-8")
            release = root / "release.json"
            release.write_text(json.dumps({"vision": {"class_labels": ["Banh beo"]}}), encoding="utf-8")
            with (
                patch("ai.cv.training.pilot_data.FIXED_TOTALS", dict.fromkeys(("train", "validation", "test"), 1)),
                patch("ai.cv.training.pilot_data.RELEASE_MANIFEST", release),
            ):
                result = prepare(root, root, manifest, {})

        self.assertEqual(result["fallback_counts"]["train"], {"non_food": 2, "other_food": 1})
        self.assertIn("reserve", {item.get("id") for item in result["images"]})
        self.assertEqual(result["excluded_fallback"][0]["id"], "train-0")
        self.assertEqual(result["excluded_fallback"][0]["match_split"], "test")
