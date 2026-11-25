"""Fetch the reviewed E5 baseline; validation values exist only in memory."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]


def fetch(destination):
    config = json.loads((ROOT / "deploy/artifacts/manifest.json").read_text())["embedding"]
    repository = config["repository"]
    with urlopen(f"https://huggingface.co/api/models/{repository}?blobs=true", timeout=30) as response:
        metadata = json.load(response)
    revision = metadata["sha"]  # Transient only: never print or persist upstream identifiers.
    siblings = {s["rfilename"]: s for s in metadata["siblings"]}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="embedding-download-", dir=destination.parent) as temporary:
        stage = Path(temporary)
        for name in config["required_files"]:
            item = siblings[name]
            size = item["size"]
            if name == config["weights_file"] and size != config["weights_size_bytes"]:
                raise ValueError("Model size changed; review a new human-readable bundle version")
            check = hashlib.sha256() if item.get("lfs") else hashlib.sha1()
            expected = item["lfs"]["sha256"] if item.get("lfs") else item["blobId"]
            if not item.get("lfs"):
                check.update(b"blob " + str(size).encode() + b"\0")
            existing = destination / name
            target = stage / name
            received = 0
            if existing.exists():
                stream = existing.open("rb")
            else:
                stream = urlopen(f"https://huggingface.co/{repository}/resolve/{quote(revision, safe='')}/{name}", timeout=120)
            with stream, target.open("wb") as output:
                while block := stream.read(1024 * 1024):
                    received += len(block)
                    if received > size:
                        raise ValueError("Embedding file exceeds reviewed size")
                    check.update(block)
                    output.write(block)
            if received != size or check.hexdigest() != expected:
                raise ValueError("Embedding file validation failed; existing files preserved")
            print(f"Verified {name}: {received} bytes")
        if destination.exists():
            # Existing complete files were all validated; preserve them and extra local files.
            for name in config["required_files"]:
                if not (destination / name).exists():
                    shutil.move(stage / name, destination / name)
        else:
            stage.rename(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=ROOT / "deploy/artifacts/staging/embedding")
    args = parser.parse_args()
    fetch(args.destination)
