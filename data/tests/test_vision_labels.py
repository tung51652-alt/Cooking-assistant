import unittest

from data.raw.resolve_vision_labels import resolve_labels


class VisionLabelTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "id": "ramen-test",
                "path": "images/ramen.jpg",
                "collection_label": "other_food",
                "dish_key": "miso_ramen",
                "source_label": "Miso ramen",
                "split": "test",
            },
            {
                "id": "pizza-train",
                "path": "images/pizza.jpg",
                "collection_label": "other_food",
                "dish_key": "margherita_pizza",
                "split": "train",
            },
            {
                "id": "chair-validation",
                "path": "images/chair.jpg",
                "collection_label": "non_food",
                "split": "validation",
            },
        ]

    def test_promotion_changes_only_the_effective_label_and_can_be_removed(self):
        fallback = resolve_labels(self.rows, {})
        promoted = resolve_labels(self.rows, {"miso_ramen": "ramen"})
        self.assertEqual([row["label"] for row in promoted], ["ramen", "other_food", "non_food"])
        self.assertEqual([{k: v for k, v in row.items() if k != "label"} for row in promoted], self.rows)
        self.assertEqual(resolve_labels(self.rows, {}), fallback)
        self.assertTrue(all("label" not in row for row in self.rows))

    def test_unknown_dishes_and_invalid_target_labels_are_rejected(self):
        for mapping in ({"typo": "ramen"}, {"miso_ramen": "non_food"}, {"miso_ramen": "Bad name"}):
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                resolve_labels(self.rows, mapping)
