#!/usr/bin/env python3
"""Evaluate the released vision runtime on the repository's fixed clean test split.

Run inside the published vision image with the dataset ZIP and this repository
mounted read-only. Images stay external; stdout contains only aggregate metrics.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import sys
from zipfile import ZipFile

from PIL import Image
import torch

from ai.cv.inference.inference import evaluation_transform
from ai.cv.inference.model import load_model


def evaluate(archive, manifest, candidate='2.0.0-rc.2'):
    rows = [r for r in csv.DictReader(manifest.open()) if r['split'] == 'Test']
    if len(rows) != 5004 or {int(r['class_index']) for r in rows} != set(range(30)):
        raise ValueError('Expected the fixed 5004-image, 30-class clean test split')
    model = load_model()
    matrix = [[0] * 30 for _ in range(30)]
    hits = [0] * 30
    with ZipFile(archive) as data:
        members = {}
        for name in data.namelist():
            parts = name.replace('\\', '/').split('/')
            if len(parts) >= 2:
                key = '/'.join(parts[-2:])
                if key in members:
                    raise ValueError('Ambiguous archive member')
                members[key] = name
        # Resolve every expected file before measuring; never silently skip failures.
        selected = [members['/'.join(r['relative_path'].split('/')[-2:])] for r in rows]
        for offset in range(0, len(rows), 16):
            tensors, targets = [], []
            for row, member in zip(rows[offset:offset + 16], selected[offset:offset + 16]):
                target = int(row['class_index'])
                if row['class_name'] != model.classes[target]:
                    raise ValueError('Test label differs from checkpoint taxonomy')
                with Image.open(io.BytesIO(data.read(member))) as image:
                    tensors.append(evaluation_transform(image.convert('RGB')))
                targets.append(target)
            with torch.inference_mode():
                probabilities = torch.softmax(model.network(torch.stack(tensors)), dim=1)
                if probabilities.shape != (len(targets), 30) or not torch.isfinite(probabilities).all():
                    raise ValueError('Invalid model output')
                predictions = torch.argsort(probabilities, dim=1, descending=True, stable=True)[:, :3].tolist()
            for target, prediction in zip(targets, predictions):
                matrix[target][prediction[0]] += 1
                hits[target] += target in prediction
            if offset % 256 == 0:
                print(f'Evaluated {min(offset + 16, len(rows))}/{len(rows)} images', file=sys.stderr, flush=True)
    per_class = []
    for label, counts in enumerate(matrix):
        tp = counts[label]
        support = sum(counts)
        predicted = sum(line[label] for line in matrix)
        per_class.append({'dish': model.dishes[label].normalized_dish, 'images': support,
                          'top1': tp / support, 'top3': hits[label] / support,
                          'f1': 2 * tp / (support + predicted)})
    top3 = sum(hits) / len(rows)
    return {'application_candidate': candidate, 'model_version': model.model_version,
            'taxonomy_version': model.taxonomy_version, 'dataset': '30VNFoods',
            'source': 'https://huggingface.co/datasets/vuongnhathien/30VNFoods',
            'license_claim': 'CC-BY-NC-SA-4.0',
            'split': '2026-09-30-clean-split/Test', 'images': len(rows), 'classes': 30, 'batch_size': 16,
            'top1': sum(matrix[i][i] for i in range(30)) / len(rows), 'top3': top3,
            'macro_f1': sum(c['f1'] for c in per_class) / 30,
            'top3_gate_met': top3 >= .95, 'per_class': per_class,
            'limitations': 'Reacquired source test images matched by original class and filename. '
                           'No original content checksums exist in the split manifest; '
                           'this does not prove byte identity with historical training data. '
                           'Dataset license claim does not resolve upstream redistribution ambiguity.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--candidate', default='2.0.0-rc.2', help='Version of the image running this evaluation')
    args = parser.parse_args()
    result = evaluate(args.archive, args.manifest, args.candidate)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result['top3_gate_met']:
        raise SystemExit(1)
