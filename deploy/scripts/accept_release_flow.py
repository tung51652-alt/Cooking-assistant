#!/usr/bin/env python3
"""Run 30 labeled photo flows, retrieval evaluation and browsers on public images.

Uses an isolated Compose project and removes only its own containers and volume.
The external archive is never copied into application images or into Git.
"""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from uuid import uuid4
from zipfile import ZipFile

from PIL import Image

from recipe_evaluation import evaluate_in_container

ROOT = Path(__file__).resolve().parents[2]


def run(archive, report, out_of_domain=None, bundle=None):
    project = 'cooklens-acceptance-' + uuid4().hex[:12]
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    env = {**os.environ, 'HOST_BIND': '127.0.0.1', 'HOST_PORT': str(port), 'LLM_API_KEY': ''}
    base = f'http://127.0.0.1:{port}'
    version = '2.0.0-rc.2'
    compose_path = ROOT / 'compose.yaml'
    if bundle is not None:
        compose_path = (bundle / 'compose.yaml').resolve()
        metadata = json.loads((bundle / 'candidate.json').read_text(encoding='utf-8'))
        version = metadata['application_candidate']
        config = json.loads(compose_path.read_text(encoding='utf-8'))
        if {name: service['image'] for name, service in config['services'].items()} != metadata['images']:
            raise ValueError('Candidate flow must use the Compose that matches its metadata')
    compose = ['docker', 'compose', '-p', project, '-f', str(compose_path)]
    scratch = tempfile.TemporaryDirectory(prefix='cooklens-photo-acceptance-')

    def dc(*args):
        return subprocess.check_output([*compose, *args], env=env)

    def api(path, data=None, mime='application/json', expected=(200,)):
        try:
            response = urlopen(Request(base + path, data=data, headers={'Content-Type': mime}), timeout=30)
        except HTTPError as error:
            response = error
        with response:
            assert response.status in expected, (path, response.status, expected)
            return response.status, json.load(response)

    def upload(contents):
        boundary = 'cooklens-photo-boundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\n'
                'Content-Type: image/jpeg\r\n\r\n').encode() + contents + f'\r\n--{boundary}--\r\n'.encode()
        return body, f'multipart/form-data; boundary={boundary}'

    try:
        dc('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '240')
        labels = json.loads((ROOT / 'data/processed/30vnfoods-label-map.json').read_text())['labels']
        selected = {}
        with (ROOT / 'data/processed/manifests/30vnfoods_clean_split_manifest.csv').open() as source:
            for row in csv.DictReader(source):
                if row['split'] == 'Test':
                    selected.setdefault(int(row['class_index']), row)
        assert set(selected) == set(range(30))
        cases, montage_parts = [], []
        with ZipFile(archive) as images:
            members = {'/'.join(n.split('/')[-2:]): n for n in images.namelist() if not n.endswith('/')}
            for index, row in sorted(selected.items()):
                key = '/'.join(row['relative_path'].split('/')[-2:])
                with Image.open(io.BytesIO(images.read(members[key]))) as image:
                    if index < 2:
                        montage_parts.append(image.convert('RGB').resize((256, 256)))
                    encoded = io.BytesIO()
                    image.convert('RGB').save(encoded, format='JPEG')
                body, mime = upload(encoded.getvalue())
                status, prediction = api('/api/vision/predict', body, mime, expected=(200, 422))
                rejection = None
                suggestions = []
                if status == 200:
                    suggestions = prediction['predictions']
                    assert len(suggestions) == 3
                else:
                    rejection = prediction['code']
                    assert rejection in ('IMAGE_BLURRY', 'LOW_CONFIDENCE_PREDICTION'), rejection
                    assert 'predictions' not in prediction
                dish = labels[index]['normalized_dish']
                # The chosen dish is sent explicitly, including after a vision rejection.
                _, results = api('/api/recipes/search', json.dumps({'confirmed_dish': dish, 'top_k': 3}).encode())
                recipes = results['recipes']
                assert 1 <= len(recipes) <= 3 and all(r['normalized_dish'] == dish for r in recipes)
                _, document = api('/api/recipes/' + recipes[0]['id'])
                detail = document['recipe']
                assert detail['normalized_dish'] == dish and detail['ingredients'] and detail['instructions'] and detail['source']
                cases.append({'dish': dish, 'top3_contains_expected': any(p['class_id'] == index for p in suggestions),
                              'top1_confidence': suggestions[0]['confidence'] if suggestions else None,
                              'vision_rejection': rejection,
                              'confirmed_dish_flow_passed': True})
        for contents, status, code in [(b'not an image', 400, 'INVALID_IMAGE'),
                                       (b'x' * (10 * 1024 * 1024 + 1), 413, 'UPLOAD_TOO_LARGE')]:
            body, mime = upload(contents)
            _, failure = api('/api/vision/predict', body, mime, expected=(status,))
            assert failure['code'] == code
        api('/api/recipes/search', b'{"confirmed_dish":"pizza"}', expected=(422,))
        api('/api/recipes/not_a_recipe', expected=(404,))
        # Evaluate inside the released recipes image: no model or network port added on host.
        container = dc('ps', '-q', 'recipes').decode().strip()
        retrieval = evaluate_in_container(container)
        assert retrieval['technical_gate_met']
        browser_env = {**env, 'COOKLENS_REAL_API': '1', 'COOKLENS_REAL_ASSISTANT': '0', 'COOKLENS_BASE_URL': base,
                       'COOKLENS_CAPTURE_BASELINES': '1',
                       'COOKLENS_CAPTURE_DIRECTORY': str(report.resolve().parent / 'phase-7-ui')}
        if out_of_domain:
            browser_env['COOKLENS_OOD_IMAGE'] = str(out_of_domain.resolve())
        montage = Image.new('RGB', (512, 256))
        for number, image in enumerate(montage_parts):
            montage.paste(image, (number * 256, 0))
        multi_path = Path(scratch.name) / 'multiple-dishes.jpg'
        montage.save(multi_path)
        browser_env['COOKLENS_MULTI_IMAGE'] = str(multi_path)
        browser = subprocess.run(['npm', 'run', 'test:e2e', '--', '--reporter=json'], cwd=ROOT / 'frontend',
                                 env=browser_env, capture_output=True, text=True)
        # npm prepends its script banner to the Playwright JSON reporter.
        browser_report = json.loads(browser.stdout[browser.stdout.index('{'):])
        assert browser.returncode == 0, 'Real browser tests failed'
        result = {'application_candidate': version, 'photo_selection': 'First clean-test manifest entry per class; no prediction-based selection',
                  'invalid_image_rejected': True, 'oversized_upload_rejected': True,
                  'unknown_dish_rejected': True, 'missing_recipe_returns_404': True,
                  'photo_flows': cases, 'retrieval': retrieval, 'browser_stats': browser_report['stats'],
                  'limitations': '30 photo flows are a smoke sample, not the full CV accuracy gate. '
                                 'External recipe review and cooking verification are separate acceptance gates.'}
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print('PASS: 30 photo flows, retrieval technical gate and real desktop/mobile browsers')
    finally:
        scratch.cleanup()
        subprocess.run([*compose, 'down', '--volumes'], env=env, check=True, capture_output=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--out-of-domain', type=Path, help='External non-food photo for truthful UI checks')
    parser.add_argument('--bundle', type=Path, help='Previously pulled candidate bundle with Compose and metadata')
    args = parser.parse_args()
    run(args.archive, args.report, args.out_of_domain, args.bundle)
