#!/usr/bin/env python3
"""Verify standalone Compose, real artifacts, persistent index and offline operation.

Uses a new, private project and volume; cleanup never targets an existing stack.
Only selected measurements are persisted, never raw Docker metadata or logs.
"""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import shutil
import socket
import statistics
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from check_frontend_build import verify
from check_public_metadata import violations

ROOT = Path(__file__).resolve().parents[2]
SERVICES = ('qdrant', 'vision', 'recipes', 'backend', 'frontend')


def managed_history(history, base_history):
    """Exclude only the verified upstream suffix; retain all project-authored layers."""
    if not base_history or history[-len(base_history):] != base_history:
        raise ValueError('Image history does not match the expected runtime base')
    return [re.sub(r'\b(?:file|dir):[0-9a-f]{32,}\b', '<docker-copy-input>', line)
            if re.search(r'\bCOPY\b', line) else line
            for line in history[:-len(base_history)]]


def command(parts, *, cwd=None, env=None, data=None, success=True):
    result = subprocess.run(parts, cwd=cwd, env=env, input=data, capture_output=True)
    if success and result.returncode:
        raise RuntimeError('Operation failed: ' + ' '.join(parts[:2]) + ' (raw output withheld)')
    return result


def run(report_path):
    project = 'cooklens-release-test-' + uuid4().hex[:12]
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    env = {**os.environ, 'HOST_PORT': str(port)}
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='cooklens-standalone-') as directory:
        directory = Path(directory)
        shutil.copyfile(ROOT / 'deploy/compose/compose.release.yaml', directory / 'compose.release.yaml')
        compose = ['docker', 'compose', '-p', project, '-f', 'compose.release.yaml']

        def dc(*parts, success=True):
            return command([*compose, *parts], cwd=directory, env=env, success=success)

        def docker(*parts, data=None, success=True):
            return command(['docker', *parts], data=data, success=success)

        def identifier(service, all=False):
            parts = ('ps', '-a', '-q', service) if all else ('ps', '-q', service)
            return dc(*parts).stdout.decode().strip()

        def inspect(service):
            return json.loads(docker('inspect', identifier(service, all=True)).stdout)[0]

        def api(path, data=None, expected=200, mime='application/json'):
            request_id = str(uuid4())
            try:
                response = urlopen(Request(base + path, data=data, headers={
                    'Content-Type': mime, 'X-Request-ID': request_id}), timeout=25)
            except HTTPError as error:
                response = error
            with response:
                value = json.load(response)
                assert response.status == expected, (path, response.status)
                assert value['api_version'] == '1.0.0'
                assert value['request_id'] == response.headers['X-Request-ID'] == request_id
                return value

        def ready():
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                try:
                    api('/api/health')
                    return
                except (OSError, AssertionError):
                    time.sleep(.5)
            raise RuntimeError('Release API not ready within startup budget')

        def search(dish):
            return api('/api/recipes/search', json.dumps({'confirmed_dish': dish}).encode())

        def internal_only(service):
            networks = inspect(service)['NetworkSettings']['Networks']
            assert networks
            for name in networks:
                assert json.loads(docker('network', 'inspect', name).stdout)[0]['Internal']

        peaks = {}

        def sample_peaks():
            for service in SERVICES:
                peak = int(docker('exec', identifier(service), 'cat', '/sys/fs/cgroup/memory.peak').stdout)
                peaks[service] = max(peaks.get(service, 0), peak)

        try:
            config = json.loads(dc('config', '--format', 'json').stdout)
            assert set(config['services']) == {*SERVICES, 'recipe-init'}
            for service, settings in config['services'].items():
                assert 'build' not in settings and ':latest' not in settings['image']
                assert all(v['type'] == 'volume' for v in settings.get('volumes', []))
                assert not settings.get('ports') or service == 'frontend'
            assert not json.loads(dc('ps', '-a', '--format', 'json').stdout or b'[]')
            started = time.monotonic()
            dc('up', '-d', '--wait', '--wait-timeout', '240')
            ready()
            cold_start = time.monotonic() - started
            init = inspect('recipe-init')
            assert init['State']['ExitCode'] == 0 and not init['State']['Running']
            seed_seconds = (datetime.fromisoformat(init['State']['FinishedAt'].replace('Z', '+00:00')) -
                            datetime.fromisoformat(init['State']['StartedAt'].replace('Z', '+00:00'))).total_seconds()
            for service in SERVICES:
                state = inspect(service)
                assert state['State']['Health']['Status'] == 'healthy'
                assert all(mount['Type'] != 'bind' for mount in state['Mounts'])
                if service != 'frontend':
                    assert not state['HostConfig']['PortBindings']
                    internal_only(service)
                else:
                    bindings = state['HostConfig']['PortBindings']['8080/tcp']
                    assert bindings == [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]
                if service != 'qdrant':
                    assert state['Config']['User'] == '10001:10001'
                    assert state['HostConfig']['ReadonlyRootfs']
                    assert state['HostConfig']['Memory'] > 0
                    # Check project-authored build commands, after the upstream base's WORKDIR.
                    history = docker('history', '--no-trunc', '--format', '{{.CreatedBy}}',
                                     state['Config']['Image']).stdout.decode().splitlines()
                    project_commands = []
                    if service == 'frontend':
                        # Its Nginx runtime stage has no WORKDIR boundary. The debug
                        # profile has already pulled this exact upstream runtime tag.
                        dockerfile = (ROOT / 'deploy/docker/Dockerfile.frontend').read_text()
                        base_image = [line.split()[1] for line in dockerfile.splitlines()
                                      if line.startswith('FROM ')][-1]
                        base_history = docker('history', '--no-trunc', '--format', '{{.CreatedBy}}',
                                              base_image).stdout.decode().splitlines()
                        project_commands = managed_history(history, base_history)
                    else:
                        for line in history:
                            if re.search(r'\bCOPY\b', line):
                                line = re.sub(r'\b(?:file|dir):[0-9a-f]{32,}\b', '<docker-copy-input>', line)
                            project_commands.append(line)
                            if re.search(r'\bWORKDIR /app(?:\s|$)', line):
                                break
                    kinds = violations('\n'.join(project_commands))
                    assert not kinds, service + ' project image history: ' + ', '.join(sorted(kinds))
            frontend = identifier('frontend')
            static = directory / 'static'
            static.mkdir()
            docker('cp', frontend + ':/usr/share/nginx/html/.', str(static))
            verify(static)
            catalog = api('/api/dishes')['dishes']
            assert len(catalog) == 30
            for dish in catalog:
                results = search(dish['normalized_dish'])['recipes']
                assert 1 <= len(results) <= 3
                assert all(r['normalized_dish'] == dish['normalized_dish'] for r in results)
            image = (ROOT / 'ai/cv/inference/tests/fixtures/food.png').read_bytes()
            boundary = 'CookLensReleaseSmoke'
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="food.png"\r\n'
                    'Content-Type: image/png\r\n\r\n').encode() + image + f'\r\n--{boundary}--\r\n'.encode()
            vision_times, search_times = [], []
            for _ in range(10):
                tick = time.monotonic()
                prediction = api('/api/vision/predict', body, mime='multipart/form-data; boundary=' + boundary)
                vision_times.append(time.monotonic() - tick)
                assert len(prediction['predictions']) == 3
                selected = prediction['predictions'][1]['normalized_dish']
                tick = time.monotonic()
                results = search(selected)['recipes']
                search_times.append(time.monotonic() - tick)
                detail = api('/api/recipes/' + results[0]['id'])['recipe']
                assert detail['normalized_dish'] == selected and detail['ingredients'] and detail['instructions']

            # New and repeated init, then a version upgrade and rollback in this private volume.
            dc('run', '--rm', '-T', '--no-deps', 'recipe-init')
            upgrade = '''
import json,os,pathlib,shutil,tempfile
from ai.rag.ingestion.seed import main
with tempfile.TemporaryDirectory() as tmp:
    target=pathlib.Path(tmp)/'bundle'
    shutil.copytree('/opt/cooklens/recipes',target)
    for name in ('manifest.json','vectors.json'):
        path=target/name
        value=json.loads(path.read_text())
        value['corpus_version']='cooklens-recipes-phase5-check'
        path.write_text(json.dumps(value))
    os.environ['RECIPES_BUNDLE_DIR']=str(target)
    main()
'''
            dc('run', '--rm', '-T', '--no-deps', 'recipe-init', 'python', '-c', upgrade)
            time.sleep(1.2)
            api('/api/health', expected=503)
            dc('run', '--rm', '-T', '--no-deps', 'recipe-init')
            ready()
            corrupt = upgrade.replace("value['corpus_version']='cooklens-recipes-phase5-check'",
                                      "value['corpus_version']='invalid version'")
            assert dc('run', '--rm', '-T', '--no-deps', 'recipe-init', 'python', '-c',
                      corrupt, success=False).returncode != 0
            ready()
            volume = next(m['Name'] for m in inspect('qdrant')['Mounts'] if m['Destination'] == '/qdrant/storage')
            sample_peaks()
            dc('down')
            dc('up', '-d', '--wait', '--wait-timeout', '240')
            ready()
            assert next(m['Name'] for m in inspect('qdrant')['Mounts'] if m['Destination'] == '/qdrant/storage') == volume
            assert search(selected)['recipes'][0]['id'] == results[0]['id']

            for dependency in ('vision', 'recipes', 'qdrant'):
                try:
                    dc('stop', dependency)
                    time.sleep(1.2)
                    api('/api/health', expected=503)
                finally:
                    dc('start', dependency)
                    ready()

            # Remove the only external bridge. Exercise Nginx -> gateway -> both AI APIs.
            frontend = identifier('frontend')
            networks = inspect('frontend')['NetworkSettings']['Networks']
            bridge = next(name for name in networks
                          if not json.loads(docker('network', 'inspect', name).stdout)[0]['Internal'])
            docker('network', 'disconnect', bridge, frontend)
            try:
                internal_only('frontend')
                assert docker('exec', frontend, 'wget', '-T', '2', '-q', '-O', '/dev/null',
                              'http://1.1.1.1', success=False).returncode != 0
                offline = '''
import json,sys
from urllib.request import Request,urlopen
base='http://frontend:8080'
def call(path,data=None,mime='application/json'):
    with urlopen(Request(base+path,data=data,headers={'Content-Type':mime}),timeout=25) as response:
        return json.load(response)
with urlopen(base,timeout=5) as response:
    assert response.status==200
boundary='CookLensOfflineSmoke'
body=(f'--{boundary}\\r\\nContent-Disposition: form-data; name="file"; filename="food.png"\\r\\nContent-Type: image/png\\r\\n\\r\\n').encode()+sys.stdin.buffer.read()+f'\\r\\n--{boundary}--\\r\\n'.encode()
prediction=call('/api/vision/predict',body,'multipart/form-data; boundary='+boundary)
assert len(prediction['predictions'])==3
dish=prediction['predictions'][1]['normalized_dish']
recipes=call('/api/recipes/search',json.dumps({'confirmed_dish':dish}).encode())['recipes']
detail=call('/api/recipes/'+recipes[0]['id'])['recipe']
assert detail['normalized_dish']==dish and detail['ingredients'] and detail['instructions']
'''
                docker('exec', '-i', identifier('recipes'), 'python', '-c', offline, data=image)
                sample_peaks()
            finally:
                # Recreate the web service to restore the published loopback port reliably.
                dc('up', '-d', '--no-deps', '--force-recreate', 'frontend')
                ready()

            resources = {}
            sample_peaks()
            for service in SERVICES:
                state = inspect(service)
                image_info = json.loads(docker('image', 'inspect', state['Config']['Image']).stdout)[0]
                resources[service] = {
                    'image_size_bytes': image_info['Size'],
                    'memory_limit_bytes': state['HostConfig']['Memory'],
                    'memory_peak_bytes': peaks[service],
                }
            engine = json.loads(docker('info', '--format', '{{json .}}').stdout)
            report = {
                'application_candidate': '2.0.0-rc.1', 'public_api_version': '1.0.0',
                'host': {'logical_cpus': engine['NCPU'], 'memory_bytes': engine['MemTotal'],
                         'architecture': engine['Architecture'], 'os': engine['OSType']},
                'compose_version': docker('compose', 'version', '--short').stdout.decode().strip(),
                'standalone_compose_without_source_mounts': True,
                'fresh_volume_seed': True, 'repeat_seed_and_restart_persisted': True,
                'version_upgrade_and_rollback': True, 'invalid_bundle_rejected': True,
                'catalog_dishes_searched': len(catalog), 'dependency_stop_recovery': True,
                'offline_full_flow_through_frontend': True,
                'only_frontend_published_on_loopback': True,
                'cold_start_seconds': round(cold_start, 3), 'seed_seconds': round(seed_seconds, 3),
                'warm_sequential_samples': 10,
                'vision_median_seconds': round(statistics.median(vision_times), 3),
                'vision_max_seconds': round(max(vision_times), 3),
                'search_median_seconds': round(statistics.median(search_times), 3),
                'search_max_seconds': round(max(search_times), 3), 'services': resources,
                'limitations': 'CI CPU integration sample, not minimum hardware or P95 acceptance. '
                                'Images built locally; clean registry pull is Phase 6. '
                                'Memory peaks are per-service maxima across sampled container instances, '
                                'not a simultaneous whole-stack peak.',
            }
            encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
            assert not violations(encoded), 'Report violates metadata policy'
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(encoded, encoding='utf-8')
            print(encoded)
        finally:
            dc('down', '--volumes', success=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    run(parser.parse_args().report)
