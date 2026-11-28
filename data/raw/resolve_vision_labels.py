"""Generate the pilot's effective labels from an unchanged photo manifest."""
import argparse
import json
import re
from pathlib import Path

KEY = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")
FALLBACKS = {"non_food", "other_food"}
ROOT = Path(__file__).resolve().parent


def resolve_labels(records, promotions):
    if not isinstance(promotions, dict):
        raise ValueError("Promotions must be a JSON object of dish_key to label.")
    dishes = {row["dish_key"] for row in records if row["collection_label"] == "other_food"}
    for dish, label in promotions.items():
        if dish not in dishes:
            raise ValueError(f"Unknown dish_key: {dish}")
        if not isinstance(label, str) or not KEY.fullmatch(label) or label in FALLBACKS:
            raise ValueError(f"Invalid target label for {dish}")

    result = []
    for row in records:
        label = row["collection_label"]
        if label == "other_food":
            label = promotions.get(row["dish_key"], label)
        result.append({**row, "label": label})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.jsonl")
    parser.add_argument("--promotions", type=Path, default=ROOT / "promotions.json")
    parser.add_argument("--output", type=Path, default=ROOT / "effective-labels.jsonl")
    args = parser.parse_args()
    if args.output.resolve() in {args.manifest.resolve(), args.promotions.resolve()}:
        parser.error("Choose a separate output path so the manifest and mapping stay intact.")

    records = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line]
    promotions = json.loads(args.promotions.read_text(encoding="utf-8"))
    effective = resolve_labels(records, promotions)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        for row in effective:
            output.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(effective)} effective labels.")


if __name__ == "__main__":
    main()
