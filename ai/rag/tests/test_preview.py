import unittest

from ai.rag.api.preview import recipe_preview


class RecipePreviewTests(unittest.TestCase):
    def test_short_and_exact_limit_previews_stay_intact(self):
        for text in ('Nêm muối, đảo đều.', 'a' * 240):
            with self.subTest(length=len(text)):
                self.assertEqual(recipe_preview(text), text)

    def test_truncated_preview_keeps_whole_words_and_ellipsis(self):
        for last_word in ('muối', 'mu'):
            with self.subTest(last_word=last_word):
                prefix = 'a' * 236
                expected = prefix + (' mu' if last_word == 'mu' else '') + '…'
                self.assertEqual(recipe_preview(prefix + ' ' + last_word + ' và nêm lại.'), expected)

    def test_gateway_limit_counts_utf16_code_units(self):
        prefix = ('🍲 ' * 79) + '🍲'
        result = recipe_preview(prefix + ' muối và nêm lại.')
        self.assertEqual(result, prefix + '…')
        self.assertEqual(len(result.encode('utf-16-le')) // 2, 240)

    def test_word_longer_than_preview_budget_is_omitted(self):
        self.assertEqual(recipe_preview('a' * 241), '…')
