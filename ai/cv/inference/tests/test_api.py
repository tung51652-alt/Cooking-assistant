"""Integration checks against the real checkpoint and food photo in the notebook.

Run: python -m unittest discover -s ai/cv/inference/tests -v
Requires the API dependencies plus httpx.
"""

import ast
import base64
import csv
from io import BytesIO
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
import torch
from torchvision.models import EfficientNet_B2_Weights

from ai.cv.inference.inference import evaluation_transform
from ai.cv.inference.main import app, MAX_UPLOAD_BYTES
from ai.cv.inference.model import DEFAULT_CHECKPOINT


ROOT = Path(__file__).resolve().parents[4]


class FoodApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.notebook = json.loads(
            (ROOT / "ai/cv/training/Cooklen_30VNFoods.ipynb").read_text(encoding="utf-8")
        )
        # The uploaded food photo is preserved in cell 20 as a rendered figure.
        outputs = cls.notebook["cells"][20]["outputs"]
        encoded = next(o["data"]["image/png"] for o in outputs if "image/png" in o.get("data", {}))
        cls.food_bytes = base64.b64decode("".join(encoded))
        cls.load_patch = patch("ai.cv.inference.model.torch.load", wraps=torch.load)
        cls.load_spy = cls.load_patch.start()
        cls.client = TestClient(app)
        try:
            cls.client.__enter__()
        except Exception:
            cls.load_patch.stop()
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            cls.client.__exit__(None, None, None)
            if cls.load_spy.call_count != 1:
                raise AssertionError(f"Checkpoint loaded {cls.load_spy.call_count} times")
        finally:
            cls.load_patch.stop()

    def upload(self, contents, content_type="image/png"):
        return self.client.post("/predict", files={"file": ("food.png", contents, content_type)})

    def test_root_and_health(self):
        self.assertEqual(self.client.get("/").json(), {"message": "Food Classification API is running"})
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "model_loaded": True})

    def test_real_food_and_model_loaded_once(self):
        def check_forward(network, args):
            self.assertFalse(network.training)
            self.assertTrue(torch.is_inference_mode_enabled())
            self.assertEqual(args[0].device, next(network.parameters()).device)
            self.assertEqual(tuple(args[0].shape), (1, 3, 288, 288))

        hook = app.state.model.network.register_forward_pre_hook(check_forward)
        try:
            first = self.upload(self.food_bytes)
            second = self.upload(self.food_bytes)
        finally:
            hook.remove()
        self.assertEqual(first.status_code, 200, first.text)
        result = first.json()
        self.assertEqual(result, second.json())
        self.assertEqual(set(result), {"label", "class_id", "confidence"})
        self.assertEqual(result["label"], "Bun dau mam tom")
        self.assertEqual(result["class_id"], 15)
        self.assertGreater(result["confidence"], 0.9)
        self.assertLessEqual(result["confidence"], 1.0)
        self.assertEqual(self.load_spy.call_count, 1)
        print("\nReal food HTTP 200:", json.dumps(result))

    def test_mapping_matches_training_artifacts(self):
        labels = json.loads(DEFAULT_CHECKPOINT.with_name("classes.json").read_text(encoding="utf-8"))
        self.assertEqual(list(app.state.model.classes), labels)
        with (ROOT / "data/processed/manifests/30vnfoods_clean_split_manifest.csv").open(encoding="utf-8", newline="") as stream:
            mapping = {(int(row["class_index"]), row["class_name"]) for row in csv.DictReader(stream)}
        self.assertEqual(mapping, set(enumerate(labels)))

    def test_preprocessing_matches_notebook(self):
        source = "".join(self.notebook["cells"][8]["source"])
        assignment = next(
            node for node in ast.parse(source).body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "evaluation_transform" for target in node.targets)
        )
        namespace = {"weights": EfficientNet_B2_Weights.DEFAULT}
        exec(compile(ast.Module(body=[assignment], type_ignores=[]), "training-transform", "exec"), namespace)
        with Image.open(BytesIO(self.food_bytes)) as source_image:
            image = source_image.convert("RGB")
        actual = evaluation_transform(image)
        expected = namespace["evaluation_transform"](image)
        self.assertTrue(torch.equal(actual, expected))
        self.assertTrue(torch.equal(actual, evaluation_transform(image)))

    def test_grayscale_and_rgba_are_converted_to_rgb(self):
        with Image.open(BytesIO(self.food_bytes)) as source:
            for mode in ["L", "RGBA"]:
                with self.subTest(mode=mode):
                    buffer = BytesIO()
                    source.convert(mode).save(buffer, format="PNG")
                    self.assertEqual(self.upload(buffer.getvalue()).status_code, 200)

    def test_invalid_uploads(self):
        self.assertEqual(self.upload(b"not an image", "text/plain").status_code, 400)
        self.assertEqual(self.upload(b"not an image").status_code, 400)
        self.assertEqual(self.upload(b"").status_code, 400)
        self.assertEqual(self.upload(self.food_bytes[:100]).status_code, 400)
        self.assertEqual(self.upload(b"x" * (MAX_UPLOAD_BYTES + 1)).status_code, 400)
        self.assertEqual(self.client.post("/predict").status_code, 422)

    def test_inference_failure_does_not_expose_internal_details(self):
        with patch("ai.cv.inference.main.predict_image", side_effect=RuntimeError("private path/trace")):
            with self.assertLogs("ai.cv.inference.main", level="ERROR"):
                response = self.upload(self.food_bytes)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Model inference failed"})


if __name__ == "__main__":
    unittest.main()
