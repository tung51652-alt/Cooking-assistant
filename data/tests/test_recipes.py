"""Corpus regression checks: run python -m unittest discover -s data/tests."""
import copy
import unittest

from data.recipes.validate import load, validate


class CorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipes, cls.taxonomy, cls.manifest = load()

    def test_versions_and_coverage_are_truthful(self):
        coverage = validate(self.recipes, self.taxonomy)
        self.assertEqual(len(coverage), 30)
        self.assertEqual(sum(coverage.values()), len(self.recipes))
        self.assertEqual(self.manifest["covered_dishes"], sum(bool(n) for n in coverage.values()))

    def test_reject_invalid_mutations(self):
        changes = [
            lambda r: r.update(id="../recipe"),
            lambda r: r.update(normalized_dish="unknown_dish"),
            lambda r: r.update(language="en"),
            lambda r: r.update(servings=True),
            lambda r: r.update(cook_time_minutes=-1),
            lambda r: r["ingredients"][0].update(quantity=float("nan")),
            lambda r: r["instructions"][0].update(step=2),
            lambda r: r["instructions"][0].update(text="<script>"),
            lambda r: r["source"].update(url="javascript:example"),
            lambda r: r["source"].update(license="unknown"),
            lambda r: r.update(extra="unexpected"),
            lambda r: r.update(title=" "),
        ]
        for change in changes:
            with self.subTest(change=changes.index(change)):
                recipe = copy.deepcopy(self.recipes[0])
                change(recipe)
                with self.assertRaises(ValueError):
                    validate([recipe], self.taxonomy)

    def test_reject_duplicate_content_even_with_different_id(self):
        duplicate = copy.deepcopy(self.recipes[0])
        duplicate["id"] += "_duplicate"
        with self.assertRaisesRegex(ValueError, "duplicate recipe content"):
            validate([self.recipes[0], duplicate], self.taxonomy)

    def test_reject_duplicate_id(self):
        with self.assertRaisesRegex(ValueError, "duplicate recipe ID"):
            validate([self.recipes[0], self.recipes[0]], self.taxonomy)

    def test_ambiguous_quantities_remain_nullable(self):
        recipe = copy.deepcopy(self.recipes[0])
        ingredient = recipe["ingredients"][0]
        ingredient.update(quantity=None, unit=None, note="Theo khẩu vị; nguồn không định lượng.")
        validate([recipe], self.taxonomy)


if __name__ == "__main__":
    unittest.main()
