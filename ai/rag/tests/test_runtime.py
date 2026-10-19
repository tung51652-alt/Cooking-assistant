"""Run against a dedicated Qdrant and the real local model (see ai/rag/README.md)."""
import copy
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
import httpx

from ai.rag.api.main import create_app
from ai.rag.embeddings.local import Encoder
from ai.rag.ingestion.bundle import Bundle
from ai.rag.retrieval.store import ALIAS, Store


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = Path(os.environ["RECIPES_BUNDLE_DIR"])
        cls.bundle = Bundle(cls.directory)
        cls.store = Store(os.environ["QDRANT_URL"], cls.bundle)
        for _ in range(40):
            try:
                cls.store.client.get("/readyz").raise_for_status()
                break
            except httpx.HTTPError:
                time.sleep(.25)
        else:
            raise RuntimeError("Dedicated test Qdrant is not ready")
        cls.store.seed()
        cls.encoder = Encoder(os.environ["EMBEDDING_MODEL_DIR"])
        cls.context = TestClient(create_app(cls.bundle, cls.encoder, cls.store))
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def test_seed_is_idempotent_and_full_contents_match(self):
        self.store.seed()
        self.store.seed()
        self.store.validate_collection(points=True)

    def test_ties_use_recipe_id_and_filter_before_search(self):
        candidates = [p for p in self.bundle.points if p["payload"]["normalized_dish"] == "pho"]
        reply = {"points": [{"payload": p["payload"], "score": .5} for p in reversed(candidates)]}
        with patch.object(self.store, "call", return_value=reply) as call:
            result = self.store.search("pho", candidates[0]["vector"], 3)
            self.assertEqual([r["id"] for r, _ in result], sorted(p["payload"]["recipe_id"] for p in candidates))
            request = call.call_args.args[2]
            conditions = {c["key"]: c["match"]["value"] for c in request["filter"]["must"]}
            self.assertEqual(conditions, {"normalized_dish": "pho", "language": "vi", "cuisine": "vietnamese", **self.bundle.versions})
            self.assertTrue(request["params"]["exact"])

    def test_real_encoder_distinguishes_variants(self):
        cases = [("pho", "phở bò", "wb_pho_bo_ninh_xuong"),
                 ("pho", "phở gà", "wb_pho_ga"),
                 ("banh_canh", "bánh canh cua", "wb_banh_canh_cua"),
                 ("banh_canh", "bánh canh cá", "wb_banh_canh_ca"),
                 ("banh_bot_loc", "bánh bột lọc Huế gói lá chuối", "wb_banh_bot_loc_hue")]
        for dish, query, expected in cases:
            with self.subTest(query=query):
                response = self.client.post("/search", json={"confirmed_dish": dish, "query": query})
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body["recipes"][0]["id"], expected)
                self.assertTrue(all(r["normalized_dish"] == dish for r in body["recipes"]))
                self.assertTrue(all(-1 <= r["retrieval_score"] <= 1 for r in body["recipes"]))

    def test_catalog_detail_empty_and_errors(self):
        dishes = self.client.get("/dishes").json()["dishes"]
        self.assertEqual(len(dishes), 30)
        for dish in dishes:
            response = self.client.post("/search", json={"confirmed_dish": dish["normalized_dish"]})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["recipes"], dish["normalized_dish"])
            for preview in response.json()["recipes"]:
                detail = self.client.get("/recipes/" + preview["id"]).json()["recipe"]
                self.assertEqual(detail["normalized_dish"], dish["normalized_dish"])
                self.assertTrue(detail["ingredients"] and detail["instructions"])
        self.assertEqual(self.client.get("/health/ready").status_code, 200)
        recipe = self.bundle.recipes[0]
        response = self.client.get("/recipes/" + recipe["id"])
        self.assertEqual(response.json()["recipe"], recipe)
        UUID(response.headers["X-Request-ID"])
        missing = self.client.get("/recipes/unknown_recipe")
        self.assertEqual((missing.status_code, missing.json()["code"]), (404, "RECIPE_NOT_FOUND"))
        self.assertEqual(self.client.get("/recipes/invalid.id").status_code, 422)
        self.assertEqual(self.client.post("/search", json={"confirmed_dish": "Phở"}).json()["code"], "INVALID_DISH")

    def test_empty_result_contract_for_a_future_partial_corpus(self):
        # All 30 classes are now populated. Inject an empty candidate set only for this API contract regression.
        with patch.object(self.store, "search", return_value=[]):
            response = self.client.post("/search", json={"confirmed_dish": "banh_pia"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recipes"], [])

    def test_strict_input_and_bounded_json(self):
        for invalid in [True, 1.0, 0, 4, "3"]:
            with self.subTest(top_k=invalid):
                response = self.client.post("/search", json={"confirmed_dish": "pho", "top_k": invalid})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(set(response.json()), {"code", "message", "request_id"})
        for value in ["x" * 201, 4, True]:
            self.assertEqual(self.client.post("/search", json={"confirmed_dish": "pho", "query": value}).status_code, 422)
        self.assertEqual(self.client.post("/search", content="x" * 9000, headers={"Content-Type": "application/json"}).status_code, 413)
        self.assertEqual(self.client.post("/search", content="{}").status_code, 415)
        self.assertEqual(self.client.post("/search", content="{", headers={"Content-Type": "application/json"}).status_code, 422)
        self.assertEqual(self.client.post("/search", json={"confirmed_dish": "pho", "query": "   "}).status_code, 200)

    def test_dependency_error_is_safe(self):
        with patch.object(self.store, "ready", side_effect=httpx.ConnectError("sensitive internal connection context")), patch.object(self.store, "ready_async", side_effect=httpx.ConnectError("internal health context")):
            response = self.client.post("/search", json={"confirmed_dish": "pho"})
            self.assertEqual((response.status_code, response.json()["code"]), (503, "DEPENDENCY_NOT_READY"))
            self.assertNotIn("sensitive", response.text)
            self.assertEqual(self.client.get("/health/ready").status_code, 503)
        with patch.object(self.store, "ready", side_effect=httpx.ReadTimeout("internal timeout context")):
            self.assertEqual(self.client.post("/search", json={"confirmed_dish": "pho"}).status_code, 504)

    def test_four_request_admission_limit(self):
        arrived, release = threading.Barrier(5), threading.Event()
        vector = self.encoder.encode(["Phở"], query=True)

        def blocked(*args, **kwargs):
            arrived.wait(timeout=10)
            if not release.wait(timeout=10):
                raise RuntimeError("Admission test timed out")
            return vector

        with patch.object(self.encoder, "encode", side_effect=blocked), ThreadPoolExecutor(max_workers=4) as executor:
            requests = [executor.submit(self.client.post, "/search", json={"confirmed_dish": "pho"}) for _ in range(4)]
            try:
                arrived.wait(timeout=10)
                response = self.client.post("/search", json={"confirmed_dish": "pho"})
                self.assertEqual((response.status_code, response.json()["code"]), (503, "SERVICE_BUSY"))
            finally:
                release.set()
            self.assertTrue(all(future.result(timeout=10).status_code == 200 for future in requests))

    def test_failed_import_preserves_active_alias(self):
        candidate = copy.copy(self.bundle)
        candidate.collection = "cooklens_phase2_test_bad_candidate"
        store = Store(os.environ["QDRANT_URL"], candidate)
        before = store.aliases()[ALIAS]
        try:
            store.call("PUT", "/collections/" + candidate.collection, {"vectors": {"size": 768, "distance": "Cosine"}})
            with self.assertRaises(ValueError):
                store.seed()
            self.assertEqual(store.aliases()[ALIAS], before)
        finally:
            store.call("DELETE", "/collections/" + candidate.collection)
            store.close()

    def test_wrong_alias_is_not_ready(self):
        with patch.object(self.store, "aliases", return_value={ALIAS: "unrelated_version"}), patch.object(self.store, "ready_async", side_effect=ValueError("Active index version mismatch")):
            self.assertEqual(self.client.get("/health/ready").status_code, 503)
            response = self.client.post("/search", json={"confirmed_dish": "pho"})
            self.assertEqual(response.status_code, 503)

    def test_health_has_a_total_two_second_deadline(self):
        async def delayed():
            await asyncio.sleep(10)
        start = time.monotonic()
        with patch.object(self.store, "ready_async", side_effect=delayed):
            response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertLess(time.monotonic() - start, 3)

    def test_corrupt_vector_bundle_is_rejected(self):
        for mutation in [lambda v: v.update(corpus_version="other_version"),
                         lambda v: v["points"][0].update(vector=[0.0] * 384),
                         lambda v: v["points"][0].update(vector=[1.0]),
                         lambda v: v["points"][0]["vector"].__setitem__(0, float("nan"))]:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory)
                for name in ("corpus.json", "taxonomy.json", "manifest.json", "vectors.json"):
                    (path/name).write_bytes((self.directory/name).read_bytes())
                vectors = json.loads((path/"vectors.json").read_text())
                mutation(vectors)
                (path/"vectors.json").write_text(json.dumps(vectors))
                with self.assertRaises(ValueError):
                    Bundle(path)


if __name__ == "__main__":
    unittest.main()
