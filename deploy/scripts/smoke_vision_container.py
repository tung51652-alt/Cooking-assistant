#!/usr/bin/env python3
"""Offline/read-only smoke check for a built vision image; print no platform identifiers."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', default='cooklens-vision:phase1')
    parser.add_argument('--name', default='cooklens-vision-phase1-smoke')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image], text=True))[0]
    if image['Config']['User'] != '10001:10001':
        raise RuntimeError('Vision image must run as its configured non-root user')
    subprocess.run(['docker', 'run', '-d', '--name', args.name, '--network', 'none', '--read-only',
                    '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m', '--cpus', '4', '--memory', '2g',
                    args.image], check=True, stdout=subprocess.DEVNULL)
    try:
        check = "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health/ready', timeout=2)"
        ready = False
        for _ in range(60):
            result = subprocess.run(['docker', 'exec', args.name, 'python', '-c', check],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode == 0:
                ready = True
                break
            time.sleep(0.5)
        if not ready:
            raise RuntimeError('Vision did not become ready; container content omitted from diagnostics')
        script = '''
from pathlib import Path
import json,sys
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base='http://127.0.0.1:8000'
for route in ['/health/live','/health/ready']:
    with urlopen(base+route,timeout=2) as response:
        assert response.status==200
assert Path('/opt/cooklens/models/efficientnet_b2_best.pt').stat().st_mode & 0o444 == 0o444
contents=sys.stdin.buffer.read()
boundary='cooklens-smoke-boundary'
body=(('--'+boundary+'\\r\\nContent-Disposition: form-data; name="file"; filename="food.png"\\r\\nContent-Type: image/png\\r\\n\\r\\n').encode()+contents+('\\r\\n--'+boundary+'--\\r\\n').encode())
headers={'Content-Type':'multipart/form-data; boundary='+boundary}
with urlopen(Request(base+'/predict',body,headers),timeout=15) as response:
    data=json.load(response)
assert len(data['predictions'])==3
assert data['predictions'][0]['class_id']==15
assert data['predictions'][0]['confidence']>0.9
assert [p['rank'] for p in data['predictions']]==[1,2,3]
assert sum(p['confidence'] for p in data['predictions'])<=1.000001
try:
    urlopen(Request(base+'/predict',b'not-image',{'Content-Type':'text/plain'}),timeout=2)
    raise AssertionError('Invalid content unexpectedly accepted')
except HTTPError as error:
    assert error.code==415
    assert json.load(error)['code']=='UNSUPPORTED_MEDIA_TYPE'
assert not Path('/app/ai/cv/inference/tests').exists()
assert not Path('/app/ai/cv/training').exists()
assert not Path('/app/ai/cv/evaluation').exists()
assert not Path('/app/ai/cv/inference/benchmark.py').exists()
assert not Path('/app/frontend').exists()
assert not Path('/app/docs').exists()
assert not Path('/app/.git').exists()
assert not list(Path('/app').rglob('.env'))
assert not list(Path('/app').rglob('*.ipynb'))
'''
        result = subprocess.run(['docker', 'exec', '-i', args.name, 'python', '-c', script],
                                input=(ROOT / 'ai/cv/inference/tests/fixtures/food.png').read_bytes(),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Vision container smoke assertions failed; response content omitted')
        peak = subprocess.check_output(['docker', 'exec', args.name, 'cat', '/sys/fs/cgroup/memory.peak'], text=True)
        report = {'image_tag': args.image, 'platform': image['Os'] + '/' + image['Architecture'],
                  'network': 'none', 'filesystem': 'read-only; 32 MiB temporary upload filesystem',
                  'cpu_limit': 4, 'memory_limit_gib': 2, 'user': 'non-root',
                  'cgroup_peak_memory_mib': round(int(peak) / 1024 / 1024, 2),
                  'checks': ['live and ready', 'real photo Top-3', 'invalid MIME rejection',
                             'no tests/notebooks/frontend/docs/git/env in runtime application tree'],
                  'limits': 'Single image smoke test; not a full accuracy or stack benchmark'}
        if args.output:
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print('PASS: non-root vision image runs offline/read-only and returns real Top-3')
    finally:
        subprocess.run(['docker', 'rm', '-f', args.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
