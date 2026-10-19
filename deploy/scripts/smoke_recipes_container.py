"""Check the actual recipes image with real Qdrant on an isolated Docker network."""
import argparse
import json
from pathlib import Path
import subprocess
import os

RUNNER = r'''
import json, math, os, pathlib, subprocess, sys, time, urllib.request
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(60):
    try:
        opener.open('http://qdrant:6333/readyz', timeout=1).close()
        break
    except OSError:
        time.sleep(.5)
else:
    raise RuntimeError('Qdrant not ready')
for _ in range(2):
    subprocess.run([sys.executable, '-m', 'ai.rag.ingestion.seed'], check=True, stdout=subprocess.DEVNULL)
process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'ai.rag.api.main:app', '--host', '127.0.0.1', '--port', '8001', '--no-access-log'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def call(path, body=None):
    request = urllib.request.Request('http://127.0.0.1:8001'+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json'})
    try:
        with opener.open(request, timeout=5) as response: return response.status, json.load(response)
    except urllib.error.HTTPError as response: return response.code, json.load(response)
try:
    for attempt in range(90):
        try:
            if call('/health/ready')[0] == 200: break
        except OSError: pass
        if process.poll() is not None: raise RuntimeError('Recipe process exited during startup')
        time.sleep(.5)
    else: raise RuntimeError('Recipes not ready')
    assert os.getuid() == 10001
    assert len(call('/dishes')[1]['dishes']) == 30
    health = call('/health/ready')[1]
    cases = [('pho','phở bò','wb_pho_bo_ninh_xuong'),('pho','phở gà','wb_pho_ga'),('banh_canh','bánh canh cua','wb_banh_canh_cua'),('banh_canh','bánh canh cá','wb_banh_canh_ca')]
    latencies=[]
    for i in range(100):
        dish,query,expected=cases[i%len(cases)]
        start=time.perf_counter()
        status,body=call('/search',{'confirmed_dish':dish,'query':query})
        latencies.append((time.perf_counter()-start)*1000)
        assert status==200 and body['recipes'][0]['id']==expected
        assert all(r['normalized_dish']==dish and len(r['preview'])<=240 for r in body['recipes'])
    status,detail=call('/recipes/wb_pho_ga')
    assert status==200 and detail['recipe']['ingredients'] and detail['recipe']['instructions']
    assert detail['recipe']['source']['license']=='CC-BY-SA-4.0'
    assert call('/search',{'confirmed_dish':'banh_pia'})[1]['recipes']==[]
    assert call('/search',{'confirmed_dish':'unknown_dish'})[0]==422
    assert call('/search',{'confirmed_dish':'pho','top_k':True})[0]==422
    assert call('/recipes/unknown_recipe')[0]==404
    forbidden=['.env','tests','frontend','docs','notebooks']
    assert not any(p.name in forbidden or p.suffix=='.ipynb' for p in pathlib.Path('/app').rglob('*'))
    try:
        opener.open('http://1.1.1.1',timeout=1)
    except OSError: offline=True
    else: raise RuntimeError('Smoke network unexpectedly permits external traffic')
    peak=int(pathlib.Path('/sys/fs/cgroup/memory.peak').read_text())
    print(json.dumps({'status':'passed','runtime':'docker_cpu','non_root_uid':os.getuid(),'read_only':True,'network_internal':offline,'seed_runs':2,'requests':100,'p95_ms':round(sorted(latencies)[math.ceil(len(latencies)*.95)-1],3),'peak_memory_bytes':peak,'cpu_limit':4,'memory_limit_bytes':2147483648,'versions':health,'scope':'Smoke/latency and four variant queries; not independent retrieval acceptance or full 30-dish coverage.'}))
finally:
    process.terminate()
    process.wait(timeout=10)
'''


def docker(*arguments, **kwargs):
    return subprocess.run(["docker", *arguments], check=True, capture_output=True, text=True, **kwargs).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="cooklens-recipes:phase2")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    prefix = f"cooklens-recipes-smoke-{os.getpid()}"
    network, database, application = prefix + "-net", prefix + "-qdrant", prefix + "-app"
    try:
        docker("network", "create", "--internal", network)
        docker("run", "-d", "--name", database, "--network", network, "--network-alias", "qdrant",
               "-e", "QDRANT__TELEMETRY_DISABLED=true", "qdrant/qdrant:v1.19.2")
        output = docker("run", "--rm", "-i", "--name", application, "--network", network, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
                        "--cpus", "4", "--memory", "2g", "-e", "QDRANT_URL=http://qdrant:6333", args.image,
                        "python", "-", input=RUNNER, timeout=240)
        report = json.loads(output)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(report, ensure_ascii=False))
    finally:
        subprocess.run(["docker", "rm", "-f", application], capture_output=True)
        subprocess.run(["docker", "rm", "-f", database], capture_output=True)
        subprocess.run(["docker", "network", "rm", network], capture_output=True)


if __name__ == "__main__":
    main()
