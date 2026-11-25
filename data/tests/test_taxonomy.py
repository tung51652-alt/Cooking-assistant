"""Shared taxonomy invariants, independent of Python ML dependencies."""

import json
from pathlib import Path
import unicodedata
import unittest

ROOT = Path(__file__).resolve().parents[2]


def alias_key(text):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD',text.casefold().replace('đ','d'))
                           if not unicodedata.combining(c)).split())


class TaxonomyTests(unittest.TestCase):
    def test_all_classes_keep_checkpoint_order_and_unique_keys(self):
        taxonomy=json.loads((ROOT/'data/processed/30vnfoods-label-map.json').read_text())
        manifest=json.loads((ROOT/'deploy/artifacts/manifest.json').read_text())
        labels=taxonomy['labels']
        self.assertEqual(taxonomy['taxonomy_version'],manifest['taxonomy_version'])
        self.assertEqual([x['class_id'] for x in labels],list(range(30)))
        self.assertEqual([x['original_label'] for x in labels],manifest['vision']['class_labels'])
        self.assertEqual(len({x['normalized_dish'] for x in labels}),30)
        owners={}
        for item in labels:
            self.assertRegex(item['normalized_dish'],r'^[a-z]+(?:_[a-z]+)*$')
            self.assertTrue(item['display_name'].strip())
            self.assertEqual(item['display_name'],unicodedata.normalize('NFC',item['display_name']))
            self.assertIn(item['display_name'].lower(),item['aliases'])
            self.assertIn(item['original_label'].lower(),item['aliases'])
            for alias in item['aliases']:
                key=alias_key(alias)
                self.assertTrue(key)
                self.assertEqual(owners.setdefault(key,item['class_id']),item['class_id'])


if __name__=='__main__':
    unittest.main()
