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

    def test_reject_editorial_text_in_cooking_fields(self):
        marker = 'Giữ nguyên định lượng và lựa chọn theo nguồn; không suy đoán hoặc quy đổi.'
        for value in [marker, 'Ghi chú nội bộ: giữ nguyên dữ liệu.',
                      'GHI CHÚ BIÊN TẬP: chưa chuẩn hóa.',
                      'Giữ nguyên định lượng\n và lựa chọn theo nguồn.']:
            for field in ['title', 'name', 'note', 'unit', 'text', 'tags']:
                recipe = copy.deepcopy(self.recipes[0])
                if field == 'text':
                    recipe['instructions'][0][field] = value
                elif field == 'title':
                    recipe[field] = value
                elif field == 'tags':
                    recipe[field] = [value]
                else:
                    recipe['ingredients'][0][field] = value
                with self.subTest(field=field, value=value), self.assertRaisesRegex(
                        ValueError, 'editorial text belongs in source.modifications'):
                    validate([recipe], self.taxonomy)
        recipe = copy.deepcopy(self.recipes[0])
        recipe['source']['modifications'] += ' ' + marker
        validate([recipe], self.taxonomy)

    def test_reject_untranslated_source_terms(self):
        for value in ['Hầm Suppenhühner cho mềm.', 'Chiên SEMMELWÜRFEL vàng.']:
            for field in ['name', 'note', 'text']:
                recipe = copy.deepcopy(self.recipes[0])
                target = recipe['instructions'][0] if field == 'text' else recipe['ingredients'][0]
                target[field] = value
                with self.subTest(field=field, value=value), self.assertRaisesRegex(
                        ValueError, 'untranslated source term'):
                    validate([recipe], self.taxonomy)

    def test_reject_appliance_specific_heat_settings(self):
        for value in ['Giảm nhỏ lửa (khoảng số 3 hoặc 4).',
                      'Bắc lên bếp để lửa nhỏ (số 3 hoặc 4) quậy đều.',
                      'Để bếp ở mức 4.', 'Đun ở nấc nhiệt 3.']:
            recipe = copy.deepcopy(self.recipes[0])
            recipe['instructions'][0]['text'] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'descriptive heat'):
                validate([recipe], self.taxonomy)
        for value in ['Đun lửa nhỏ khoảng 3 hoặc 4 phút.',
                      'Hấp 15 phút; quay lò vi sóng 600W.',
                      'Làm tiếp bước số 3, cho 4 quả trứng vào bát.']:
            recipe = copy.deepcopy(self.recipes[0])
            recipe['instructions'][0]['text'] = value
            with self.subTest(value=value):
                validate([recipe], self.taxonomy)

    def test_localized_source_instructions_keep_cooking_details(self):
        recipes = {r['id']: r for r in self.recipes}
        pho = recipes['wb_pho_ga']['instructions'][1]['text']
        self.assertIn('giảm xuống lửa nhỏ', pho)
        self.assertIn('khoảng ba tiếng đối với gà mái già (gà nấu súp)', pho)
        batter = recipes['wb_banh_bot_loc_hue']['instructions'][2]['text']
        self.assertIn('lửa nhỏ', batter)
        self.assertIn('đến khi thấy hơi nặng tay', batter)
        bread = recipes['wb_banh_beo_chen']['instructions'][3]['text']
        self.assertIn('bánh mì khô cắt hạt lựu vào và chiên vàng', bread)

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
