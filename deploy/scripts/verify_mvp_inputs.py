#!/usr/bin/env python3
"""Check versioned input manifests and optional checkpoint bytes, without network/ML imports."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(checkpoint=None):
    manifest = json.loads((ROOT / "deploy/artifacts/manifest.json").read_text())
    vision = manifest["vision"]
    labels = vision["class_labels"]
    require(len(labels) == 30 and len(set(labels)) == 30, "Expected 30 unique model labels")
    require(all(isinstance(label, str) and label.strip() for label in labels), "Empty model label")
    require(vision["architecture"] == "efficientnet_b2", "Unexpected model architecture")
    require(vision["classifier_weight_shape"] == [30, 1408], "Unexpected classifier shape")
    require(re.fullmatch(r"[0-9a-f]{64}", vision["sha256"]), "Invalid checkpoint checksum")
    require(vision["size_bytes"] > 0, "Invalid checkpoint size")
    require(re.fullmatch(r"vision-model-v[0-9]+", vision["artifact_release_tag"]), "Invalid model release tag")
    require(vision["filename"] == "efficientnet_b2_best.pt", "Unexpected checkpoint filename")
    expected_source = ("https://github.com/tung51652-alt/Cooking-assistant/releases/download/"
                       + vision["artifact_release_tag"] + "/" + vision["filename"])
    require(vision["ci_source_uri"] == expected_source, "Unexpected vision release source")
    require(vision["provenance"]["public_distribution_authorized"] is True, "Missing project owner distribution permission")
    embedding = manifest["embedding"]
    require(re.fullmatch(r"[0-9a-f]{40}", embedding["revision"]), "Embedding revision must be immutable")
    require(re.fullmatch(r"[0-9a-f]{64}", embedding["weights_sha256"]), "Invalid embedding checksum")
    require(embedding["dimension"] == 384, "Unexpected embedding dimension")
    require(embedding["normalize_l2"] and embedding["distance"] == "cosine", "Embedding normalization mismatch")
    require(embedding["query_prefix"] == "query: " and embedding["passage_prefix"] == "passage: ", "E5 prefix mismatch")
    require("model.safetensors" in embedding["required_files"], "Missing safetensors requirement")
    require("pytorch_model.bin" not in embedding["required_files"], "Duplicate model weight formats")
    references = ROOT / "docs/frontend-reference"
    archive = json.loads((references / "manifest.json").read_text())
    require({entry["path"] for entry in archive["files"]} == {"index.html", "recognition.html", "recipe.html"}, "Unexpected frontend reference set")
    for entry in archive["files"]:
        path = references / entry["path"]
        require(path.stat().st_size == entry["size_bytes"], "Frontend reference size mismatch: " + entry["path"])
        require(sha256(path) == entry["sha256"], "Frontend reference checksum mismatch: " + entry["path"])
    if checkpoint is not None:
        require(checkpoint.stat().st_size == vision["size_bytes"], "Checkpoint size does not match manifest")
        require(sha256(checkpoint) == vision["sha256"], "Checkpoint checksum does not match manifest")
    print("PASS: input manifest invariants and three HTML reference fingerprints")
    if checkpoint is not None:
        print("PASS: local checkpoint bytes match the recorded artifact")
    print("Not a stack release approval: corpus coverage, runtime benchmarks and registry push access have later gates.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, help="Optional external checkpoint file to fingerprint")
    args = parser.parse_args()
    try:
        verify(args.checkpoint)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
