"""Prepare audited inputs for the EfficientNet-B2 fallback experiment."""

import argparse
import csv
import hashlib
import io
import json
import random
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from PIL import Image, ImageOps

from data.raw.resolve_vision_labels import FALLBACKS, resolve_labels

ROOT = Path(__file__).resolve().parents[3]
BASE_MANIFEST = ROOT / "data/processed/manifests/30vnfoods_clean_split_manifest.csv"
RELEASE_MANIFEST = ROOT / "deploy/artifacts/manifest.json"
TAXONOMY = ROOT / "data/processed/30vnfoods-label-map.json"
SPLITS = {"Train": "train", "Validate": "validation", "Test": "test"}
FALLBACK_ORDER = ("other_food", "non_food")
FALLBACK_LIMITS = {"train": 150, "validation": 25, "test": 25}
FIXED_TOTALS = {"train": 17527, "validation": 2501, "test": 5004}


@dataclass(frozen=True)
class ImageIdentity:
    digest: bytes
    gradients: tuple[tuple[int, int], tuple[int, int]]


def image_identity(raw):
    with Image.open(io.BytesIO(raw)) as photo:
        thumbnail = ImageOps.exif_transpose(photo).convert("L").resize((9, 9), Image.Resampling.LANCZOS)
    pixels = thumbnail.tobytes()

    def gradients(columns):
        horizontal = vertical = 0
        for y in range(8):
            for c, x in enumerate(columns[:8]):
                pixel = pixels[y * 9 + x]
                horizontal = (horizontal << 1) | (pixel > pixels[y * 9 + columns[c + 1]])
                vertical = (vertical << 1) | (pixel > pixels[(y + 1) * 9 + x])
        return horizontal, vertical

    return ImageIdentity(hashlib.sha256(raw).digest(), (gradients(range(9)), gradients(range(8, -1, -1))))


def possible_match(first, second):
    return first.digest == second.digest or any(
        (h1 ^ h2).bit_count() <= 4 and (v1 ^ v2).bit_count() <= 4
        for h1, v1 in first.gradients for h2, v2 in second.gradients[:1]
    )


def gradient_buckets(horizontal):
    # Five disjoint segments ensure at least one match within four changed bits.
    return ((offset, (horizontal >> offset) & 8191) for offset in range(0, 64, 13))


