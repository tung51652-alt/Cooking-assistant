"""Real model/API regressions; run with the pinned checkpoint staged or FOOD_MODEL_PATH."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import csv
from dataclasses import replace
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
from threading import Event
import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from PIL import Image
import torch
from torchvision.models import EfficientNet_B2_Weights

from ai.cv.inference.errors import MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES
from ai.cv.inference.guard import RequestGuard, Runtime
from ai.cv.inference.inference import evaluation_transform, predict_image
from ai.cv.inference.main import create_app
from ai.cv.inference.schemas import PredictionResponse
from ai.cv.inference.model import ROOT, load_model

FIXTURE = Path(__file__).parent / 'fixtures/food.png'


class FoodApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.food = FIXTURE.read_bytes()
        cls.load_patch = patch('ai.cv.inference.model.torch.load', wraps=torch.load)
        cls.load_spy = cls.load_patch.start()
        cls.app = create_app()
        cls.client = TestClient(cls.app)
        try:
            cls.client.__enter__()
        except Exception:
            cls.load_patch.stop()
            raise
        cls.model = cls.app.state.runtime.model

    @classmethod
    def tearDownClass(cls):
        try:
            cls.client.__exit__(None, None, None)
        finally:
            cls.load_patch.stop()

    def upload(self, data=None, mime='image/png'):
        return self.client.post('/predict', files={'file': ('food.png', self.food if data is None else data, mime)})

    def test_real_image_contract_and_load_once(self):
        first, second = self.upload(), self.upload()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), second.json())
        result = first.json()
        self.assertEqual(set(result), {'model_version', 'taxonomy_version', 'predictions'})
        self.assertEqual(result['model_version'], self.model.model_version)
        self.assertEqual(result['taxonomy_version'], '1.0.0')
        predictions = result['predictions']
        fixture = json.loads((ROOT / 'docs/contracts/fixtures/vision-predict.json').read_text())
        PredictionResponse.model_validate(fixture)
        self.assertEqual(set(result), set(fixture))
        self.assertEqual([(p['class_id'], p['normalized_dish'], p['rank']) for p in predictions],
                         [(p['class_id'], p['normalized_dish'], p['rank']) for p in fixture['predictions']])
        self.assertEqual([p['rank'] for p in predictions], [1, 2, 3])
        self.assertEqual(len({p['class_id'] for p in predictions}), 3)
        self.assertEqual(predictions[0]['normalized_dish'], 'bun_dau_mam_tom')
        self.assertEqual(predictions[0]['display_name'], 'Bún đậu mắm tôm')
        scores = [p['confidence'] for p in predictions]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertTrue(all(0 <= score <= 1 for score in scores))
        self.assertLessEqual(sum(scores), 1.000001)
        self.assertEqual(self.load_spy.call_count, 1)
        UUID(first.headers['x-request-id'])

    def test_same_top1_and_transform_as_previous_inference(self):
        with Image.open(BytesIO(self.food)) as source:
            image = source.convert('RGB')
        preset = EfficientNet_B2_Weights.IMAGENET1K_V1.transforms()
        self.assertTrue(torch.equal(evaluation_transform(image), preset(image)))
        with torch.inference_mode():
            full = torch.softmax(self.model.network(preset(image).unsqueeze(0)), dim=1)[0]
        actual = predict_image(image, self.model)
        self.assertEqual(actual[0]['class_id'], int(full.argmax()))
        self.assertAlmostEqual(actual[0]['confidence'], full.max().item(), places=7)
        self.assertEqual(round(actual[0]['confidence'], 4), round(full.max().item(), 4))
        self.assertFalse(self.model.network.training)

    def test_forward_uses_inference_mode(self):
        observed = []
        def observe(network, args):
            observed.append((network.training, torch.is_inference_mode_enabled(), tuple(args[0].shape)))
        hook = self.model.network.register_forward_pre_hook(observe)
        try:
            self.assertEqual(self.upload().status_code, 200)
        finally:
            hook.remove()
        self.assertEqual(observed, [(False, True, (1, 3, 288, 288))])

    def test_ties_keep_class_order_and_nonfinite_output_fails(self):
        class ConstantNetwork(torch.nn.Module):
            def __init__(self, bad=False):
                super().__init__()
                self.bad = bad
            def forward(self, batch):
                return torch.full((1, 30), float('nan') if self.bad else 0.)
        image = Image.new('RGB', (32, 32))
        tied = predict_image(image, replace(self.model, network=ConstantNetwork()))
        self.assertEqual([p['class_id'] for p in tied], [0, 1, 2])
        self.assertAlmostEqual(sum(p['confidence'] for p in tied), 0.1, places=6)
        with self.assertRaises(ValueError):
            predict_image(image, replace(self.model, network=ConstantNetwork(True)))

    def test_mapping_matches_every_split_row_and_checkpoint(self):
        with (ROOT / 'data/processed/manifests/30vnfoods_clean_split_manifest.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 25032)
        self.assertEqual(sum(r['split'] == 'Test' for r in rows), 5004)
        for row in rows:
            self.assertEqual(self.model.classes[int(row['class_index'])], row['class_name'])
        self.assertEqual([d.original_label for d in self.model.dishes], list(self.model.classes))

    def test_grayscale_rgba_and_jpeg(self):
        with Image.open(BytesIO(self.food)) as source:
            for mode, fmt, mime in [('L', 'PNG', 'image/png'), ('RGBA', 'PNG', 'image/png'),
                                    ('RGB', 'JPEG', 'image/jpeg')]:
                with self.subTest(mode=mode):
                    buffer = BytesIO()
                    source.convert(mode).save(buffer, format=fmt)
                    self.assertEqual(self.upload(buffer.getvalue(), mime).status_code, 200)

    def test_invalid_upload_status_and_safe_envelope(self):
        cases = [(b'not-image', 'text/plain', 415), (b'bad', 'image/png', 400),
                 (b'', 'image/png', 400), (self.food[:100], 'image/png', 400),
                 (self.food, 'image/jpeg', 415), (b'x' * (MAX_UPLOAD_BYTES + 1), 'image/png', 413)]
        for data, mime, status in cases:
            with self.subTest(status=status, size=len(data)):
                response = self.upload(data, mime)
                self.assertEqual(response.status_code, status)
                self.assertEqual(set(response.json()), {'code', 'message', 'request_id'})
                self.assertEqual(response.headers['x-request-id'], response.json()['request_id'])
                UUID(response.json()['request_id'])
        self.assertEqual(self.client.post('/predict').status_code, 415)
        self.assertEqual(self.client.post('/predict', data={'missing': 'file'}).status_code, 415)
        self.assertEqual(self.client.post('/predict', files={'other': ('x.png', self.food, 'image/png')}).status_code, 422)
        self.assertEqual(self.client.post('/predict', files=[('file', ('a.png', self.food, 'image/png')),
                         ('file', ('b.png', self.food, 'image/png'))]).status_code, 422)
        self.assertEqual(self.client.post('/predict', files={'file': ('x.png', self.food, 'image/png')},
                                         data={'extra': 'field'}).status_code, 422)

    def test_frames_pixel_limit_and_bomb_are_rejected_before_inference(self):
        buffer = BytesIO()
        Image.new('RGB', (8, 8), 'red').save(buffer, format='PNG', save_all=True,
                                          append_images=[Image.new('RGB', (8, 8), 'blue')], duration=100)
        self.assertEqual(self.upload(buffer.getvalue()).status_code, 400)
        with patch('ai.cv.inference.images.MAX_PIXELS', 10):
            self.assertEqual(self.upload().status_code, 400)
        with patch.object(Image, 'MAX_IMAGE_PIXELS', 10):
            self.assertEqual(self.upload().status_code, 400)

    def test_health_and_swagger(self):
        self.assertEqual(self.client.get('/health/live').status_code, 200)
        ready = self.client.get('/health/ready')
        self.assertEqual(ready.json()['status'], 'ready')
        self.assertEqual(ready.json()['taxonomy_version'], '1.0.0')
        spec = self.client.get('/openapi.json').json()
        self.assertIn('multipart/form-data', spec['paths']['/predict']['post']['requestBody']['content'])
        self.assertEqual(self.client.get('/docs').status_code, 200)

    def test_inference_failure_is_safe_and_next_request_recovers(self):
        with patch('ai.cv.inference.main.predict_image', side_effect=RuntimeError('internal-only-detail')):
            with self.assertLogs('ai.cv.inference.main', level='ERROR') as captured:
                response = self.upload()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['code'], 'INTERNAL_ERROR')
        self.assertNotIn('internal-only-detail', response.text)
        self.assertNotIn('internal-only-detail', '\n'.join(captured.output))
        self.assertEqual(self.upload().status_code, 200)

    def test_busy_rejects_second_upload_without_blocking_health(self):
        entered, release = Event(), Event()
        original = predict_image
        def slow(image, model):
            entered.set()
            if not release.wait(timeout=10):
                raise RuntimeError('Test release timeout')
            return original(image, model)
        with patch('ai.cv.inference.main.predict_image', side_effect=slow), ThreadPoolExecutor(1) as pool:
            first = pool.submit(self.upload)
            try:
                self.assertTrue(entered.wait(timeout=5))
                second = self.upload()
                self.assertEqual(second.status_code, 503)
                self.assertEqual(second.json()['code'], 'SERVICE_BUSY')
                self.assertEqual(self.client.get('/health/ready').status_code, 200)
            finally:
                release.set()
            self.assertEqual(first.result(timeout=5).status_code, 200)

    def test_chunked_overflow_disconnect_timeout_and_slot_cleanup(self):
        async def run_case(mode):
            runtime = Runtime(model=self.model)
            sent = []
            async def unused(scope, receive, send):
                raise AssertionError('Rejected upload must not reach parser')
            async def receive():
                if mode == 'disconnect':
                    return {'type': 'http.disconnect'}
                if mode == 'timeout':
                    raise TimeoutError
                return {'type': 'http.request', 'body': b'x' * (1024 * 1024), 'more_body': True}
            async def send(message):
                sent.append(message)
            scope = {'type': 'http', 'path': '/predict', 'method': 'POST',
                     'headers': [(b'content-type', b'multipart/form-data; boundary=test')]}
            await RequestGuard(unused, runtime)(scope, receive, send)
            self.assertTrue(runtime.slot.acquire(blocking=False))
            runtime.slot.release()
            return [message['status'] for message in sent if message['type'] == 'http.response.start']
        for mode, status in [('overflow', [413]), ('timeout', [504]), ('disconnect', [])]:
            with self.subTest(mode=mode):
                self.assertEqual(asyncio.run(run_case(mode)), status)

    def test_declared_oversize_bad_length_and_request_id(self):
        for value, expected in [(str(MAX_REQUEST_BYTES + 1), 413), ('-1', 400)]:
            response = self.client.post('/predict', content=b'', headers={
                'content-type': 'multipart/form-data; boundary=test', 'content-length': value,
                'x-request-id': 'not-a-valid-id'})
            self.assertEqual(response.status_code, expected)
            UUID(response.headers['x-request-id'])


class LifecycleTests(unittest.TestCase):
    def test_unstarted_app_is_live_but_not_ready(self):
        client = TestClient(create_app())
        self.assertEqual(client.get('/health/live').status_code, 200)
        self.assertEqual(client.get('/health/ready').status_code, 503)
        self.assertEqual(client.post('/predict', files={'file': ('food.png', b'bad', 'image/png')}).status_code, 503)

    def test_startup_error_is_clear_and_sanitized(self):
        with patch('ai.cv.inference.main.load_model', side_effect=ValueError('internal-only-detail')):
            with self.assertLogs('ai.cv.inference.main', level='ERROR') as captured:
                with self.assertRaisesRegex(RuntimeError, 'invalid model or taxonomy artifact'):
                    with TestClient(create_app()):
                        pass
            self.assertNotIn('internal-only-detail', '\n'.join(captured.output))

    def test_checkpoint_and_taxonomy_mismatch_fail_startup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad = root / 'model.pt'
            bad.write_bytes(b'not-a-model')
            with patch.dict(os.environ, {'FOOD_MODEL_PATH': str(bad)}):
                with self.assertRaises(ValueError):
                    load_model()
            with patch.dict(os.environ, {'FOOD_MODEL_PATH': str(root / 'missing.pt')}):
                with self.assertRaises(OSError):
                    load_model()
            mapping = json.loads((ROOT / 'data/processed/30vnfoods-label-map.json').read_text())
            mapping['labels'][0]['original_label'] = 'Wrong label'
            taxonomy = root / 'mapping.json'
            taxonomy.write_text(json.dumps(mapping))
            with patch.dict(os.environ, {'FOOD_TAXONOMY_PATH': str(taxonomy)}):
                with self.assertRaises(ValueError):
                    load_model()


if __name__ == '__main__':
    unittest.main()
