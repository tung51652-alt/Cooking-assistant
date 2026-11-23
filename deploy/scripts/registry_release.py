#!/usr/bin/env python3
"""Publish immutable release candidates and package only verified public registry builds."""
import argparse
from copy import deepcopy
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from check_public_metadata import violations
from prepare_candidate_bundle import APPS, ROOT, candidate_config

NAMESPACE = 'trantung2006'
ASSISTANT_SMOKE = ('assistant_without_key_and_offline', 'assistant_session_restart_and_recreate',
                   'assistant_volume_backup_restored')


def release_version(tag):
    if not re.fullmatch(r'v2\.0\.0-rc\.[1-9][0-9]*', tag):
        raise ValueError('Expected a v2.0.0-rc.N prerelease tag')
    return tag[1:]


def registry_images(config):
    config, version = candidate_config(config)
    release_version('v' + version)
    for name in (*APPS, 'recipe-init'):
        app = 'recipes' if name == 'recipe-init' else name
        if config['services'][name]['image'] != f'{NAMESPACE}/cooklens-{app}:{version}':
            raise ValueError('Registry release must use the approved namespace and service images')
    if config['services']['qdrant']['image'] != 'qdrant/qdrant:v1.19.2':
        raise ValueError('Registry release must retain the verified Qdrant version')
    return config, version


def quiet_command(parts):
    result = subprocess.run(parts, capture_output=True)
    if result.returncode:
        raise RuntimeError('Operation failed: ' + ' '.join(parts[:2]) + '; raw registry output withheld')
    return result.stdout


def hub_resource(path):
    try:
        with urlopen(Request('https://hub.docker.com/v2/repositories/' + path,
                             headers={'Accept': 'application/json'}), timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise RuntimeError('Docker Hub metadata check failed: HTTP ' + str(error.code)) from None


def preflight(config):
    config, version = registry_images(config)
    for app in APPS:
        path = f'{NAMESPACE}/cooklens-{app}/'
        repo = hub_resource(path)
        if repo is not None and repo.get('is_private', True):
            raise ValueError('Expected a public Docker Hub repository: cooklens-' + app)
        if hub_resource(path + 'tags/' + version) is not None:
            raise ValueError('Version already exists; do not overwrite published tags: cooklens-' + app)
    print('PASS: approved namespace, public repositories and unused release tags')


def push(config):
    if os.environ.get('DOCKERHUB_USERNAME') != NAMESPACE or not os.environ.get('DOCKERHUB_TOKEN'):
        raise ValueError('Configure DOCKERHUB_USERNAME and DOCKERHUB_TOKEN in Actions secrets')
    config, _ = registry_images(config)
    preflight(config)
    pushed = {}
    for app in APPS:
        image = config['services'][app]['image']
        output = quiet_command(['docker', 'push', image]).decode(errors='replace')
        digests = re.findall(r'\bdigest:\s+(sha256:[0-9a-f]{64})\s+size:', output)
        if len(digests) != 1:
            raise ValueError('Docker push did not report a unique digest for cooklens-' + app)
        pushed[image] = digests[0]
        repo = hub_resource(f'{NAMESPACE}/cooklens-{app}/')
        if repo is None or repo.get('is_private', True):
            raise ValueError('Published repository is not publicly accessible: cooklens-' + app)
        print('PASS: published public image cooklens-' + app)
    return pushed


def local_image_digest(image):
    repository = image.rsplit(':', 1)[0]
    records = json.loads(quiet_command(['docker', 'image', 'inspect', image]))
    refs = (records[0].get('RepoDigests') or []) if len(records) == 1 else []
    matches = [ref.split('@', 1)[1] for ref in refs if ref.startswith(repository + '@')]
    if len(matches) != 1 or not re.fullmatch(r'sha256:[0-9a-f]{64}', matches[0]):
        raise ValueError('Missing unique registry digest for ' + repository)
    return matches[0]


def candidate_identity(config, tag, source_sha, pushed=None):
    config, version = registry_images(config)
    if release_version(tag) != version or not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('Source and tag must identify the packaged candidate')
    published = pushed or {}
    images = sorted({service['image'] for service in config['services'].values()})
    digests = {image: published.get(image) or local_image_digest(image) for image in images}
    return {'tag': tag, 'source_sha': source_sha, 'digests': digests}


def verified_metadata(config, metadata, report):
    config, version = registry_images(config)
    images = {name: service['image'] for name, service in config['services'].items()}
    if metadata.get('application_candidate') != version or metadata.get('images') != images:
        raise ValueError('Packaged versions do not match the registry Compose')
    if report.get('application_candidate') != version or report.get('images') != images:
        raise ValueError('Verification report does not match the registry Compose')
    for field in ('registry_pull_verified', 'standalone_compose_without_source_mounts',
                  'fresh_volume_seed', 'repeat_seed_and_restart_persisted',
                  'version_upgrade_and_rollback', 'invalid_bundle_rejected',
                  'dependency_stop_recovery', 'offline_full_flow_through_frontend',
                  'only_frontend_published_on_loopback', 'warm_latency_targets_passed',
                  'artifact_versions_match'):
        if report.get(field) is not True:
            raise ValueError('Release verification gate missing: ' + field)
    if report.get('catalog_dishes_searched') != 30 or report.get('warm_sequential_samples', 0) < 100:
        raise ValueError('Incomplete catalog or latency verification')
    if report.get('public_api_version') != metadata.get('public_api_version'):
        raise ValueError('Public API version mismatch')
    for field, limit in (('vision_p95_seconds', 10), ('search_p95_seconds', 3)):
        value = report.get(field)
        if not isinstance(value, (int, float)) or not 0 <= value <= limit:
            raise ValueError('Latency gate failed: ' + field)
    metadata = deepcopy(metadata)
    metadata.update(registry_published=True, registry_pull_verified=True,
                    source_release_tag='v' + version, release_acceptance_complete=False)
    return metadata, version


def metric(data, field, lo, hi):
    value = data.get(field)
    if type(value) not in (int, float) or not math.isfinite(value) or not lo <= value <= hi:
        raise ValueError('Phase 13 metric missing or out of range: ' + field)
    return value


def valid_identity(identity):
    return (isinstance(identity, dict) and set(identity) == {'tag', 'source_sha', 'digests'}
            and re.fullmatch(r'v2\.0\.0-rc\.[1-9][0-9]*', str(identity['tag'])) is not None
            and re.fullmatch(r'[0-9a-f]{40}', str(identity['source_sha'])) is not None
            and isinstance(identity['digests'], dict) and bool(identity['digests'])
            and all(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/:-]+', image)
                    and re.fullmatch(r'sha256:[0-9a-f]{64}', str(digest))
                    for image, digest in identity['digests'].items()))


