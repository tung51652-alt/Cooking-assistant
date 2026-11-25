"""Validate release inputs and precompute vectors once, before image build."""
import argparse
import json
import math
from pathlib import Path
import re

from data.recipes.validate import load, require, validate


class Bundle:
    def __init__(self, directory):
        directory = Path(directory)
        self.recipes = json.loads((directory / "corpus.json").read_text())
        self.taxonomy = json.loads((directory / "taxonomy.json").read_text())
        self.manifest = json.loads((directory / "manifest.json").read_text())
        coverage = validate(self.recipes, self.taxonomy)
        require(coverage == self.manifest["coverage"] and len(self.recipes) == self.manifest["recipe_count"], "Corpus manifest mismatch")
        self.vectors = json.loads((directory / "vectors.json").read_text())
        self.versions = {"corpus_version": self.manifest["corpus_version"],
                         "embedding_version": "multilingual-e5-small-v1", "taxonomy_version": "1.0.0"}
        require(isinstance(self.versions["corpus_version"], str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,60}", self.versions["corpus_version"]), "Invalid corpus version")
        require(len(self.taxonomy["labels"]) == 30 and [d["class_id"] for d in self.taxonomy["labels"]] == list(range(30)), "Invalid taxonomy order")
        require(len({d["normalized_dish"] for d in self.taxonomy["labels"]}) == 30, "Invalid taxonomy keys")
        require(self.manifest["taxonomy_version"] == "1.0.0", "Taxonomy version mismatch")
        require(all(self.vectors.get(k) == v for k, v in self.versions.items()), "Vector version mismatch")
        require(self.vectors["dimension"] == 384 and self.vectors["passage_template_version"] == "recipe-plain-v1", "Vector configuration mismatch")
        self.by_id = {r["id"]: r for r in self.recipes}
        self.dishes = {d["normalized_dish"]: d for d in self.taxonomy["labels"]}
        points = self.vectors["points"]
        require(len(points) == len(self.recipes), "Vector count mismatch")
        require({p["recipe_id"] for p in points} == set(self.by_id), "Vector recipe mismatch")
        require([p["id"] for p in points] == list(range(1, len(points) + 1)), "Point IDs must be ordered positive integers")
        for point in points:
            vector = point["vector"]
            require(len(vector) == 384 and all(type(x) in (int, float) and math.isfinite(x) for x in vector), "Invalid vector")
            require(abs(sum(x*x for x in vector) - 1) < 0.0001, "Vector must be normalized")
        self.collection = "cooklens_" + self.versions["corpus_version"].replace("-", "_") + "_e5_small_v1"
        self.points = [{"id": p["id"], "vector": p["vector"],
                        "payload": {"recipe_id": p["recipe_id"], **self.versions,
                                    **{k: self.by_id[p["recipe_id"]][k] for k in ("normalized_dish", "language", "cuisine")}}}
                       for p in points]


def build(root, model, output):
    from ai.rag.embeddings.local import Encoder, passage
    recipes, taxonomy, manifest = load(root)
    encoder = Encoder(model)
    points = []
    # Bounded batches keep memory below the server's deployment budget.
    for offset in range(0, len(recipes), 8):
        batch = recipes[offset:offset + 8]
        for recipe, vector in zip(batch, encoder.encode([passage(r) for r in batch]), strict=True):
            points.append({"id": len(points) + 1, "recipe_id": recipe["id"], "vector": vector})
    output.mkdir(parents=True, exist_ok=True)
    files = {"corpus.json": recipes, "taxonomy.json": taxonomy, "manifest.json": manifest,
             "vectors.json": {"corpus_version": manifest["corpus_version"], "embedding_version": "multilingual-e5-small-v1",
                              "taxonomy_version": "1.0.0", "dimension": 384,
                              "passage_template_version": "recipe-plain-v1", "points": points}}
    for name, content in files.items():
        (output / name).write_text(json.dumps(content, ensure_ascii=False, allow_nan=False) + "\n")
    Bundle(output)
    print(f"Validated release bundle: {len(recipes)} recipes, 384-dimensional vectors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.root, args.model, args.output)
