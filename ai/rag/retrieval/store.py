"""Small Qdrant REST adapter shared by the API and one-shot initializer."""
import math

import httpx

from data.recipes.validate import require

ALIAS = "cooklens_recipes_active"


class Store:
    def __init__(self, url, bundle):
        self.bundle = bundle
        self.client = httpx.Client(base_url=url, timeout=2, trust_env=False)

    def close(self):
        self.client.close()

    def call(self, method, path, body=None):
        response = self.client.request(method, path, json=body)
        response.raise_for_status()
        return response.json()["result"]

    def aliases(self):
        return {a["alias_name"]: a["collection_name"] for a in self.call("GET", "/aliases")["aliases"]}

    def validate_collection(self, *, points=False):
        bundle = self.bundle
        collection = bundle.collection
        result = self.call("GET", f"/collections/{collection}")
        config = result["config"]["params"]["vectors"]
        require(config["size"] == 384 and config["distance"] == "Cosine", "Index configuration mismatch")
        require(result["status"] == "green" and result["points_count"] == len(bundle.points), "Index count/status mismatch")
        required = {"normalized_dish", "language", "cuisine", "corpus_version", "embedding_version", "taxonomy_version"}
        require(required <= set(result["payload_schema"]), "Missing payload indices")
        if points:
            found, offset = {}, None
            while True:
                body = {"limit": 100, "with_payload": True, "with_vector": True}
                if offset is not None:
                    body["offset"] = offset
                result = self.call("POST", f"/collections/{collection}/points/scroll", body)
                found.update({p["id"]: p for p in result["points"]})
                offset = result["next_page_offset"]
                if offset is None:
                    break
            require(set(found) == {p["id"] for p in bundle.points}, "Stored point IDs mismatch")
            for point in bundle.points:
                actual = found[point["id"]]
                require(actual["payload"] == point["payload"], "Stored payload mismatch")
                require(len(actual["vector"]) == 384 and all(abs(a-b) < 0.00001 for a,b in zip(actual["vector"], point["vector"], strict=True)), "Stored vector mismatch")

    def ready(self):
        require(self.aliases().get(ALIAS) == self.bundle.collection, "Active index version mismatch")
        self.validate_collection()

    def seed(self):
        bundle = self.bundle
        aliases = self.aliases()
        existing = self.client.get(f"/collections/{bundle.collection}")
        if existing.status_code == 200:
            # Never overwrite an existing version, particularly the active one.
            self.validate_collection(points=True)
        elif existing.status_code == 404:
            self.call("PUT", f"/collections/{bundle.collection}", {"vectors": {"size": 384, "distance": "Cosine"}})
            for field in ("normalized_dish", "language", "cuisine", "corpus_version", "embedding_version", "taxonomy_version"):
                self.call("PUT", f"/collections/{bundle.collection}/index?wait=true", {"field_name": field, "field_schema": "keyword"})
            self.call("PUT", f"/collections/{bundle.collection}/points?wait=true", {"points": bundle.points})
            self.validate_collection(points=True)
        else:
            existing.raise_for_status()
        # Alias changes are atomic in Qdrant. Refuse concurrent initializer changes.
        require(self.aliases() == aliases, "Active alias changed during import")
        if aliases.get(ALIAS) != bundle.collection:
            actions = ([{"delete_alias": {"alias_name": ALIAS}}] if ALIAS in aliases else [])
            actions.append({"create_alias": {"collection_name": bundle.collection, "alias_name": ALIAS}})
            self.call("POST", "/collections/aliases", {"actions": actions})
        self.ready()

    def search(self, dish, vector, top_k):
        bundle = self.bundle
        conditions = {"normalized_dish": dish, "language": "vi", "cuisine": "vietnamese", **bundle.versions}
        # ponytail: exact search returns all matching recipes to settle score ties by ID.
        # This is bounded by the small MVP corpus; add server-side pagination for a larger corpus.
        result = self.call("POST", f"/collections/{bundle.collection}/points/query", {
            "query": vector, "filter": {"must": [{"key": k, "match": {"value": v}} for k,v in conditions.items()]},
            "limit": len(bundle.points), "with_payload": True, "params": {"exact": True}})
        ranked = []
        for point in result["points"]:
            recipe = bundle.by_id[point["payload"]["recipe_id"]]
            require(all(point["payload"].get(k) == v for k,v in conditions.items()) and recipe["normalized_dish"] == dish, "Search filter mismatch")
            score = point["score"]
            require(type(score) in (int, float) and math.isfinite(score) and -1.00001 <= score <= 1.00001, "Invalid similarity")
            ranked.append((recipe, max(-1., min(1., score))))
        ranked.sort(key=lambda pair: (-pair[1], pair[0]["id"]))
        return ranked[:top_k]
