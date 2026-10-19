"""Validate the distributed corpus without installing runtime or ML dependencies."""
import argparse
from collections import Counter
from datetime import date
import json
import math
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,79}")
RECIPE_FIELDS = set("id title normalized_dish language cuisine servings prep_time_minutes cook_time_minutes ingredients instructions tags source created_at updated_at".split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value):
    require(isinstance(value, str) and value.strip() == value and bool(value), "empty/invalid text")
    require(unicodedata.normalize("NFC", value) == value, "text must be NFC")
    require(not re.search(r"[<>\x00-\x08\x0b\x0c\x0e-\x1f]", value), "text must be plain")


def positive(value, integer=False):
    require(value is None or (type(value) in ((int,) if integer else (int, float))
            and math.isfinite(value) and value > 0), "invalid positive number")


def url(value):
    text(value)
    parsed = urlsplit(value)
    require(parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username
            and not parsed.password and not any(c.isspace() for c in value), "invalid source URL")


def validate(recipes, taxonomy):
    require(isinstance(recipes, list) and bool(recipes), "corpus must be a nonempty list")
    known = {item["normalized_dish"] for item in taxonomy["labels"]}
    ids, bodies, coverage = set(), set(), Counter()
    for recipe in recipes:
        require(type(recipe) is dict and set(recipe) == RECIPE_FIELDS, "recipe fields differ from schema")
        require(isinstance(recipe["id"], str) and ID.fullmatch(recipe["id"]), "invalid recipe ID")
        require(recipe["id"] not in ids, "duplicate recipe ID")
        ids.add(recipe["id"])
        for key in ("title", "normalized_dish", "created_at", "updated_at"):
            text(recipe[key])
        require(recipe["normalized_dish"] in known, "dish not in taxonomy")
        require(recipe["language"] == "vi" and recipe["cuisine"] == "vietnamese", "invalid locale")
        for key in ("servings", "prep_time_minutes", "cook_time_minutes"):
            positive(recipe[key], integer=True)
        for key in ("created_at", "updated_at"):
            date.fromisoformat(recipe[key])
        require(recipe["updated_at"] >= recipe["created_at"], "dates out of order")
        require(isinstance(recipe["ingredients"], list) and recipe["ingredients"], "missing ingredients")
        for item in recipe["ingredients"]:
            require(type(item) is dict and set(item) == set("name normalized_name quantity unit optional note".split()), "ingredient fields")
            text(item["name"])
            require(isinstance(item["normalized_name"], str) and re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)*", item["normalized_name"]), "invalid ingredient key")
            positive(item["quantity"])
            require(type(item["optional"]) is bool, "optional must be boolean")
            for key in ("unit", "note"):
                if item[key] is not None:
                    text(item[key])
        require(isinstance(recipe["instructions"], list) and recipe["instructions"], "missing instructions")
        for step, item in enumerate(recipe["instructions"], 1):
            require(type(item) is dict and set(item) == {"step", "text", "duration_minutes"}, "instruction fields")
            require(type(item["step"]) is int and item["step"] == step, "steps must be continuous")
            text(item["text"])
            positive(item["duration_minutes"], integer=True)
        require(isinstance(recipe["tags"], list) and len(recipe["tags"]) == len(set(recipe["tags"])), "invalid tags")
        for tag in recipe["tags"]:
            text(tag)
        source = recipe["source"]
        require(type(source) is dict and set(source) == set("name url license retrieved_at attribution revision_url modifications".split()), "source fields")
        for key in ("name", "license", "attribution", "modifications"):
            text(source[key])
        require(source["license"] in {"CC-BY-SA-4.0", "CC-BY-4.0", "MIT", "CC0-1.0"}, "license requires review")
        url(source["url"])
        if source["revision_url"] is not None:
            url(source["revision_url"])
        date.fromisoformat(source["retrieved_at"])
        # Compare normalized contents directly; no hash/checksum values are persisted.
        body = " ".join(i["name"] for i in recipe["ingredients"]) + " " + " ".join(s["text"] for s in recipe["instructions"])
        body = " ".join(body.casefold().split())
        require(body not in bodies, "duplicate recipe content")
        bodies.add(body)
        coverage[recipe["normalized_dish"]] += 1
    return {dish: coverage[dish] for dish in sorted(known)}


def load(root=ROOT):
    recipes = json.loads((root / "data/recipes/corpus.json").read_text())
    taxonomy = json.loads((root / "data/processed/30vnfoods-label-map.json").read_text())
    coverage = validate(recipes, taxonomy)
    manifest = json.loads((root / "data/recipes/manifest.json").read_text())
    require(manifest["coverage"] == coverage, "stale coverage manifest")
    require(manifest["recipe_count"] == len(recipes), "stale recipe count")
    require(manifest["covered_dishes"] == sum(bool(n) for n in coverage.values()), "stale dish count")
    require(manifest["taxonomy_version"] == "1.0.0", "incompatible taxonomy")
    return recipes, taxonomy, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-full-coverage", action="store_true")
    args = parser.parse_args()
    recipes, _, manifest = load()
    require(not args.require_full_coverage or manifest["covered_dishes"] == 30, "release requires 30 dishes")
    print(f"Validated {len(recipes)} recipes; coverage {manifest['covered_dishes']}/30")


if __name__ == "__main__":
    main()
