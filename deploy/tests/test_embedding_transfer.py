"""Protect the artifact extraction boundary and existing local model files."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_embedding_model as transfer


class EmbeddingTransferTests(unittest.TestCase):
    def exercise(self, *, extra=None, existing=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "deploy/artifacts").mkdir(parents=True)
            config = {"artifact_release_tag": "embedding-model-v1", "archive_filename": "model.zip",
                      "archive_size_bytes": 1, "ci_source_uri": "https://github.com/tung51652-alt/Cooking-assistant/releases/download/embedding-model-v1/model.zip",
                      "required_files": ["config.json", "model.safetensors"], "weights_file": "model.safetensors", "weights_size_bytes": 3}
            (root/"deploy/artifacts/manifest.json").write_text(json.dumps({"embedding": config}))
            destination = root / "model"
            if existing is not None:
                destination.mkdir()
                (destination/"config.json").write_text(existing)
                (destination/"model.safetensors").write_bytes(b"yes")

            def download(url, path, size, validation):
                with zipfile.ZipFile(path, "w") as archive:
                    for name, value in {"config.json": "{}", "model.safetensors": "yes", "LICENSE.txt": "notice", "NOTICE.md": "notice"}.items():
                        archive.writestr(name, value)
                    if extra:
                        archive.writestr(extra, "not allowed")

            with patch.object(transfer, "ROOT", root), patch.object(transfer, "download", side_effect=download), patch.object(transfer, "release_validation", return_value=None):
                if extra or existing is not None:
                    with self.assertRaises(ValueError):
                        transfer.fetch(destination)
                    if existing is not None:
                        self.assertEqual((destination/"config.json").read_text(), existing)
                    self.assertFalse((root/"escape").exists())
                else:
                    transfer.fetch(destination)
                    self.assertEqual((destination/"model.safetensors").read_bytes(), b"yes")

    def test_extracts_only_expected_files(self):
        self.exercise()

    def test_rejects_archive_path_traversal(self):
        self.exercise(extra="../escape")

    def test_preserves_mismatched_existing_files(self):
        self.exercise(existing="local file must not be overwritten")


if __name__ == "__main__":
    unittest.main()
