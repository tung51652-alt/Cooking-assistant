#!/usr/bin/env python3
"""Exercise the public gateway with real CV, E5 and Qdrant in an isolated Compose project."""
import argparse
import json
import os
import socket
import sqlite3
import subprocess
import tempfile
import time
from contextlib import closing
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def run(args):
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = args.port or probe.getsockname()[1]
    env = {**os.environ, 'HOST_PORT': str(port), 'LLM_API_KEY': ''}
    project = args.project or 'cooklens-gateway-smoke-' + str(os.getpid())
    compose = ['docker', 'compose', '-p', project, '-f', 'compose.yaml']

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

    def internal_request(path, service='recipes'):
        # Swagger and liveness remain internal; no extra host ports or Compose overlay.
        script = "from urllib.request import urlopen; import json,sys; print(json.dumps(json.load(urlopen('http://backend:8080'+sys.argv[1],timeout=5))))"
        return json.loads(command('exec', '-T', service, 'python', '-c', script, path))

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
        command('up', '-d', '--wait', '--wait-timeout', '240')
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
        spec = internal_request('/v3/api-docs')
        assert spec['info']['version'] == '1.0.0' and len(spec['paths']) == 10
        command('exec', '-T', 'recipes', 'python', '-c',
                "from urllib.request import urlopen; assert urlopen('http://backend:8080/swagger-ui/index.html').status == 200")

        command('stop', 'vision')
        time.sleep(1.1)  # Expire the documented one-second dependency cache.
        assert request('/api/health', expected=503)['dependencies']['vision']['status'] == 'not_ready'
        internal_request('/actuator/health/liveness')
        request('/api/dishes')
        assert request('/api/vision/predict', data, mime, 503)['code'] == 'DEPENDENCY_NOT_READY'
        command('start', 'vision')
        ready()
        command('stop', 'recipes')
        assert search(selected, expected=503)['code'] == 'DEPENDENCY_NOT_READY'
        request('/api/recipes/' + detail['id'], expected=503)
        internal_request('/actuator/health/liveness', service='vision')
        command('start', 'recipes')
        ready()

        def post_json(path, payload, expected=200):
            return request(path, json.dumps(payload).encode(), 'application/json', expected)

        created = post_json('/api/assistant/sessions', {
            'recipe_id': detail['id'],
            'corpus_version': chosen['corpus_version'],
            'operation_id': str(uuid4()),
        })['session']
        session_id = created['id']
        assert created['recipe']['id'] == detail['id']
        assert created['corpus_version'] == chosen['corpus_version']
        assert created['status'] == 'ready' and created['current_step'] == 0 and created['version'] == 0
        assert created['total_steps'] == len(detail['instructions']) and created['messages'] == []

        started = post_json(f'/api/assistant/sessions/{session_id}/actions', {
            'action': 'start',
            'expected_version': 0,
            'operation_id': str(uuid4()),
        })['session']
        assert started['status'] == 'cooking' and started['current_step'] == 1 and started['version'] == 1
        assert len(started['history']) == 1 and started['history'][0]['action'] == 'start'

        msg_err = post_json(f'/api/assistant/sessions/{session_id}/messages', {
            'text': 'Can I adjust the seasoning?',
            'expected_version': 1,
            'operation_id': str(uuid4()),
        }, expected=503)
        assert msg_err['code'] == 'ASSISTANT_NOT_CONFIGURED'
        before_restart = request(f'/api/assistant/sessions/{session_id}')['session']
        assert before_restart['version'] == 1 and before_restart['current_step'] == 1
        assert before_restart['status'] == 'cooking' and before_restart['messages'] == []
        assert len(before_restart['history']) == 1

        backend = command('ps', '-q', 'backend')
        def docker(*parts):
            return subprocess.check_output(['docker', *parts], text=True).strip()
        assert docker('inspect', '--format', '{{.Config.User}}', backend) == '10001:10001'
        assert docker('inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', backend) == 'true'
        assert docker('exec', backend, 'id', '-u') == '10001'
        assert docker('exec', backend, 'id', '-g') == '10001'
        assert subprocess.run(['docker', 'exec', backend, 'sh', '-c', 'touch /app/ro-check 2>/dev/null'],
                              capture_output=True).returncode != 0
        mounts = json.loads(docker('inspect', '--format', '{{json .Mounts}}', backend))
        data_mount = next(m for m in mounts if m['Destination'] == '/app/data')
        assert data_mount['Type'] == 'volume' and data_mount['RW'] is True and data_mount['Name']
        db_stat = docker('exec', backend, 'stat', '-c', '%u:%g %s', '/app/data/assistant.sqlite').split()
        assert db_stat[0] == '10001:10001' and int(db_stat[1]) > 0
        command('stop', 'backend')
        with tempfile.TemporaryDirectory(prefix='cooklens-sqlite-check-') as tmpdir:
            subprocess.run(['docker', 'cp', backend + ':/app/data/.', tmpdir], check=True, capture_output=True)
            with closing(sqlite3.connect(Path(tmpdir) / 'assistant.sqlite')) as conn:
                schema_version = conn.execute('PRAGMA user_version').fetchone()[0]
                assert schema_version == 3, schema_version

        recipes_image = docker('inspect', '--format', '{{.Config.Image}}', command('ps', '-q', 'recipes'))
        def volume_python(script, *arguments, readonly=False):
            mount = 'type=volume,source=' + data_mount['Name'] + ',target=/data' + (',readonly' if readonly else '')
            result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--user', '10001:10001',
                                     '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--mount', mount,
                                     '--entrypoint', 'python', recipes_image, '-c', script, *arguments], capture_output=True)
            if result.returncode:
                raise RuntimeError('Assistant volume check failed; raw database output withheld')
            return json.loads(result.stdout)

        # Seed only a disposable orphan/reservation, never real usage or a provider call.
        pending_text = 'Restart pending check'
        pending_operation = str(uuid4())
        volume_python('''
import hashlib,json,sqlite3,sys,time
from datetime import datetime,timezone
session,operation,text=sys.argv[1:]
def fp(kind,value,version):
    return hashlib.sha256(json.dumps([kind,value,version],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
stamp=int(time.time()*1000)-30000
with sqlite3.connect('/data/assistant.sqlite') as db:
    db.execute('PRAGMA foreign_keys=ON')
    db.execute("INSERT INTO session_operations(session_id,operation_id,kind,fingerprint,expected_version,created_at,deadline,status) VALUES (?,?,'message',?,1,?,?,'pending')",
               (session,operation,fp('message',text,1),stamp,stamp+25000))
    db.execute("INSERT INTO llm_calls(call_key,session_key,month,admitted_at,model,reserved_micros,input_rate,output_rate,status) VALUES (?,?,?,?,?,1000,1000000,1000000,'reserved')",
               (fp('billing',session+':'+operation,0),fp('session',session,0),datetime.now(timezone.utc).strftime('%Y-%m'),stamp,'mock-reservation'))
print('{}')
''', session_id, pending_operation, pending_text)
        command('start', 'backend')
        ready()
        backend = command('ps', '-q', 'backend')
        after_mounts = json.loads(docker('inspect', '--format', '{{json .Mounts}}', backend))
        after_data_mount = next(m for m in after_mounts if m['Destination'] == '/app/data')
        assert after_data_mount['Name'] == data_mount['Name']
        after_restart = request(f'/api/assistant/sessions/{session_id}')['session']
        assert after_restart['id'] == session_id and after_restart['version'] == 1
        assert after_restart['status'] == 'cooking' and after_restart['current_step'] == 1
        assert after_restart['recipe']['id'] == detail['id']
        assert after_restart['corpus_version'] == chosen['corpus_version']
        assert len(after_restart['history']) == 1
        replay = {'text': pending_text, 'expected_version': 1, 'operation_id': pending_operation}
        assert post_json(f'/api/assistant/sessions/{session_id}/messages', replay, expected=503)['code'] == 'ASSISTANT_OUTCOME_UNKNOWN'
        accounting = volume_python('''
import json,sqlite3
with sqlite3.connect('file:/data/assistant.sqlite?mode=ro',uri=True) as db:
    count,total,unknown=db.execute("SELECT COUNT(*),SUM(COALESCE(charged_micros,reserved_micros)),SUM(status='unknown' AND charged_micros IS NULL) FROM llm_calls").fetchone()
print(json.dumps({'calls':count,'reserved_total':total,'unknown':unknown}))
''', readonly=True)
        assert accounting == {'calls': 1, 'reserved_total': 1000, 'unknown': 1}
        expected_next_step = 2 if after_restart['total_steps'] > 1 else 1
        advanced = post_json(f'/api/assistant/sessions/{session_id}/actions', {
            'action': 'next',
            'expected_version': 1,
            'operation_id': str(uuid4()),
        })['session']
        assert advanced['version'] == 2 and advanced['status'] == 'cooking'
        assert advanced['current_step'] == expected_next_step and len(advanced['history']) == 2
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
        networks = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', backend))
        external = [name for name in networks if docker('network', 'inspect', '--format', '{{.Internal}}', name) == 'false']
        assert len(networks) == 2 and len(external) == 1
        docker('network', 'disconnect', external[0], backend)
        try:
            networks = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', backend))
            assert networks and all(docker('network', 'inspect', '--format', '{{.Internal}}', name) == 'true' for name in networks)
            result = subprocess.run(['docker', 'exec', '-i', command('ps', '-q', 'recipes'), 'python', '-c', offline_script],
                                    input=(ROOT / 'ai/cv/inference/tests/fixtures/food.png').read_bytes(), capture_output=True)
            assert result.returncode == 0, 'Full gateway flow failed without external network'
        finally:
            docker('network', 'connect', external[0], backend)
        peak = max(peak, int(docker('exec', backend, 'cat', '/sys/fs/cgroup/memory.peak')))
        report = {'public_api_version': '1.0.0', 'corpus_version': chosen['corpus_version'],
                  'real_model_flow': True, 'explicit_second_prediction_confirmed': True,
                  'catalog_dishes_searched': 30, 'dependency_stop_recovery': True,
                  'request_ids_preserved': True, 'only_frontend_published_on_loopback': True,
                  'ai_services_only_internal_networks': True, 'full_flow_without_external_network': True, 'backend_non_root': True,
                  'backend_dedicated_llm_egress': True,
                  'backend_read_only': True, 'backend_memory_peak_bytes': peak,
                  'assistant_sqlite_volume_persisted': True,
                  'assistant_sqlite_schema_version': schema_version,
                  'assistant_restart_survived': True,
                  'assistant_pending_reservation_restart_survived': True,
                  'assistant_expired_pending_replay_without_key': True,
                  'assistant_reservation_fault_fixture': True,
                  'assistant_messages_unconfigured_503_no_mutation': True,
                  'limitation': 'Integration smoke; not a throughput benchmark or independent recipe evaluation.'}
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.keep_running:
            print('Web: ' + base)
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
