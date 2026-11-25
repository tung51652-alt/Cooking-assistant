"""Public-content policy must block identifiers and allow human-readable versions."""

import base64
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_public_metadata import ROOT, violations


class PublicMetadataTests(unittest.TestCase):
    def test_blocks_generated_identifier_literals(self):
        examples = ["a" * 64, "b" * 40, "abc" + "1234", "sha512-" + "Q" * 70]
        for example in examples:
            with self.subTest(kind=len(example)):
                self.assertTrue(violations(example))

    def test_blocks_docker_hub_credentials_without_echoing_them(self):
        token = 'dckr_' + 'pat_' + 'Q' * 32
        self.assertIn('credential', violations(token))
        self.assertNotIn(token, str(violations(token)))

    def test_allows_versions_and_ordinary_domain_values(self):
        text = "vision-model-v1 linux/amd64 api/v1 EfficientNet-B2 31434209 2026-10-19"
        self.assertFalse(violations(text))

    def test_diagnostics_do_not_return_sensitive_value(self):
        value = "ghp_" + "Q" * 36
        result = violations(value)
        self.assertIn("credential", result)
        self.assertNotIn(value, str(result))

    def test_allows_valid_npm_integrity_only_at_the_mobile_lockfile_field(self):
        value = 'sha512-' + base64.b64encode(b'q' * 64).decode()
        entry = {'integrity': value, 'resolved': 'https://registry.npmjs.org/example/-/example-1.0.0.tgz'}
        lock = {'lockfileVersion': 3, 'packages': {'node_modules/example': entry}}
        path = ROOT / 'mobile/package-lock.json'
        self.assertEqual(violations(json.dumps(lock), path), set())
        self.assertIn('package integrity value', violations(json.dumps(lock), ROOT / 'docs/deployment.md'))
        lock['unrelated'] = value
        self.assertIn('package integrity value', violations(json.dumps(lock), path))
        escaped = json.dumps(lock).replace(value, r'\u0073' + value[1:], 1)
        self.assertIn('package integrity value', violations(escaped, path))
        del lock['unrelated']
        entry['integrity'] = 'sha512-' + 'Q' * 70
        self.assertIn('package integrity value', violations(json.dumps(lock), path))
        entry['integrity'] = value
        entry['description'] = 'ghp_' + 'Q' * 36
        self.assertEqual(violations(json.dumps(lock), path), {'credential'})
        entry['resolved'] = 'https://somewhere.example/example.tgz'
        self.assertIn('package integrity value', violations(json.dumps(lock), path))


if __name__ == "__main__":
    unittest.main()