def confirm_registry_identity(identity):
    for image, expected in identity['digests'].items():
        output = quiet_command(['docker', 'buildx', 'imagetools', 'inspect', image]).decode(errors='replace')
        actual = re.findall(r'^Digest:\s+(sha256:[0-9a-f]{64})\s*$', output, flags=re.MULTILINE)
        if actual != [expected]:
            raise ValueError('Registry no longer serves the tested image: ' + image)


def phase13_acceptance(metadata, identity, vision, flow, manual):
    if not all(isinstance(item, dict) for item in (identity, vision, flow, manual)):
        raise ValueError('Phase 13 evidence is required in addition to a clean registry pull')
    version = metadata['application_candidate']
    if (not valid_identity(identity) or identity['tag'] != 'v' + version
            or set(identity['digests']) != set(metadata['images'].values())
            or manual.get('identity') != identity):
        raise ValueError('Phase 13 live evidence must match the verified tag, source and image digests')
    if (vision.get('application_candidate') != version or flow.get('application_candidate') != version
            or vision.get('model_version') != metadata['model_version']
            or vision.get('taxonomy_version') != metadata['taxonomy_version']
            or vision.get('split') != '2026-09-30-clean-split/Test' or vision.get('classes') != 30
            or vision.get('images') != 5004 or vision.get('top3_gate_met') is not True):
        raise ValueError('Full clean split evaluation must match the verified candidate')
    retrieval = flow.get('retrieval', {})
    if (retrieval.get('corpus_version') != metadata['corpus_version']
            or retrieval.get('covered_dishes') != 30 or retrieval.get('cross_dish_results') != 0
            or retrieval.get('technical_gate_met') is not True):
        raise ValueError('Full retrieval coverage without cross-dish results is required')
    photos, browser = flow.get('photo_flows', []), flow.get('browser_stats', {})
    if (len(photos) != 30 or len({item.get('dish') for item in photos if item.get('dish')}) != 30
            or any(item.get('confirmed_dish_flow_passed') is not True for item in photos)
            or browser.get('unexpected') != 0 or browser.get('flaky') != 0):
        raise ValueError('Passing photo flows and real browser regression report are required')
    metric(browser, 'expected', 10, 1000)
    android = manual.get('android', {})
    if (android.get('passed') is not True or not isinstance(android.get('device'), str) or not android['device'].strip()
            or type(android.get('version')) is not int or android['version'] < 10 or android.get('expo_sdk') != 58):
        raise ValueError('Verified Android 10+ Expo Go SDK 58 device coverage is required')
    for key in ('web_live', 'provider_recovery', 'session_restore_rollback', 'bundle_review', 'reviewed'):
        if manual.get(key) is not True:
            raise ValueError('Phase 13 confirmation missing: ' + key)
    assistant = manual.get('assistant', {})
    if (assistant.get('identity') != identity or assistant.get('passed') is not True or assistant.get('live_cases') != 50
            or assistant.get('controlled_cases') != 4 or assistant.get('critical_checks_passed') is not True):
        raise ValueError('Complete and reviewed Phase 8 assistant evaluation is required')
    model_fields = ('provider', 'model_selector', 'model')
    for key in model_fields:
        if not isinstance(assistant.get(key), str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}', assistant[key]):
            raise ValueError('Phase 13 assistant configuration missing: ' + key)
    assistant_metrics = {field: metric(assistant, field, lo, hi) for field, lo, hi in (
        ('p50', 0, 2.5), ('p95', 0, 6), ('max', 0, 8), ('mean_input', 0, 4000), ('p95_input', 0, 6000),
        ('mean_output', 0, 350), ('max_output', 0, 512), ('normal_pass_rate', .90, 1),
    )}
    return {
        'vision_top3': metric(vision, 'top3', .95, 1),
        'retrieval_queries': metric(retrieval, 'positive_queries', 150, float('inf')),
        'retrieval_hit_at_1': metric(retrieval, 'hit_at_1', .90, 1),
        'retrieval_hit_at_3': metric(retrieval, 'hit_at_3', .95, 1),
        'android_version': android['version'], 'expo_sdk': android['expo_sdk'],
        'assistant': {**assistant_metrics, **{key: assistant[key] for key in (*model_fields, 'live_cases', 'controlled_cases')}},
    }


