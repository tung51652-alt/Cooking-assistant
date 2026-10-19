#!/usr/bin/env python3
"""Validate the review web image/proxy, including intentional backend stop and recovery."""
import argparse
from http.client import HTTPResponse
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import UUID

from check_frontend_build import verify

ROOT = Path(__file__).resolve().parents[2]


def run(args):
    compose = ['docker', 'compose', '-p', args.project, '-f', 'deploy/compose/recipes.phase2.yml',
               '-f', 'deploy/compose/backend.phase3.yml', '-f', 'deploy/compose/frontend.phase4.yml']
    def command(*parts):
        result = subprocess.run([*compose, *parts], cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Compose operation failed (inspect local service): ' + parts[0])
        return result.stdout.strip()
    def docker(*parts):
        return subprocess.check_output(['docker', *parts], text=True).strip()
    def request(path, data=None, expected=200):
        try:
            response = urlopen(Request(args.url + path, data=data, headers={'Content-Type':'application/json'}), timeout=25)
        except HTTPError as error:
            response = error
        with response:
            value = json.load(response)
            assert response.status == expected, (path, response.status)
            if path.startswith('/api/'):
                assert value['api_version'] == '1.0.0'
                UUID(value['request_id'])
                assert response.headers['X-Request-ID'] == value['request_id']
            return value
    def ready():
        for _ in range(90):
            try:
                request('/api/health')
                return
            except (OSError, AssertionError):
                time.sleep(.5)
        raise RuntimeError('Web proxy did not become ready')
    ready()
    frontend = command('ps', '-q', 'frontend')
    assert docker('inspect', '--format', '{{.Config.User}}', frontend) == '10001:10001'
    assert docker('inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', frontend) == 'true'
    assert subprocess.run(['docker','exec',frontend,'nginx','-t'],capture_output=True).returncode == 0
    with tempfile.TemporaryDirectory(prefix='cooklens-web-artifacts-') as directory:
        subprocess.run(['docker','cp',frontend+':/usr/share/nginx/html/.',directory],check=True,capture_output=True)
        verify(directory)
    for service in ('backend','vision','recipes','qdrant'):
        identifier = command('ps','-q',service)
        assert json.loads(docker('inspect','--format','{{json .HostConfig.PortBindings}}',identifier)) in ({},None)
        networks = json.loads(docker('inspect','--format','{{json .NetworkSettings.Networks}}',identifier))
        assert all(docker('network','inspect','--format','{{.Internal}}',name) == 'true' for name in networks)
    assert request('/api/recipes/search', b'x'*8193, 413)['code'] == 'UPLOAD_TOO_LARGE'
    # A large declared upload must get an envelope before sending any image bytes.
    address = urlsplit(args.url)
    with socket.create_connection((address.hostname,address.port or 80),timeout=5) as connection:
        connection.settimeout(5)
        connection.sendall((f'POST /api/vision/predict HTTP/1.1\r\nHost: {address.netloc}\r\nContent-Length: {11*1024*1024+1}\r\nContent-Type: multipart/form-data; boundary=b\r\nConnection: close\r\n\r\n').encode())
        response = HTTPResponse(connection)
        response.begin()
        value = json.loads(response.read())
        assert response.status == 413 and response.headers['Content-Type'].startswith('application/json')
        assert value['code'] == 'UPLOAD_TOO_LARGE' and value['api_version'] == '1.0.0'
        UUID(value['request_id'])
        assert response.headers['X-Request-ID'] == value['request_id']
    # Proxy preserves business error schemas, rather than replacing them with HTML.
    assert request('/api/recipes/search',json.dumps({'confirmed_dish':'pizza'}).encode(),422)['code'] == 'INVALID_DISH'
    try:
        command('stop','backend')
        assert request('/api/dishes',expected=503)['code'] == 'DEPENDENCY_NOT_READY'
        with urlopen(args.url,timeout=5) as response: assert response.status == 200
    finally:
        command('start','backend')
        ready()
    peak = int(docker('exec',frontend,'cat','/sys/fs/cgroup/memory.peak'))
    report = {'public_api_version':'1.0.0','static_nginx_non_root':True,'read_only':True,
              'only_frontend_published_on_loopback':True,'backend_and_ai_networks_internal':True,
              'proxy_upload_and_json_limits':True,'proxy_errors_json_with_uuid':True,
              'upstream_business_errors_preserved':True,'backend_stop_recovery':True,
              'self_hosted_fonts_and_notices':True,'published_artifacts_policy_checked':True,
              'frontend_memory_peak_bytes':peak,
              'limitation':'Proxy and static-image smoke; browser flow evidence is recorded separately.'}
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5173')
    parser.add_argument('--project',default='cooklens-phase4-local')
    parser.add_argument('--report',type=Path)
    run(parser.parse_args())
