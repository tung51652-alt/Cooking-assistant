"""Registry acceptance cannot be claimed from a local candidate or mismatched bundle."""
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_candidate_bundle import prepare
from registry_release import (
    candidate_identity,
    confirm_registry_identity,
    package,
    preflight,
    registry_images,
    release_version,
    verified_metadata,
)
from test_candidate_bundle import compose


def registry_config():
    config = compose()
    for service in config['services'].values():
        if service['image'].startswith('cooklens-'):
            service['image'] = 'trantung2006/' + service['image'].replace('2.0.0-rc.1', '2.0.0-rc.2')
    return config


def report(metadata):
    return {
        'application_candidate': metadata['application_candidate'], 'images': metadata['images'],
        'public_api_version': metadata['public_api_version'], 'registry_pull_verified': True,
        'standalone_compose_without_source_mounts': True, 'fresh_volume_seed': True,
        'repeat_seed_and_restart_persisted': True, 'version_upgrade_and_rollback': True,
        'invalid_bundle_rejected': True, 'dependency_stop_recovery': True,
        'offline_full_flow_through_frontend': True, 'only_frontend_published_on_loopback': True,
        'assistant_without_key_and_offline': True, 'assistant_session_restart_and_recreate': True,
        'assistant_volume_backup_restored': True,
        'warm_latency_targets_passed': True, 'artifact_versions_match': True,
        'catalog_dishes_searched': 30, 'warm_sequential_samples': 100,
        'vision_p95_seconds': .5, 'search_p95_seconds': .2,
    }


def evidence(metadata):
    version = metadata['application_candidate']
    identity = {'tag': 'v' + version, 'source_sha': 'a' * 40,
                'digests': {image: 'sha256:' + 'b' * 64 for image in set(metadata['images'].values())}}
    vision = {'application_candidate': version, 'model_version': metadata['model_version'],
              'taxonomy_version': metadata['taxonomy_version'], 'split': '2026-09-30-clean-split/Test',
              'images': 5004, 'classes': 30, 'top3': .96, 'top3_gate_met': True}
    flow = {'application_candidate': version, 'browser_stats': {'expected': 10, 'unexpected': 0, 'flaky': 0},
            'photo_flows': [{'dish': f'dish-{i}', 'confirmed_dish_flow_passed': True} for i in range(30)], 'retrieval': {
        'corpus_version': metadata['corpus_version'], 'positive_queries': 204, 'covered_dishes': 30,
        'hit_at_1': .92, 'hit_at_3': .98, 'cross_dish_results': 0, 'technical_gate_met': True,
    }}
    manual = {'identity': identity, 'android': {'version': 12, 'expo_sdk': 58, 'device': 'Test phone', 'passed': True},
              'web_live': True, 'provider_recovery': True, 'session_restore_rollback': True,
              'bundle_review': True, 'reviewed': True,
              'assistant': {'passed': True, 'identity': identity, 'live_cases': 50, 'controlled_cases': 4,
                            'provider': 'nvidia', 'model_selector': 'selected-model', 'model': 'reported-model',
                            'p50': 1, 'p95': 3, 'max': 4, 'mean_input': 2000, 'p95_input': 2200,
                            'mean_output': 120, 'max_output': 280, 'normal_pass_rate': .95,
                            'critical_checks_passed': True}}
    return {'identity': identity, 'vision': vision, 'flow': flow, 'manual': manual}