def package(bundle, archive, *, identity=None, vision=None, flow=None, manual=None):
    bundle, archive = Path(bundle), Path(archive)
    config = json.loads((bundle / 'compose.yaml').read_text())
    report = json.loads((bundle / 'verification.json').read_text())
    metadata, version = verified_metadata(config, json.loads((bundle / 'candidate.json').read_text()),
                                          report)
    expected = {'README.md', 'RELEASE_NOTES.md', 'candidate.json', 'compose.yaml', 'verification.json'}
    if {p.name for p in bundle.iterdir() if p.is_file()} != expected:
        raise ValueError('Unexpected release bundle files')
    if archive.resolve().is_relative_to(ROOT.resolve()) or archive.resolve().is_relative_to(bundle.resolve()):
        raise ValueError('Archive must be outside the source and bundle directories')
    if archive.exists():
        raise FileExistsError('Do not overwrite an existing release archive')
    if not all(report.get(key) is True for key in ASSISTANT_SMOKE):
        raise ValueError('The packaged assistant runtime smoke must pass')
    metadata['phase13_acceptance'] = phase13_acceptance(metadata, identity, vision, flow, manual)
    metadata['release_acceptance_complete'] = True
    (bundle / 'candidate.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    (bundle / 'RELEASE_NOTES.md').write_text(
        f'# CookLens {version} — Phase 13 verified candidate\n\n'
        'Public Docker Hub images for linux/amd64 and CPU; includes model weights, embedding model and recipe bundle.\n\n'
        'Verified by anonymous pulls on a separate runner: startup, persistence, dependency recovery, offline flow '
        'and 100 warm samples per API. See verification.json for measurements and candidate.json for image/artifact versions.\n\n'
        'Phase 13 verified CV, retrieval, the live cooking assistant, web and Android through Expo Go. '
        'See candidate.json for the acceptance summary. Recipe provenance and AI-authored notices are included.\n'
        'This is a prerelease candidate; the source dataset rights were not independently audited.\n')
    members = sorted(p for p in bundle.rglob('*') if p.is_file())
    for path in members:
        if path.is_symlink() or violations(str(path.relative_to(bundle))) or violations(path.read_text()):
            raise ValueError('Release bundle violates file or public metadata policy')
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'x:gz') as output:
        for path in members:
            output.add(path, arcname=str(path.relative_to(bundle)), recursive=False)
    print('PASS: verified public registry candidate packaged with notices and runbook')


