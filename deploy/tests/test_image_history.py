"""Project history must exclude verified upstream metadata without hiding own literals."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from check_public_metadata import violations
from smoke_release_stack import managed_history


class ImageHistoryTests(unittest.TestCase):
    def test_upstream_metadata_is_excluded(self):
        base = ['ENV UPSTREAM_BUILD=' + 'a' * 64, 'CMD nginx']
        own = ['RUN nginx -t', 'COPY file:' + 'b' * 64 + ' in /etc/nginx/']
        result = managed_history(own + base, base)
        self.assertEqual(len(result), len(own))
        self.assertFalse(violations('\n'.join(result)))

    def test_project_literals_are_still_rejected(self):
        base = ['CMD nginx']
        own = ['ENV PROJECT_VALUE=' + 'c' * 64]
        self.assertIn('object identifier', violations('\n'.join(managed_history(own + base, base))))

    def test_unverified_base_cannot_remove_project_layers(self):
        for base in ([], ['different base']):
            with self.subTest(base=base), self.assertRaises(ValueError):
                managed_history(['RUN nginx -t', 'CMD nginx'], base)
