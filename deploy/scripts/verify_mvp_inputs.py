#!/usr/bin/env python3
"""Check versioned input manifests and optional checkpoint bytes, without network/ML imports."""

import argparse
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]


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
    require(vision["size_bytes"] > 0, "Invalid checkpoint size")
    require(re.fullmatch(r"vision-model-v[0-9]+", vision["artifact_release_tag"]), "Invalid model release tag")
    require(vision["filename"] == "efficientnet_b2_best.pt", "Unexpected checkpoint filename")
    expected_source = ("https://github.com/tung51652-alt/Cooking-assistant/releases/download/"
                       + vision["artifact_release_tag"] + "/" + vision["filename"])
    require(vision["ci_source_uri"] == expected_source, "Unexpected vision release source")
    require(vision["provenance"]["public_distribution_authorized"] is True, "Missing project owner distribution permission")
    candidate = manifest["vision_candidate"]
    require(candidate["fallback_labels"] == ["other_food", "non_food"], "Unexpected candidate fallback class order")
    require(candidate["model_version"] != vision["model_version"] and candidate["filename"] != vision["filename"],
            "Candidate requires a distinct model version and filename")
    require(re.fullmatch(r"[a-z0-9_]+\.pt", candidate["filename"]) and candidate["size_bytes"] > 0
            and candidate["checkpoint_epoch"] > 0, "Invalid candidate checkpoint metadata")
    embedding = manifest["embedding"]
    require(embedding["dimension"] == 384, "Unexpected embedding dimension")
    require(embedding["normalize_l2"] and embedding["distance"] == "cosine", "Embedding normalization mismatch")
    require(embedding["query_prefix"] == "query: " and embedding["passage_prefix"] == "passage: ", "E5 prefix mismatch")
    require("model.safetensors" in embedding["required_files"], "Missing safetensors requirement")
    require("pytorch_model.bin" not in embedding["required_files"], "Duplicate model weight formats")
    if checkpoint is not None:
        artifact = candidate if checkpoint.name == candidate["filename"] else vision
        require(checkpoint.stat().st_size == artifact["size_bytes"], "Checkpoint size does not match manifest")
    print("PASS: input artifact manifest invariants")
    if checkpoint is not None:
        print("PASS: local checkpoint size matches the recorded artifact")
    print("Not a stack release approval: corpus coverage, runtime benchmarks and registry push access have later gates.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, help="Optional external checkpoint file to check")
    args = parser.parse_args()
    try:
        verify(args.checkpoint)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
