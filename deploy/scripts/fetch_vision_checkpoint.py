#!/usr/bin/env python3
"""Stage the pinned public model release for builds; verify before atomic replacement."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.request import urlopen

from verify_mvp_inputs import ROOT, verify


def download(url, destination, size, checksum, opener=urlopen):
    destination = Path(destination)
    if destination.exists():
        if destination.stat().st_size != size:
            raise ValueError("Existing checkpoint has unexpected size; move it aside explicitly")
        with destination.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != checksum:
            raise ValueError("Existing checkpoint has unexpected checksum; move it aside explicitly")
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".checkpoint-", delete=False) as out:
            temporary = Path(out.name)
            digest = hashlib.sha256()
            received = 0
            with opener(url, timeout=60) as response:
                while block := response.read(1024 * 1024):
                    received += len(block)
                    if received > size:
                        raise ValueError("Downloaded checkpoint exceeds expected size")
                    digest.update(block)
                    out.write(block)
            if received != size or digest.hexdigest() != checksum:
                raise ValueError("Downloaded checkpoint size/checksum mismatch")
        os.replace(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def release_validation(vision, opener=urlopen):
    """Read upstream transfer metadata transiently; never persist or print its value."""
    url = ("https://api.github.com/repos/tung51652-alt/Cooking-assistant/releases/tags/"
           + vision["artifact_release_tag"])
    with opener(url, timeout=60) as response:
        release = json.load(response)
    if release.get("draft") or release.get("tag_name") != vision["artifact_release_tag"]:
        raise ValueError("Unexpected public model release")
    assets = [a for a in release["assets"] if a["name"] == vision["filename"]]
    if len(assets) != 1 or assets[0]["size"] != vision["size_bytes"]:
        raise ValueError("Unexpected checkpoint release metadata")
    algorithm, separator, value = (assets[0].get("digest") or "").partition(":")
    if algorithm != "sha256" or not separator or len(value) != 64:
        raise ValueError("Release is missing required transfer validation metadata")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Defaults to the manifest build staging path")
    args = parser.parse_args()
    try:
        manifest = json.loads((ROOT / "deploy/artifacts/manifest.json").read_text())
        vision = manifest["vision"]
        url = vision["ci_source_uri"]
        expected_url = (
            "https://github.com/tung51652-alt/Cooking-assistant/releases/download/"
            + vision["artifact_release_tag"] + "/" + vision["filename"]
        )
        if url != expected_url:
            raise ValueError("Unexpected artifact release URL")
        verify()
        destination = args.output or ROOT / vision["build_staging_path"]
        download(url, destination, vision["size_bytes"], release_validation(vision))
        verify(destination)
        print("PASS: pinned checkpoint staged for build")
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
