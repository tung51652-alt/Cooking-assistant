#!/usr/bin/env python3
"""Publish immutable release candidates and package only verified public registry builds."""
import argparse
from copy import deepcopy
import json
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


def release_version(tag):
    if not re.fullmatch(r'v2\.0\.0-rc\.[1-9][0-9]*', tag):
        raise ValueError('Phase 6 requires a readable v2.0.0-rc.N tag; final release follows Phase 7')
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
    for app in APPS:
        quiet_command(['docker', 'push', config['services'][app]['image']])
        repo = hub_resource(f'{NAMESPACE}/cooklens-{app}/')
        if repo is None or repo.get('is_private', True):
            raise ValueError('Published repository is not publicly accessible: cooklens-' + app)
        print('PASS: published public image cooklens-' + app)


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


def package(bundle, archive):
    bundle, archive = Path(bundle), Path(archive)
    config = json.loads((bundle / 'compose.release.yaml').read_text())
    metadata, version = verified_metadata(config, json.loads((bundle / 'candidate.json').read_text()),
                                          json.loads((bundle / 'verification.json').read_text()))
    expected = {'README.md', 'RELEASE_NOTES.md', 'candidate.json', 'compose.release.yaml', 'verification.json'}
    if {p.name for p in bundle.iterdir() if p.is_file()} != expected:
        raise ValueError('Unexpected release bundle files')
    if archive.resolve().is_relative_to(ROOT.resolve()) or archive.resolve().is_relative_to(bundle.resolve()):
        raise ValueError('Archive must be outside the source and bundle directories')
    if archive.exists():
        raise FileExistsError('Do not overwrite an existing release archive')
    (bundle / 'candidate.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    (bundle / 'README.md').write_text((ROOT / 'docs/runbooks/registry.md').read_text())
    (bundle / 'RELEASE_NOTES.md').write_text(
        f'# CookLens {version} — Phase 6 registry candidate\n\n'
        'Public Docker Hub images for linux/amd64 and CPU; includes model weights, embedding model and recipe bundle.\n\n'
        'Verified by anonymous pulls on a separate runner: startup, persistence, dependency recovery, offline flow '
        'and 100 warm samples per API. See verification.json for measurements and candidate.json for image/artifact versions.\n\n'
        'Phase 7 quality and complete mobile acceptance remain open. This is a prerelease, not application v2.0.0. '
        'Dataset rights have not been independently audited; recipe provenance and AI-authored notices remain included.\n')
    members = sorted(p for p in bundle.rglob('*') if p.is_file())
    for path in members:
        if path.is_symlink() or violations(str(path.relative_to(bundle))) or violations(path.read_text()):
            raise ValueError('Release bundle violates file or public metadata policy')
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'x:gz') as output:
        for path in members:
            output.add(path, arcname=str(path.relative_to(bundle)), recursive=False)
    print('PASS: verified public registry candidate packaged with notices and runbook')


def github_release(archive, tag):
    version = release_version(tag)
    if Path(archive).name != f'cooklens-{version}.tar.gz':
        raise ValueError('Release archive and tag must match')
    with tarfile.open(archive, 'r:gz') as source:
        notes = source.extractfile('RELEASE_NOTES.md').read().decode()
        metadata = json.load(source.extractfile('candidate.json'))
        config = json.load(source.extractfile('compose.release.yaml'))
        report = json.load(source.extractfile('verification.json'))
        _, verified_version = verified_metadata(config, metadata, report)
        if verified_version != version or violations(notes):
            raise ValueError('Invalid release archive metadata')
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
    package_parser = sub.add_parser('package')
    package_parser.add_argument('--bundle', type=Path, required=True)
    package_parser.add_argument('--archive', type=Path, required=True)
    release_parser = sub.add_parser('github-release')
    release_parser.add_argument('--archive', type=Path, required=True)
    release_parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    if args.action == 'version':
        print(release_version(args.tag))
    elif args.action in ('preflight', 'push'):
        globals()[args.action](json.loads(args.compose_json.read_text()))
    elif args.action == 'package':
        package(args.bundle, args.archive)
    else:
        github_release(args.archive, args.tag)
