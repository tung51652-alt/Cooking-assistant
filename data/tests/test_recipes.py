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
        self.assertTrue(all(n >= 1 for n in coverage.values()), "Phase 2 requires every dish to have a recipe")

    def test_original_recipes_are_explicit_and_complete(self):
        generated = [r for r in self.recipes if "ai_authored" in r["tags"]]
        self.assertEqual(len(generated), self.manifest["source_counts"]["cooklens_ai_authored"])
        for recipe in generated:
            with self.subTest(recipe=recipe["id"]):
                self.assertGreaterEqual(len(recipe["ingredients"]), 6)
                self.assertGreaterEqual(len(recipe["instructions"]), 4)
                bad = copy.deepcopy(recipe)
                bad["source"]["name"] = "Wikibooks"
                with self.assertRaisesRegex(ValueError, "disclose its origin"):
                    validate([bad], self.taxonomy)

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

    def test_bun_dau_amounts_and_verified_servings(self):
        recipe = next(r for r in self.recipes if r['id'] == 'wb_bun_dau_mam_tom')
        ingredients = {i['name']: i for i in recipe['ingredients']}
        for name, amount, unit in [('Bún lá', 1.2, 'kg'), ('Mắm tôm', 1, 'bát')]:
            self.assertEqual((ingredients[name]['quantity'], ingredients[name]['unit']), (amount, unit))
        self.assertEqual(recipe['servings'], 4)
        # The source's two hours is elapsed time, not cooking time.
        self.assertIsNone(recipe['prep_time_minutes'])
        self.assertIsNone(recipe['cook_time_minutes'])

    def test_grouped_amounts_and_ranges_keep_their_meaning(self):
        recipe = next(r for r in self.recipes if r['id'] == 'wb_bun_mam')
        items = {i['name']: i for i in recipe['ingredients']}
        for name, amount, unit in [('Sả', 2, 'cây'), ('Ớt', 2, 'quả'),
                                   ('Muối', 1, 'muỗng cà phê'), ('Dầu ăn', 5, 'ml')]:
            self.assertEqual((items[name]['quantity'], items[name]['unit']), (amount, unit))
        recipe = next(r for r in self.recipes if r['id'] == 'wb_hu_tieu_nam_vang')
        shrimp = next(i for i in recipe['ingredients'] if i['name'] == 'Tôm')
        self.assertIsNone(shrimp['quantity'])
        self.assertIn('200–300 g', shrimp['note'])

    def test_reject_embedded_amounts_and_inconsistent_units(self):
        for name in ['1,2 kilogram bún lá', 'Bánh canh : 400 g', '1½ cup đậu xanh']:
            recipe = copy.deepcopy(self.recipes[0])
            recipe['ingredients'][0]['name'] = name
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'ingredient amount'):
                validate([recipe], self.taxonomy)
        for unit in ['tbsp', 'tsp', 'cup', 'pound']:
            recipe = copy.deepcopy(self.recipes[0])
            recipe['ingredients'][0]['unit'] = unit
            with self.subTest(unit=unit), self.assertRaisesRegex(ValueError, 'canonical Vietnamese'):
                validate([recipe], self.taxonomy)


if __name__ == "__main__":
    unittest.main()
