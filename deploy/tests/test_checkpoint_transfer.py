"""Regression checks: corrupt downloads never become a build input."""

import hashlib
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_vision_checkpoint import download


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


if __name__ == "__main__":
    unittest.main()
