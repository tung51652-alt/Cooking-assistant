"""Corpus regression checks: run python -m unittest discover -s data/tests."""
import copy
import unittest

from data.recipes.validate import count_sources, load, validate


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

    def test_count_sources_keeps_legacy_counts_and_counts_external_recipes(self):
        wikibooks = next(r for r in self.recipes if r["id"].startswith("wb_"))
        original = next(r for r in self.recipes if "ai_authored" in r["tags"])
        self.assertEqual(count_sources([wikibooks, original]), {"wikibooks": 1, "cooklens_ai_authored": 1})
        external = copy.deepcopy(wikibooks)
        external["source"]["url"] = "https://example.org/cong-thuc"
        self.assertEqual(count_sources([wikibooks, original, external]), {
            "wikibooks": 1, "cooklens_ai_authored": 1, "external_vietnamese": 1,
        })

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

    def test_reject_editorial_boilerplate_in_ingredient_notes(self):
        for note in (
            "Giữ nguyên định lượng và lựa chọn theo nguồn; không suy đoán hoặc quy đổi.",
            "Có trong bước làm của nguồn; không có định lượng.",
        ):
            recipe = copy.deepcopy(self.recipes[0])
            recipe["ingredients"][0]["note"] = note
            with self.subTest(note=note), self.assertRaisesRegex(ValueError, "ingredient 1 note.*editorial"):
                validate([recipe], self.taxonomy)

    def test_reject_untranslated_terms_in_public_copy(self):
        recipe = copy.deepcopy(self.recipes[0])
        recipe["ingredients"][0]["name"] = "Bánh mì khô (Semmelwürfel)"
        with self.assertRaisesRegex(ValueError, "ingredient 1 name.*untranslated"):
            validate([recipe], self.taxonomy)

        recipe = copy.deepcopy(self.recipes[0])
        recipe["instructions"][0]["text"] = "Hầm Suppenhuhn đến khi mềm."
        with self.assertRaisesRegex(ValueError, "step 1.*untranslated"):
            validate([recipe], self.taxonomy)

    def test_reject_stove_specific_dial_settings(self):
        for step in ("Hạ nhỏ lửa (khoảng số 3 hoặc 4).", "Vặn bếp xuống nấc 3."):
            recipe = copy.deepcopy(self.recipes[0])
            recipe["instructions"][0]["text"] = step
            with self.subTest(step=step), self.assertRaisesRegex(ValueError, "step 1.*stove dial"):
                validate([recipe], self.taxonomy)

    def test_keep_cooking_details_and_source_provenance(self):
        recipe = copy.deepcopy(self.recipes[0])
        recipe["ingredients"][0].update(name="Bột mì số 8", note="Có thể dùng bột đa dụng.")
        recipe["instructions"][0]["text"] = "Nướng ở 180 °C, sau đó vặn lửa vừa để nấu xốt hoisin."
        recipe["source"]["modifications"] = "Giữ nguyên định lượng theo nguồn. Suppenhühner chỉ loại gà dùng để hầm."
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
