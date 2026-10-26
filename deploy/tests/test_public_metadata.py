"""Public-content policy must block identifiers and allow human-readable versions."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_public_metadata import violations


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


if __name__ == "__main__":
    unittest.main()
