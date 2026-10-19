"""Measure warm CPU HTTP inference without storing requests, IDs or model identifiers."""

import argparse
from io import BytesIO
import json
from pathlib import Path
import platform
import resource
import statistics
import time

from fastapi.testclient import TestClient
from PIL import Image
import torch

from ai.cv.inference.main import create_app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--runs', type=int, default=100)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.runs < 100:
        parser.error('At least 100 requests are required for the warm benchmark')
    contents = args.image.read_bytes()
    with Image.open(BytesIO(contents)) as image:
        mime = Image.MIME[image.format]
    started = time.perf_counter()
    with TestClient(create_app()) as client:
        startup = time.perf_counter() - started
        def request():
            result = client.post('/predict', files={'file': ('benchmark-image', contents, mime)})
            if result.status_code != 200 or len(result.json()['predictions']) != 3:
                raise RuntimeError('Benchmark request failed; no response content recorded')
        request()
        elapsed = []
        for _ in range(args.runs):
            started = time.perf_counter()
            request()
            elapsed.append((time.perf_counter() - started) * 1000)
        threads = torch.get_num_threads()
    ordered = sorted(elapsed)
    report = {
        'kind': 'phase1_cpu_smoke_latency_not_accuracy_evaluation',
        'transport': 'ASGI TestClient, real model, validation and multipart upload; no external network latency',
        'sample': 'supplied notebook food figure, reused for latency only',
        'runs': args.runs, 'concurrency': 1, 'cpu_threads': threads,
        'architecture': platform.machine(), 'python_version': platform.python_version(),
        'startup_seconds': round(startup, 3), 'warm_mean_ms': round(statistics.mean(elapsed), 3),
        'warm_p50_ms': round(statistics.median(elapsed), 3),
        'warm_p95_ms': round(ordered[(95 * len(ordered) + 99) // 100 - 1], 3),
        'process_peak_rss_mib': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2),
        'limits': 'Single supplied image; full held-out accuracy and whole-stack resource tests are not re-run here.'
    }
    text = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end='')


if __name__ == '__main__':
    main()
