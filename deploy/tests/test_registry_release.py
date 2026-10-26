"""Registry acceptance cannot be claimed from a local candidate or mismatched bundle."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_candidate_bundle import prepare
from registry_release import package, preflight, registry_images, release_version, verified_metadata
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
        'warm_latency_targets_passed': True, 'artifact_versions_match': True,
        'catalog_dishes_searched': 30, 'warm_sequential_samples': 100,
        'vision_p95_seconds': .5, 'search_p95_seconds': .2,
    }


class RegistryReleaseTests(unittest.TestCase):
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
            config = json.loads((output / 'compose.release.yaml').read_text())
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
            package(output, archive)
            with tarfile.open(archive) as source:
                names = source.getnames()
                self.assertIn('compose.release.yaml', names)
                self.assertIn('notices/AUTHORSHIP.md', names)
                published = json.load(source.extractfile('candidate.json'))
                self.assertTrue(published['registry_pull_verified'])
                self.assertFalse(published['release_acceptance_complete'])
            original = archive.read_bytes()
            with self.assertRaises(FileExistsError):
                package(output, archive)
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
