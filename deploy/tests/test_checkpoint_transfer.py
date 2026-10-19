"""Regression checks: corrupt downloads never become a build input."""

import hashlib
import json
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_vision_checkpoint import download, release_validation


class CheckpointTransferTests(unittest.TestCase):
    def test_valid_bytes_and_repeat_do_not_redownload(self):
        payload = b"checkpoint test fixture"
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "model.pt"
            checksum = hashlib.sha256(payload).hexdigest()
            download("unused", target, len(payload), checksum, lambda *a, **k: BytesIO(payload))
            self.assertEqual(target.read_bytes(), payload)
            def offline(*args, **kwargs):
                raise AssertionError("Valid cached file must not be downloaded again")
            download("unused", target, len(payload), checksum, offline)

    def test_corrupt_truncated_and_oversized_downloads_leave_no_file(self):
        expected = b"good"
        for received in [b"evil", b"goo", b"good-extra"]:
            with self.subTest(received=received), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "model.pt"
                with self.assertRaises(ValueError):
                    download("unused", target, len(expected), hashlib.sha256(expected).hexdigest(),
                             lambda *a, **k: BytesIO(received))
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_network_failure_cleans_partial_download(self):
        class InterruptedResponse(BytesIO):
            def read(self, size=-1):
                if self.tell():
                    raise OSError("Simulated connection drop after partial bytes")
                return super().read(2)
        def fail(*args, **kwargs):
            return InterruptedResponse(b"good")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(OSError):
                download("unused", Path(directory) / "model.pt", 4, "unused", fail)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_existing_bad_file_is_preserved_and_rejected(self):
        for payload in [b"evil", b"bad-size"]:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "model.pt"
                target.write_bytes(payload)
                with self.assertRaises(ValueError):
                    download("unused", target, 4, hashlib.sha256(b"good").hexdigest())
                self.assertEqual(target.read_bytes(), payload)


class ReleaseMetadataTests(unittest.TestCase):
    def test_reads_validation_value_only_in_memory(self):
        value = hashlib.sha256(b"fixture").hexdigest()
        data = {"draft": False, "tag_name": "vision-model-v1", "assets": [
            {"name": "model.pt", "size": 7, "digest": "sha256:" + value}]}
        vision = {"artifact_release_tag": "vision-model-v1", "filename": "model.pt", "size_bytes": 7}
        result = release_validation(vision, lambda *a, **k: BytesIO(json.dumps(data).encode()))
        self.assertEqual(result, value)

    def test_rejects_wrong_release_or_missing_validation(self):
        vision = {"artifact_release_tag": "vision-model-v1", "filename": "model.pt", "size_bytes": 7}
        for data in [
            {"draft": True, "tag_name": "vision-model-v1"},
            {"draft": False, "tag_name": "another-version"},
            {"draft": False, "tag_name": "vision-model-v1", "assets": []},
            {"draft": False, "tag_name": "vision-model-v1", "assets": [{"name": "model.pt", "size": 7}]},
        ]:
            with self.subTest(fields=sorted(data)):
                with self.assertRaises(ValueError):
                    release_validation(vision, lambda *a, **k: BytesIO(json.dumps(data).encode()))


if __name__ == "__main__":
    unittest.main()
