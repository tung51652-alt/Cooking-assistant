"""Candidate transfer must preserve isolation, image versions and honest acceptance metadata."""
from copy import deepcopy
import argparse
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_candidate_bundle import ROOT, candidate_config, prepare
from smoke_release_stack import latency_summary, sample_count


def compose():
    services = {name: {'image': f'cooklens-{name}:2.0.0-rc.1'}
                for name in ('vision', 'recipes', 'backend', 'frontend')}
    services['recipe-init'] = {'image': services['recipes']['image']}
    services['qdrant'] = {'image': 'qdrant/qdrant:v1.19.2',
                          'volumes': [{'type': 'volume', 'source': 'recipe-index', 'target': '/qdrant/storage'}]}
    services['frontend']['ports'] = [{'host_ip': '127.0.0.1', 'published': '8080', 'target': 8080}]
    return {'name': 'original-project', 'services': services,
            'networks': {'application': {'name': 'original-project_application', 'internal': True}},
            'volumes': {'recipe-index': {'name': 'original-project_recipe-index'}}}


class CandidateBundleTests(unittest.TestCase):
    def test_port_override_and_project_isolation_survive_packaging(self):
        original = compose()
        snapshot = deepcopy(original)
        config, version = candidate_config(original)
        self.assertEqual(original, snapshot)
        self.assertEqual(version, '2.0.0-rc.1')
        self.assertEqual(config['services']['frontend']['ports'][0]['published'], '${HOST_PORT:-8080}')
        self.assertNotIn('name', config['volumes']['recipe-index'])
        self.assertNotIn('name', config['networks']['application'])

    def test_rejects_host_dependencies_exposure_and_incompatible_images(self):
        mutations = [
            lambda c: c['services']['vision'].update(build={'context': '.'}),
            lambda c: c['services']['qdrant']['volumes'][0].update(type='bind'),
            lambda c: c['services']['vision'].update(ports=[{'target': 8000}]),
            lambda c: c['services']['frontend']['ports'][0].update(host_ip='0.0.0.0'),
            lambda c: c['services']['backend'].update(image='cooklens-backend:latest'),
            lambda c: c['services']['backend'].update(image='cooklens-backend:2.0.0'),
            lambda c: c['services']['backend'].update(image='cooklens-vision:2.0.0-rc.1'),
            lambda c: c['services']['qdrant'].update(image='other/qdrant:v1.19.2'),
            lambda c: c['services']['recipe-init'].update(image='other-recipes:2.0.0-rc.1'),
            lambda c: c['volumes']['recipe-index'].update(external=True),
            lambda c: c.update(secrets={'local-file': {'file': '/private/token'}}),
        ]
        for mutate in mutations:
            value = compose()
            mutate(value)
            with self.subTest(mutation=mutations.index(mutate)), self.assertRaises(ValueError):
                candidate_config(value)

    def test_rejects_prohibited_metadata_without_copying_it_to_output(self):
        with self.assertRaises(ValueError):
            prepare(compose(), ROOT / 'candidate-output')
        value = compose()
        value['services']['vision']['environment'] = {'UNSAFE_VALUE': 'a' * 64}
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            with self.assertRaises(ValueError):
                prepare(value, output)
            self.assertFalse(output.exists())

    def test_bundle_includes_versions_and_notices_but_never_claims_registry_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'candidate'
            prepare(compose(), output)
            metadata = json.loads((output / 'candidate.json').read_text(encoding='utf-8'))
            self.assertFalse(metadata['registry_published'])
            self.assertFalse(metadata['release_acceptance_complete'])
            self.assertFalse(metadata['images_included'])
            self.assertFalse((output / 'verification.json').exists())
            self.assertEqual(len(list((output / 'notices').iterdir())), 10)
            self.assertTrue((output / 'notices/AUTHORSHIP.md').is_file())
            self.assertEqual(metadata['application_candidate'], '2.0.0-rc.1')
            for path in output.rglob('*.md'):
                for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
                    if '://' not in link and not link.startswith('#'):
                        self.assertTrue((path.parent / link.split('#')[0]).exists(), path.name)
            marker = output / 'keep.txt'
            marker.write_text('user file')
            with self.assertRaises(FileExistsError):
                prepare(compose(), output)
            self.assertEqual(marker.read_text(), 'user file')


class LatencyReportTests(unittest.TestCase):
    def test_p95_requires_100_samples_and_uses_nearest_rank(self):
        self.assertIsNone(latency_summary([1, 2, 3])['p95_seconds'])
        self.assertEqual(latency_summary(list(range(1, 101)))['p95_seconds'], 95)

    def test_sample_budget_is_bounded(self):
        self.assertEqual(sample_count('100'), 100)
        for value in ('0', '-1', '1001'):
            with self.assertRaises(argparse.ArgumentTypeError):
                sample_count(value)
