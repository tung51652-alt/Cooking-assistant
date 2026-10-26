#!/usr/bin/env python3
"""Package a local-image candidate; never publish images or claim registry acceptance."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import re

from check_public_metadata import violations

ROOT = Path(__file__).resolve().parents[2]
APPS = ('vision', 'recipes', 'backend', 'frontend')


def candidate_config(config):
    config = deepcopy(config)
    services = config['services']
    if set(services) != {*APPS, 'recipe-init', 'qdrant'}:
        raise ValueError('Unexpected candidate services')
    tags = set()
    for name, service in services.items():
        image = service['image']
        tag = image.rsplit(':', 1)[-1]
        if '@' in image or not re.fullmatch(r'v?\d+\.\d+\.\d+(?:-rc\.\d+)?', tag):
            raise ValueError('Candidate images require readable version tags')
        repository = image.rsplit(':', 1)[0]
        expected_name = 'recipes' if name == 'recipe-init' else name
        if name == 'qdrant':
            if repository != 'qdrant/qdrant':
                raise ValueError('Use the official Qdrant repository')
        elif repository.rsplit('/', 1)[-1] != 'cooklens-' + expected_name:
            raise ValueError('Candidate image does not match its service')
        if name != 'qdrant':
            tags.add(tag)
        if 'build' in service or 'develop' in service or 'container_name' in service:
            raise ValueError('Candidate must run without source or fixed container names')
        if any(mount['type'] != 'volume' for mount in service.get('volumes', [])):
            raise ValueError('Candidate cannot contain host bind mounts')
        if name != 'frontend' and service.get('ports'):
            raise ValueError('Only the frontend gateway can be published')
    if len(tags) != 1 or services['recipe-init']['image'] != services['recipes']['image']:
        raise ValueError('Candidate application image versions must match')
    ports = services['frontend'].get('ports', [])
    if len(ports) != 1 or ports[0].get('host_ip') != '127.0.0.1' or ports[0]['target'] != 8080:
        raise ValueError('Candidate gateway must use a single loopback port')
    ports[0]['published'] = '${HOST_PORT:-8080}'
    config['name'] = 'cooklens'
    if config.get('configs') or config.get('secrets'):
        raise ValueError('Candidate cannot require external config or secret files')
    for kind in ('networks', 'volumes'):
        for item in config.get(kind, {}).values():
            if item.get('external'):
                raise ValueError('Candidate cannot require preexisting infrastructure')
            item.pop('name', None)  # Compose project names must still isolate volumes/networks.
    if violations(json.dumps(config)):
        raise ValueError('Candidate configuration violates public metadata policy')
    return config, tags.pop()


def prepare(config, output):
    output = Path(output)
    if output.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError('Candidate output must stay outside the source build context')
    config, version = candidate_config(config)
    artifact = json.loads((ROOT / 'deploy/artifacts/manifest.json').read_text(encoding='utf-8'))
    metadata = {
        'application_candidate': version,
        'platform': 'linux/amd64',
        'public_api_version': artifact['public_api_version'],
        'taxonomy_version': artifact['taxonomy_version'],
        'model_version': artifact['vision']['model_version'],
        'corpus_version': artifact['corpus']['corpus_version'],
        'embedding_version': artifact['embedding']['embedding_version'],
        'images': {name: service['image'] for name, service in config['services'].items()},
        'registry_published': False,
        'release_acceptance_complete': False,
        'images_included': False,
    }
    sources = {
        'README.md': 'docs/runbooks/candidate.md',
        'notices/vision-model-v1.md': 'deploy/artifacts/vision-model-v1.md',
        'notices/torchvision-LICENSE.txt': 'deploy/artifacts/notices/torchvision-LICENSE.txt',
        'notices/embedding-model-v1.md': 'deploy/artifacts/embedding-model-v1.md',
        'notices/multilingual-e5-LICENSE.txt': 'deploy/artifacts/notices/multilingual-e5-LICENSE.txt',
        'notices/recipe-corpus.md': 'data/recipes/README.md',
        'notices/AUTHORSHIP.md': 'data/recipes/AUTHORSHIP.md',
    }
    for notice in ('Epilogue-OFL.txt', 'Plus-Jakarta-Sans-OFL.txt', 'Phosphor-MIT.txt', 'React-MIT.txt'):
        sources['notices/' + notice] = 'frontend/public/notices/' + notice
    texts = {target: (ROOT / source).read_text(encoding='utf-8') for target, source in sources.items()}
    texts['compose.release.yaml'] = json.dumps(config, ensure_ascii=False, indent=2) + '\n'
    texts['candidate.json'] = json.dumps(metadata, ensure_ascii=False, indent=2) + '\n'
    texts['RELEASE_NOTES.md'] = (
        f'# CookLens candidate {version}\n\n'
        'CPU / linux/amd64. Image -> Top-3 -> manual confirmation -> recipes and detail.\n\n'
        'This bundle contains configuration, version metadata and selected notices. '
        'Images must already be built or loaded; Docker Hub publishing and clean registry pull are deferred. '
        'It is not application release v2.0.0 or native Expo acceptance.\n\n'
        'CI adds verification.json only after the lifecycle and latency checks succeed. '
        'See candidate.json for the exact image and artifact versions.\n'
    )
    if any(violations(text) for text in texts.values()):
        raise ValueError('Candidate bundle violates public metadata policy')
    output.mkdir(parents=True, exist_ok=False)
    for name, text in texts.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')
    print('PASS: candidate configuration, versions, runbook and notices packaged; no images published')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compose-json', type=Path, required=True, help='docker compose config --format json output')
    parser.add_argument('--output', type=Path, required=True, help='New directory outside the source build context')
    args = parser.parse_args()
    prepare(json.loads(args.compose_json.read_text(encoding='utf-8')), args.output)
