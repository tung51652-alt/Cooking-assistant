"""Stage the public versioned E5 artifact; never persist transfer validation values."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

from fetch_vision_checkpoint import download, release_validation
from verify_mvp_inputs import ROOT


def fetch(destination):
    config = json.loads((ROOT / "deploy/artifacts/manifest.json").read_text())["embedding"]
    artifact = {"artifact_release_tag": config["artifact_release_tag"],
                "filename": config["archive_filename"], "size_bytes": config["archive_size_bytes"]}
    expected_url = "https://github.com/tung51652-alt/Cooking-assistant/releases/download/" + artifact["artifact_release_tag"] + "/" + artifact["filename"]
    if config["ci_source_uri"] != expected_url:
        raise ValueError("Unexpected embedding artifact URL")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="embedding-stage-", dir=destination.parent) as temporary:
        temporary = Path(temporary)
        archive = temporary / "model.zip"
        download(expected_url, archive, artifact["size_bytes"], release_validation(artifact))
        stage = temporary / "model"
        stage.mkdir()
        with zipfile.ZipFile(archive) as source:
            expected_names = set(config["required_files"]) | {"LICENSE.txt", "NOTICE.md"}
            if set(source.namelist()) != expected_names or len(source.namelist()) != len(expected_names):
                raise ValueError("Unexpected embedding archive members")
            if sum(item.file_size for item in source.infolist()) > 500_000_000:
                raise ValueError("Embedding archive exceeds expected size")
            for name in config["required_files"]:
                if name == config["weights_file"]:
                    if source.getinfo(name).file_size != config["weights_size_bytes"]:
                        raise ValueError("Embedding weight size mismatch")
                elif source.getinfo(name).file_size > 25_000_000:
                    raise ValueError("Embedding configuration exceeds size limit")
                with source.open(name) as stream, (stage/name).open("wb") as output:
                    shutil.copyfileobj(stream, output, length=1024 * 1024)
        if destination.exists():
            # Compare bytes without publishing identifiers, and preserve invalid existing inputs.
            for name in config["required_files"]:
                with (destination/name).open("rb") as existing, (stage/name).open("rb") as verified:
                    while True:
                        a, b = existing.read(1024*1024), verified.read(1024*1024)
                        if a != b:
                            raise ValueError("Existing embedding file differs; move it aside explicitly")
                        if not a:
                            break
        else:
            stage.rename(destination)
    print("PASS: versioned embedding artifact verified and staged")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=ROOT / "deploy/artifacts/staging/embedding")
    args = parser.parse_args()
    fetch(args.destination)