def balance_fallback(photos, limit):
    def available(label):
        return sorted(
            (row for row in photos if row["label"] == label),
            key=lambda row: (not row["selected_for_pilot"], row["id"]),
        )

    food, scenes = available("other_food"), available("non_food")
    count = min(len(food), len(scenes) // 2, limit)
    promoted = [row for row in photos if row["label"] not in FALLBACKS]
    return food[:count] + scenes[:2 * count] + promoted


def sample_epoch(groups, non_food_index, draws_per_class, seed):
    rng = random.Random(seed)
    draws = []
    for class_index, indices in sorted(groups.items()):
        remaining = draws_per_class * (2 if class_index == non_food_index else 1)
        if not indices or remaining <= 0:
            raise ValueError("Each training class must have images and a positive draw count.")
        while remaining:
            size = min(remaining, len(indices))
            draws.extend(rng.sample(indices, size))
            remaining -= size
    rng.shuffle(draws)
    return draws


def file_under(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"Missing or invalid image path: {name}")
    return path


def baseline_rows(manifest, classes):
    with manifest.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    result = defaultdict(list)
    seen = set()
    for row in rows:
        split = SPLITS[row["split"]]
        index = int(row["class_index"])
        path = PurePosixPath(row["relative_path"])
        if not 0 <= index < len(classes) or row["class_name"] != classes[index]:
            raise ValueError("The clean split class order differs from the checkpoint.")
        if len(path.parts) != 3 or path.parts[0] != row["split"] or path.parent.name != classes[index] or path in seen:
            raise ValueError(f"Invalid or repeated clean split entry: {path}")
        seen.add(path)
        result[split].append({"source": "baseline", "lookup": "/".join(path.parts[-2:]), "class_index": index})
    if {split: len(items) for split, items in result.items()} != FIXED_TOTALS:
        raise ValueError("Expected all three original clean splits.")
    if any({r["class_index"] for r in items} != set(range(len(classes))) for items in result.values()):
        raise ValueError("Each original split must cover the checkpoint's dish classes.")
    return result


def index_archive(archive, expected):
    found = {}
    for entry in archive.infolist():
        parts = PurePosixPath(entry.filename.replace("\\", "/")).parts
        lookup = "/".join(parts[-2:])
        if not entry.is_dir() and lookup in expected:
            if lookup in found:
                raise ValueError(f"Ambiguous source archive member: {lookup}")
            found[lookup] = entry
    missing = expected - found.keys()
    if missing:
        raise ValueError(f"{len(missing)} clean split entries are missing from {archive.filename}.")
    return found


def read_fallback(root, promotions):
    with (root / "manifest.jsonl").open(encoding="utf-8") as source:
        rows = resolve_labels([json.loads(line) for line in source if line.strip()], promotions)
    candidates, excluded = {}, []
    groups, ids, paths = {}, set(), set()
    for row in rows:
        identifier = row["id"]
        if identifier in ids or row["path"] in paths:
            raise ValueError(f"Repeated fallback ID or path: {identifier}")
        ids.add(identifier)
        paths.add(row["path"])
        if row["review_status"] != "screened_candidate":
            excluded.append({"id": identifier, "reason": row["review_status"]})
            continue
        split = row["split"]
        group = row["split_group"]
        if split not in FIXED_TOTALS or groups.setdefault(group, split) != split:
            raise ValueError(f"Fallback group crosses splits: {group}")
        if not row["source_url"] or not row["license_url"]:
            raise ValueError(f"Source metadata missing for {identifier}")
        fingerprint = image_identity(file_under(root, row["path"]).read_bytes())
        duplicate = next((old for old, (_, fp) in candidates.items() if possible_match(fingerprint, fp)), None)
        if duplicate:
            excluded.append({"id": identifier, "reason": "possible_fallback_duplicate", "match": duplicate})
        else:
            candidates[identifier] = row, fingerprint
    return candidates, excluded


def audit_baseline(archives, baseline, candidates):
    exact = {}
    nearby = defaultdict(set)
    for identifier, (_, fingerprint) in candidates.items():
        exact[fingerprint.digest] = identifier
        for key in gradient_buckets(fingerprint.gradients[0][0]):
            nearby[key].add(identifier)

    def audit_split(item):
        split, rows = item
        matches = {}
        with ZipFile(archives / f"{split}.zip") as archive:
            members = index_archive(archive, {row["lookup"] for row in rows})
            for row in rows:
                entry = members[row.pop("lookup")]
                row["path"] = entry.filename
                row["split"] = split
                fingerprint = image_identity(archive.read(entry))
                pool = {exact.get(fingerprint.digest)}
                for horizontal, _ in fingerprint.gradients:
                    for key in gradient_buckets(horizontal):
                        pool.update(nearby.get(key, ()))
                for identifier in sorted(pool.intersection(candidates).difference(matches)):
                    if possible_match(fingerprint, candidates[identifier][1]):
                        matches[identifier] = {"id": identifier, "reason": "possible_baseline_duplicate",
                                               "match": entry.filename, "match_split": split}
        print(f"Scanned {len(rows)} original {split} photos.", flush=True)
        return matches

    all_matches = {}
    with ThreadPoolExecutor(max_workers=len(baseline)) as pool:
        for matches in pool.map(audit_split, baseline.items()):
            for identifier, record in matches.items():
                all_matches.setdefault(identifier, record)
    return all_matches


def prepare(archives, fallback, manifest, promotions):
    classes = json.loads(RELEASE_MANIFEST.read_text(encoding="utf-8"))["vision"]["class_labels"]
    existing = {row["normalized_dish"] for row in json.loads(TAXONOMY.read_text(encoding="utf-8"))["labels"]}
    if isinstance(promotions, dict) and any(isinstance(label, str) and label in existing for label in promotions.values()):
        raise ValueError("A promotion target overlaps with the existing dish taxonomy.")
    baseline = baseline_rows(manifest, classes)
    candidates, excluded = read_fallback(fallback, promotions)
    matches = audit_baseline(archives, baseline, candidates)
    excluded.extend(matches.values())

    photos = [row for identifier, (row, _) in candidates.items() if identifier not in matches]
    selected = [
        row for split, limit in FALLBACK_LIMITS.items()
        for row in balance_fallback([r for r in photos if r["split"] == split], limit)
    ]
    extra = sorted({row["label"] for row in selected} - FALLBACKS)
    labels = classes + list(FALLBACK_ORDER) + extra
    if len(labels) != len(set(labels)):
        raise ValueError("An experimental label conflicts with a baseline label.")
    if any(
        {row["label"] for row in selected if row["split"] == split} != set(labels[len(classes):])
        for split in FIXED_TOTALS
    ):
        raise ValueError("Each additional label needs screened images in every split.")
    indexes = {name: i for i, name in enumerate(labels)}
    combined = [row for rows in baseline.values() for row in rows]
    combined.extend({
        "source": "fallback", "path": row["path"], "id": row["id"], "split": row["split"],
        "class_index": indexes[row["label"]],
    } for row in selected)
    counts = {split: dict(Counter(row["label"] for row in selected if row["split"] == split))
              for split in FIXED_TOTALS}
    return {"classes": labels, "baseline_classes": len(classes), "fallback_counts": counts,
            "promotions": promotions,
            "excluded_fallback": excluded, "images": combined}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archives", type=Path, required=True)
    parser.add_argument("--fallback", type=Path, required=True)
    parser.add_argument("--base-manifest", type=Path, default=BASE_MANIFEST)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    promos = json.loads((args.fallback / "promotions.json").read_text(encoding="utf-8"))
    if args.output.resolve() in {
        (args.fallback / name).resolve() for name in ("manifest.jsonl", "promotions.json", "effective-labels.jsonl")
    } | {args.base_manifest.resolve()}:
        parser.error("Choose a new file for the prepared dataset.")
    if args.output.exists():
        parser.error("The preparation output already exists. Choose a new file.")
    result = prepare(args.archives, args.fallback, args.base_manifest, promos)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Write the completed audit only after all three archives have been checked.
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(json.dumps(result["fallback_counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
