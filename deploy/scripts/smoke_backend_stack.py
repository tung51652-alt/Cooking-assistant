#!/usr/bin/env python3
"""Exercise the public gateway with real CV, E5 and Qdrant in an isolated Compose project."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def run(args):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = args.port or probe.getsockname()[1]
    env = {**os.environ, 'BACKEND_PORT': str(port)}
    project = args.project or 'cooklens-gateway-smoke-' + str(os.getpid())
    compose = ['docker', 'compose', '-p', project, '-f', 'deploy/compose/recipes.phase2.yml',
               '-f', 'deploy/compose/backend.phase3.yml']

    def command(*parts):
        result = subprocess.run([*compose, *parts], cwd=ROOT, env=env, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Compose operation failed: ' + parts[0] + ' (inspect service locally)')
        return result.stdout.strip()

    base = f'http://127.0.0.1:{port}'

    def request(path, data=None, mime=None, expected=200):
        identifier = str(uuid4())
        headers = {'X-Request-ID': identifier}
        if mime:
            headers['Content-Type'] = mime
        req = Request(base + path, data=data, headers=headers)
        try:
            response = urlopen(req, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            payload = json.load(response)
            assert response.status == expected, (path, response.status, payload.get('code'))
            assert response.headers['X-Request-ID'] == identifier
            if path.startswith('/api/'):
                assert payload['api_version'] == '1.0.0' and payload['request_id'] == identifier
            return payload

    def ready():
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                request('/api/health')
                return
            except (OSError, AssertionError, URLError):
                time.sleep(.5)
        raise RuntimeError('Public gateway did not become ready within startup budget')

    def image(data):
        boundary = 'CookLensSmokeBoundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="food.png"\r\n'
                'Content-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        return body, 'multipart/form-data; boundary=' + boundary

    def search(dish, query=None, expected=200):
        return request('/api/recipes/search', json.dumps({'confirmed_dish': dish, 'query': query}).encode(),
                       'application/json', expected)

    try:
        command('up', '-d')
        ready()
        catalog = request('/api/dishes')['dishes']
        assert len(catalog) == 30
        data, mime = image((ROOT / 'ai/cv/inference/tests/fixtures/food.png').read_bytes())
        prediction = request('/api/vision/predict', data, mime)
        assert len(prediction['predictions']) == 3
        selected = prediction['predictions'][1]['normalized_dish']
        chosen = search(selected)
        assert chosen['confirmed_dish'] == selected and chosen['recipes']
        assert all(r['normalized_dish'] == selected for r in chosen['recipes'])
        detail = request('/api/recipes/' + chosen['recipes'][0]['id'])['recipe']
        assert detail['normalized_dish'] == selected and detail['ingredients'] and detail['instructions']
        for dish in catalog:
            results = search(dish['normalized_dish'])
            assert results['recipes'] and len(results['recipes']) <= 3
            assert all(r['normalized_dish'] == dish['normalized_dish'] for r in results['recipes'])
            for r in results['recipes']:
                full = request('/api/recipes/' + r['id'])['recipe']
                assert full['normalized_dish'] == dish['normalized_dish'] and full['source']['license']
                assert 'normalized_name' in full['ingredients'][0] and 'optional' in full['ingredients'][0]
        search('pizza', expected=422)
        bad, mime = image(b'not an image')
        assert request('/api/vision/predict', bad, mime, 400)['code'] == 'INVALID_IMAGE'
        spec = request('/v3/api-docs')
        assert spec['info']['version'] == '1.0.0' and len(spec['paths']) == 5
        with urlopen(base + '/swagger-ui/index.html', timeout=5) as response:
            assert response.status == 200

        command('stop', 'vision')
        time.sleep(1.1)  # Expire the documented one-second dependency cache.
        assert request('/api/health', expected=503)['dependencies']['vision']['status'] == 'not_ready'
        request('/actuator/health/liveness')
        request('/api/dishes')
        assert request('/api/vision/predict', data, mime, 503)['code'] == 'DEPENDENCY_NOT_READY'
        command('start', 'vision')
        ready()
        command('stop', 'recipes')
        assert search(selected, expected=503)['code'] == 'DEPENDENCY_NOT_READY'
        request('/api/recipes/' + detail['id'], expected=503)
        request('/actuator/health/liveness')
        command('start', 'recipes')
        ready()

        backend = command('ps', '-q', 'backend')
        def docker(*parts):
            return subprocess.check_output(['docker', *parts], text=True).strip()
        assert docker('inspect', '--format', '{{.Config.User}}', backend) == '10001:10001'
        assert docker('inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', backend) == 'true'
        for service in ('vision', 'recipes', 'qdrant'):
            identifier = command('ps', '-q', service)
            assert json.loads(docker('inspect', '--format', '{{json .HostConfig.PortBindings}}', identifier)) in ({}, None)
        for service in ('vision', 'recipes', 'qdrant'):
            identifier = command('ps', '-q', service)
            networks = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', identifier))
            for name in networks:
                assert docker('network', 'inspect', '--format', '{{.Internal}}', name) == 'true'
        assert subprocess.run(['docker', 'exec', backend, 'sh', '-c', 'test ! -d /app/src && test ! -d /app/tests'],
                              capture_output=True).returncode == 0
        assert subprocess.run(['docker', 'exec', backend, 'java', '-cp', '/app/health',
                               'com.cooklens.config.HealthProbe'], capture_output=True).returncode == 0
        peak = int(docker('exec', backend, 'cat', '/sys/fs/cgroup/memory.peak'))
        # Docker disables published ports when every attached network is internal.
        # Temporarily detach the browser bridge and run a full transaction from an AI container.
        networks = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', backend))
        browser = next(name for name in networks if docker('network', 'inspect', '--format', '{{.Internal}}', name) == 'false')
        docker('network', 'disconnect', browser, backend)
        try:
            offline_script = '''
import json,sys
from urllib.request import Request,urlopen
base='http://backend:8080'
def call(path,data=None,mime='application/json'):
    with urlopen(Request(base+path,data=data,headers={'Content-Type':mime}),timeout=20) as response:
        return json.load(response)
boundary='OfflineSmoke'
body=(f'--{boundary}\\r\\nContent-Disposition: form-data; name="file"; filename="food.png"\\r\\nContent-Type: image/png\\r\\n\\r\\n').encode()+sys.stdin.buffer.read()+f'\\r\\n--{boundary}--\\r\\n'.encode()
prediction=call('/api/vision/predict',body,'multipart/form-data; boundary='+boundary)
dish=prediction['predictions'][1]['normalized_dish']
results=call('/api/recipes/search',json.dumps({'confirmed_dish':dish}).encode())
recipe=call('/api/recipes/'+results['recipes'][0]['id'])['recipe']
assert recipe['normalized_dish']==dish and recipe['ingredients'] and recipe['instructions']
'''
            result = subprocess.run(['docker', 'exec', '-i', command('ps', '-q', 'recipes'), 'python', '-c', offline_script],
                                    input=(ROOT / 'ai/cv/inference/tests/fixtures/food.png').read_bytes(), capture_output=True)
            assert result.returncode == 0, 'Full gateway flow failed without external network'
            networks = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', backend))
            assert all(docker('network', 'inspect', '--format', '{{.Internal}}', name) == 'true' for name in networks)
            peak = max(peak, int(docker('exec', backend, 'cat', '/sys/fs/cgroup/memory.peak')))
        finally:
            # Recreate only the gateway to restore the loopback port for local Swagger.
            command('up', '-d', '--no-deps', '--force-recreate', 'backend')
            ready()
        report = {'public_api_version': '1.0.0', 'corpus_version': chosen['corpus_version'],
                  'real_model_flow': True, 'explicit_second_prediction_confirmed': True,
                  'catalog_dishes_searched': 30, 'dependency_stop_recovery': True,
                  'request_ids_preserved': True, 'only_gateway_published_on_loopback': True,
                  'ai_services_only_internal_networks': True, 'full_flow_without_external_network': True, 'backend_non_root': True,
                  'backend_read_only': True, 'backend_memory_peak_bytes': peak,
                  'limitation': 'Integration smoke; not a throughput benchmark or independent recipe evaluation.'}
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.keep_running:
            print('Swagger: ' + base + '/swagger-ui/index.html')
    finally:
        if not args.keep_running:
            command('down', '--volumes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project')
    parser.add_argument('--port', type=int)
    parser.add_argument('--keep-running', action='store_true')
    parser.add_argument('--report', type=Path)
    run(parser.parse_args())