def github_release(archive, tag, identity):
    version = release_version(tag)
    if Path(archive).name != f'cooklens-{version}.tar.gz':
        raise ValueError('Release archive and tag must match')
    with tarfile.open(archive, 'r:gz') as source:
        notes = source.extractfile('RELEASE_NOTES.md').read().decode()
        metadata = json.load(source.extractfile('candidate.json'))
        config = json.load(source.extractfile('compose.yaml'))
        report = json.load(source.extractfile('verification.json'))
        _, verified_version = verified_metadata(config, metadata, report)
        if (verified_version != version or metadata.get('release_acceptance_complete') is not True
                or not metadata.get('phase13_acceptance') or violations(notes)
                or not all(report.get(key) is True for key in ASSISTANT_SMOKE)):
            raise ValueError('Invalid release archive metadata')
    if not valid_identity(identity) or identity['tag'] != tag or set(identity['digests']) != set(metadata['images'].values()):
        raise ValueError('Release requires the matching verified registry identity')
    confirm_registry_identity(identity)
    with tempfile.TemporaryDirectory(prefix='cooklens-release-notes-') as directory:
        path = Path(directory) / 'notes.md'
        path.write_text(notes)
        quiet_command(['gh', 'release', 'create', tag, str(archive), '--verify-tag', '--prerelease',
                       '--title', 'CookLens ' + version, '--notes-file', str(path)])
    print('PASS: verified prerelease and standalone download published')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    version_parser = sub.add_parser('version')
    version_parser.add_argument('tag')
    for name in ('preflight', 'push'):
        command_parser = sub.add_parser(name)
        command_parser.add_argument('--compose-json', type=Path, required=True)
        if name == 'push':
            command_parser.add_argument('--tag', required=True)
            command_parser.add_argument('--source-sha', required=True)
            command_parser.add_argument('--identity-output', type=Path, required=True)
    package_parser = sub.add_parser('package')
    package_parser.add_argument('--bundle', type=Path, required=True)
    package_parser.add_argument('--archive', type=Path, required=True)
    for field in ('identity', 'vision', 'flow', 'manual'):
        package_parser.add_argument('--' + field, type=Path, required=True)
    identity_parser = sub.add_parser('identity')
    identity_parser.add_argument('--compose', type=Path, required=True)
    identity_parser.add_argument('--tag', required=True)
    identity_parser.add_argument('--source-sha', required=True)
    identity_parser.add_argument('--output', type=Path, required=True)
    release_parser = sub.add_parser('github-release')
    release_parser.add_argument('--archive', type=Path, required=True)
    release_parser.add_argument('--tag', required=True)
    release_parser.add_argument('--identity', type=Path, required=True)
    args = parser.parse_args()
    if args.action == 'version':
        print(release_version(args.tag))
    elif args.action == 'preflight':
        preflight(json.loads(args.compose_json.read_text()))
    elif args.action == 'push':
        config = json.loads(args.compose_json.read_text())
        if release_version(args.tag) != registry_images(config)[1] or not re.fullmatch(r'[0-9a-f]{40}', args.source_sha):
            parser.error('The tag and source SHA must identify the candidate being pushed')
        args.identity_output.write_text(json.dumps(candidate_identity(config, args.tag, args.source_sha, push(config)),
                                                   indent=2), encoding='utf-8')
    elif args.action == 'package':
        evidence = {field: json.loads(getattr(args, field).read_text(encoding='utf-8'))
                    for field in ('identity', 'vision', 'flow', 'manual')}
        package(args.bundle, args.archive, **evidence)
    elif args.action == 'identity':
        config = json.loads(args.compose.read_text(encoding='utf-8'))
        args.output.write_text(json.dumps(candidate_identity(config, args.tag, args.source_sha), indent=2), encoding='utf-8')
    else:
        github_release(args.archive, args.tag, json.loads(args.identity.read_text(encoding='utf-8')))
