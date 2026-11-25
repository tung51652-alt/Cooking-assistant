#!/usr/bin/env python3
"""Promote a fully accepted candidate without rebuilding or overwriting public tags."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import shutil
import tarfile

from check_public_metadata import violations
from prepare_candidate_bundle import APPS, ROOT, candidate_config
from registry_release import (ASSISTANT_SMOKE, NAMESPACE, automated_acceptance, confirm_registry_identity,
                              hub_resource, local_image_digest, phase13_acceptance,
                              quiet_command, verified_metadata)

VERSION = '2.0.0'


def read(path):
    return json.loads(Path(path).read_text())


def accepted(root, source_sha):
    root = Path(root)
    bundle = root / 'bundle'
    config, metadata = read(bundle / 'compose.yaml'), read(bundle / 'candidate.json')
    report, identity = read(bundle / 'verification.json'), read(root / 'identity.json')
    verified, _ = verified_metadata(config, metadata, report)
    policy_path = root / 'release-policy.json'
    if policy_path.exists():
        policy = read(policy_path)
        approved = read(ROOT / 'deploy/artifacts/mvp-release-policy.json')
        if policy != approved or policy.get('mode') != 'known-limitations':
            raise ValueError('Release exceptions must match the committed user decision')
        summary = automated_acceptance(metadata, identity, read(root / 'vision.json'), read(root / 'flow.json'))
        if identity['source_sha'] != source_sha or not all(report.get(k) is True for k in ASSISTANT_SMOKE):
            raise ValueError('Deferred manual checks cannot waive source or runtime verification')
        verified.pop('phase13_acceptance', None)
        verified.update(release_acceptance_complete=False, automated_acceptance=summary,
                        release_policy=policy, runtime_profile=policy['runtime_profile'])
        return config, verified, identity
    summary = phase13_acceptance(metadata, identity, read(root / 'vision.json'),
                                 read(root / 'flow.json'), read(root / 'manual.json'))
    if (metadata.get('release_acceptance_complete') is not True
            or metadata.get('registry_published') is not True
            or metadata.get('registry_pull_verified') is not True
            or metadata.get('source_release_tag') != identity['tag']
            or metadata.get('phase13_acceptance') != summary
            or identity['source_sha'] != source_sha
            or not all(report.get(key) is True for key in ASSISTANT_SMOKE)):
        raise ValueError('Final release requires the accepted candidate from the exact main source')
    return config, metadata, identity


def final_images(config):
    result = deepcopy(config)
    for name, service in result['services'].items():
        if name != 'qdrant':
            app = 'recipes' if name == 'recipe-init' else name
            service['image'] = f'{NAMESPACE}/cooklens-{app}:{VERSION}'
    return candidate_config(result)[0]


def promoted_identity(config, identity):
    images = final_images(config)['services']
    return {'digests': {images[name]['image']: identity['digests'][service['image']]
                        for name, service in config['services'].items()}}


def example_environment(metadata):
    assistant = metadata.get('runtime_profile') or metadata['phase13_acceptance']['assistant']
    endpoints = {'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai',
                 'nvidia': 'https://integrate.api.nvidia.com/v1'}
    if assistant['provider'] not in endpoints:
        raise ValueError('Release provider needs an explicit runtime endpoint')
    return ('HOST_BIND=127.0.0.1\nHOST_PORT=8080\nLLM_PROVIDER=openai\n'
            f'LLM_BASE_URL={endpoints[assistant["provider"]]}\n'
            f'LLM_MODEL={assistant["model_selector"]}\nLLM_API_KEY=\n'
            'LLM_TIMEOUT_SECONDS=20\nLLM_MAX_INPUT_TOKENS=6000\nLLM_MAX_OUTPUT_TOKENS=512\n')


def promote(root, source_sha):
    config, _, identity = accepted(root, source_sha)
    confirm_registry_identity(identity)
    # Check every destination before publishing any manifest; never repair by overwriting.
    for app in APPS:
        repository = f'{NAMESPACE}/cooklens-{app}'
        info = hub_resource(repository)
        if info is not None and info.get('is_private'):
            raise ValueError('Final image repository must be public')
        if hub_resource(repository + '/tags/' + VERSION) is not None:
            raise ValueError('Final image tag already exists: ' + app)
    for app in APPS:
        image = config['services'][app]['image']
        source = image.rsplit(':', 1)[0] + '@' + identity['digests'][image]
        quiet_command(['docker', 'buildx', 'imagetools', 'create', '--prefer-index=false',
                       '--tag', f'{NAMESPACE}/cooklens-{app}:{VERSION}', source])
    confirm_registry_identity(promoted_identity(config, identity))
    print('PASS: final tags serve the accepted manifests without rebuild')


def prepare(root, output, source_sha):
    config, metadata, _ = accepted(root, source_sha)
    output = Path(output)
    if (output.resolve().is_relative_to(ROOT.resolve())
            or output.resolve().is_relative_to(Path(root).resolve()) or output.exists()):
        raise ValueError('Use a new final bundle directory outside the repository')
    bundle = Path(root) / 'bundle'
    allowed = {'README.md', 'RELEASE_NOTES.md', 'candidate.json', 'compose.yaml', 'verification.json'}
    for path in bundle.rglob('*'):
        relative = path.relative_to(bundle)
        if (path.is_symlink() or (path.is_file() and relative.parts[0] != 'notices'
                                 and str(relative) not in allowed)):
            raise ValueError('Unexpected candidate bundle file')
        if path.is_file() and (violations(str(relative)) or violations(path.read_text())):
            raise ValueError('Candidate bundle violates public metadata policy')
    config = final_images(config)
    metadata = {**metadata, 'application_candidate': VERSION,
                'promoted_from': metadata['application_candidate'],
                'images': {name: item['image'] for name, item in config['services'].items()}}
    shutil.copytree(bundle, output)
    (output / 'verification.json').rename(output / 'candidate-verification.json')
    (output / 'compose.yaml').write_text(json.dumps(config, indent=2) + '\n')
    (output / 'candidate.json').write_text(json.dumps(metadata, indent=2) + '\n')
    (output / '.env.example').write_text(example_environment(metadata))
    (output / 'RELEASE_NOTES.md').write_text(
        '# CookLens 2.0.0\n\n'
        'Photo recognition, confirmed recipes and an interactive cooking assistant on web and Expo Go Android.\n'
        'CPU / linux/amd64. Final images retain the accepted candidate manifests; no rebuild.\n\n'
        'Copy .env.example to .env and configure the accepted provider endpoint and your own key.\n'
        'Run docker compose up -d --wait. Open http://127.0.0.1:8080/.\n'
        'Without a key, photos, recipes and cooking steps remain available.\n\n'
        'See README.md for Expo, backup and rollback; candidate.json for acceptance and artifact versions; '
        'verification.json for the final anonymous-pull lifecycle and latency checks.\n'
        'Keep the previous bundle and a volume backup before upgrading. Do not run two bundles against the same volumes.\n'
        'Recipe provenance and AI-authored notices are included; source dataset rights were not independently audited.\n')
    if metadata.get('release_policy'):
        notes = output / 'RELEASE_NOTES.md'
        notes.write_text(notes.read_text() + '\n## Known limitations and deferred acceptance\n\n'
            'Released at the user\'s explicit request before complete manual acceptance.\n'
            'Physical Android camera/permissions/background coverage, the full live 50-case assistant evaluation '
            'and human answer-quality review remain unverified.\n'
            'Gemini may return rate limits, service errors or timeouts; cooking controls and recipes remain available.\n'
            'Automated CV, retrieval, browser and runtime checks are recorded separately. '
            'release_acceptance_complete remains false; this release does not claim those deferred checks passed.\n')
    print('PASS: final bundle prepared with empty-key configuration and original notices')


def verify_bundle(root, bundle, source_sha):
    config, accepted_metadata, identity = accepted(root, source_sha)
    bundle = Path(bundle)
    final_config, metadata, report = (read(bundle / name) for name in
                                    ('compose.yaml', 'candidate.json', 'verification.json'))
    expected_config = final_images(config)
    expected_images = {name: item['image'] for name, item in expected_config['services'].items()}
    expected_metadata = {**accepted_metadata, 'application_candidate': VERSION,
                         'promoted_from': accepted_metadata['application_candidate'], 'images': expected_images}
    if (final_config != expected_config or metadata != expected_metadata
            or report.get('application_candidate') != VERSION or report.get('images') != expected_images
            or read(bundle / 'candidate-verification.json') != read(Path(root) / 'bundle/verification.json')
            or not all(report.get(key) is True for key in ASSISTANT_SMOKE)):
        raise ValueError('Final bundle or smoke report differs from the accepted promotion')
    original = Path(root) / 'bundle'
    original_notices = {str(p.relative_to(original)): p.read_bytes()
                        for p in (original / 'notices').rglob('*') if p.is_file()}
    final_notices = {str(p.relative_to(bundle)): p.read_bytes()
                     for p in (bundle / 'notices').rglob('*') if p.is_file()}
    if (final_notices != original_notices
            or (bundle / 'README.md').read_bytes() != (original / 'README.md').read_bytes()):
        raise ValueError('Final bundle must preserve the accepted runbook and notices')
    candidate_report = {**report, 'application_candidate': accepted_metadata['application_candidate'],
                        'images': accepted_metadata['images']}
    verified_metadata(config, accepted_metadata, candidate_report)
    expected = promoted_identity(config, identity)
    if any(local_image_digest(ref) != digest for ref, digest in expected['digests'].items()):
        raise ValueError('Final smoke must use the accepted image digests')
    confirm_registry_identity(expected)


def package(root, bundle, archive, source_sha):
    verify_bundle(root, bundle, source_sha)
    bundle, archive = Path(bundle), Path(archive)
    if (archive.name != f'cooklens-{VERSION}.tar.gz' or archive.exists()
            or archive.resolve().is_relative_to(ROOT.resolve())
            or archive.resolve().is_relative_to(bundle.resolve())):
        raise ValueError('Use a new matching archive outside the source and bundle')
    allowed = {'README.md', 'RELEASE_NOTES.md', 'candidate.json', 'compose.yaml',
               'verification.json', 'candidate-verification.json', '.env.example'}
    members = sorted(path for path in bundle.rglob('*') if path.is_file() or path.is_symlink())
    for path in members:
        relative = path.relative_to(bundle)
        if (path.is_symlink() or (relative.parts[0] != 'notices' and str(relative) not in allowed)
                or violations(str(relative)) or violations(path.read_text())):
            raise ValueError('Final bundle contains unexpected or private content')
    if {p.name for p in bundle.iterdir() if p.is_file()} != allowed:
        raise ValueError('Final bundle is incomplete')
    if (bundle / '.env.example').read_text() != example_environment(read(bundle / 'candidate.json')):
        raise ValueError('Example configuration must match the accepted model and have an empty key')
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'x:gz') as output:
        for path in members:
            output.add(path, arcname=str(path.relative_to(bundle)), recursive=False)
    print('PASS: final standalone download packaged after anonymous-pull smoke')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'promote', 'package'))
    parser.add_argument('--accepted', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--archive', type=Path)
    args = parser.parse_args()
    if args.action == 'promote':
        promote(args.accepted, args.source_sha)
    elif args.action == 'prepare':
        if args.bundle is None:
            parser.error('--bundle is required')
        prepare(args.accepted, args.bundle, args.source_sha)
    else:
        if args.bundle is None or args.archive is None:
            parser.error('--bundle and --archive are required')
        package(args.accepted, args.bundle, args.archive, args.source_sha)