class RegistryReleaseTests(unittest.TestCase):
    def test_final_images_are_allowed_only_for_explicit_runtime_validation(self):
        config=registry_config()
        for service in config['services'].values():
            if 'cooklens-' in service['image']:
                service['image']=service['image'].replace('2.0.0-rc.2','2.0.0')
        self.assertEqual(registry_images(config,allow_final=True)[1],'2.0.0')
        with self.assertRaises(ValueError):
            registry_images(config)
        with self.assertRaises(ValueError):
            preflight(config)
    def test_push_and_pull_identity_use_the_same_registry_digests(self):
        config, version = registry_images(registry_config())
        refs = sorted({service['image'] for service in config['services'].values()})
        digests = {ref: 'sha256:' + str(index) * 64 for index, ref in enumerate(refs, 1)}
        tag, sha = 'v' + version, 'a' * 40
        with patch('registry_release.local_image_digest', side_effect=digests.__getitem__) as inspected:
            pushed = candidate_identity(config, tag, sha, {ref: digests[ref] for ref in refs if 'cooklens-' in ref})
            self.assertEqual(inspected.call_count, 1)
            pulled = candidate_identity(config, tag, sha)
            self.assertEqual(pushed, pulled)
        with patch('registry_release.quiet_command', side_effect=lambda parts: f'Digest:    {digests[parts[-1]]}\n'.encode()):
            confirm_registry_identity(pulled)
        with patch('registry_release.quiet_command', return_value=('Digest: sha256:' + '0' * 64).encode()):
            with self.assertRaisesRegex(ValueError, 'no longer serves'):
                confirm_registry_identity(pulled)

    def test_release_tags_and_registry_namespace_are_restricted(self):
        self.assertEqual(release_version('v2.0.0-rc.2'), '2.0.0-rc.2')
        for tag in ('v2.0.0', 'latest', 'v2.0.0-rc.0', 'v3.0.0-rc.1', 'v2.0.0-rc.2/extra'):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                release_version(tag)
        config = registry_config()
        self.assertEqual(registry_images(config)[1], '2.0.0-rc.2')
        config['services']['backend']['image'] = 'other/cooklens-backend:2.0.0-rc.2'
        with self.assertRaises(ValueError):
            registry_images(config)

    def test_existing_tags_and_private_repositories_cannot_be_pushed(self):
        for resource in ({'is_private': True}, {'is_private': False}):
            with patch('registry_release.hub_resource', return_value=resource), self.assertRaises(ValueError):
                preflight(registry_config())
        with patch('registry_release.hub_resource', return_value=None):
            preflight(registry_config())

    def test_local_or_incomplete_reports_never_become_registry_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            prepare(registry_config(), output)
            config = json.loads((output / 'compose.yaml').read_text())
            metadata = json.loads((output / 'candidate.json').read_text())
            valid = report(metadata)
            changes = [
                {'registry_pull_verified': False}, {'artifact_versions_match': False},
                {'dependency_stop_recovery': False}, {'warm_sequential_samples': 10},
                {'vision_p95_seconds': None}, {'search_p95_seconds': 4},
                {'application_candidate': '2.0.0-rc.1'}, {'images': {}},
            ]
            for changeset in changes:
                with self.subTest(fields=list(changeset)), self.assertRaises(ValueError):
                    verified_metadata(config, metadata, {**valid, **changeset})
            updated, version = verified_metadata(config, metadata, valid)
            self.assertEqual(version, '2.0.0-rc.2')
            self.assertTrue(updated['registry_published'])
            self.assertFalse(updated['release_acceptance_complete'])
            self.assertFalse(metadata['registry_published'])

    def test_verified_archive_contains_only_configuration_report_and_notices(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            prepare(registry_config(), output)
            metadata = json.loads((output / 'candidate.json').read_text())
            (output / 'verification.json').write_text(json.dumps(report(metadata)))
            archive = Path(tmp) / 'cooklens-2.0.0-rc.2.tar.gz'
            package(output, archive, **evidence(metadata))
            with tarfile.open(archive) as source:
                names = source.getnames()
                self.assertIn('compose.yaml', names)
                self.assertIn('notices/AUTHORSHIP.md', names)
                published = json.load(source.extractfile('candidate.json'))
                self.assertTrue(published['registry_pull_verified'])
                self.assertTrue(published['release_acceptance_complete'])
                self.assertEqual(published['phase13_acceptance']['vision_top3'], .96)
                self.assertNotIn('source_sha', json.dumps(published))
            original = archive.read_bytes()
            with self.assertRaises(FileExistsError):
                package(output, archive, **evidence(metadata))
            self.assertEqual(archive.read_bytes(), original)

    def test_unverified_bundle_is_not_archived(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            prepare(registry_config(), output)
            metadata = json.loads((output / 'candidate.json').read_text())
            (output / 'verification.json').write_text(json.dumps({**report(metadata), 'registry_pull_verified': False}))
            archive = Path(tmp) / 'release.tar.gz'
            with self.assertRaises(ValueError):
                package(output, archive)
            self.assertFalse(archive.exists())

    def test_clean_pull_without_same_candidate_live_and_human_evidence_cannot_be_archived(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            prepare(registry_config(), output)
            metadata = json.loads((output / 'candidate.json').read_text())
            (output / 'verification.json').write_text(json.dumps(report(metadata)))
            archive = Path(tmp) / 'release.tar.gz'
            with self.assertRaises(ValueError):
                package(output, archive)
            for change in ('identity', 'assistant-identity', 'quality', 'vision', 'retrieval', 'flow', 'browser', 'android', 'review'):
                checks = evidence(metadata)
                if change == 'identity':
                    checks['manual']['identity'] = {**checks['identity'], 'source_sha': 'c' * 40}
                elif change == 'assistant-identity':
                    checks['manual']['assistant']['identity'] = {**checks['identity'], 'source_sha': 'c' * 40}
                elif change == 'quality':
                    checks['manual']['assistant']['normal_pass_rate'] = .89
                elif change == 'vision':
                    checks['vision']['top3'] = .94
                elif change == 'retrieval':
                    checks['flow']['retrieval']['cross_dish_results'] = 1
                elif change == 'flow':
                    checks['flow']['photo_flows'].pop()
                elif change == 'browser':
                    checks['flow']['browser_stats']['expected'] = 0
                elif change == 'android':
                    checks['manual']['android']['version'] = 9
                else:
                    checks['manual']['reviewed'] = False
                with self.subTest(change=change), self.assertRaises(ValueError):
                    package(output, archive, **checks)
                self.assertFalse(archive.exists())
