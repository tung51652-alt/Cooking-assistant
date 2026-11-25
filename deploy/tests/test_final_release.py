"""Final publication must preserve accepted source, manifests and standalone gates."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import final_release
from prepare_candidate_bundle import prepare
from registry_release import package
from test_registry_release import evidence, registry_config, report


class FinalReleaseTests(unittest.TestCase):
    def defer_manual_checks(self):
        policy = final_release.read(final_release.ROOT / 'deploy/artifacts/mvp-release-policy.json')
        (self.root / 'release-policy.json').write_text(json.dumps(policy))
        return policy

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'accepted'
        self.root.mkdir()
        bundle = self.root / 'bundle'
        prepare(registry_config(), bundle)
        metadata = json.loads((bundle / 'candidate.json').read_text())
        (bundle / 'verification.json').write_text(json.dumps(report(metadata)))
        self.proof = evidence(metadata)
        for name, value in self.proof.items():
            (self.root / (name + '.json')).write_text(json.dumps(value))
        package(bundle, Path(self.tmp.name) / 'candidate.tar.gz', **self.proof)
        self.source = self.proof['identity']['source_sha']
        self.bundle = Path(self.tmp.name) / 'final'
        self.archive = Path(self.tmp.name) / 'cooklens-2.0.0.tar.gz'

    def prepare_final(self):
        final_release.prepare(self.root, self.bundle, self.source)
        metadata = json.loads((self.bundle / 'candidate.json').read_text())
        (self.bundle / 'verification.json').write_text(json.dumps(report(metadata)))

    def test_missing_acceptance_wrong_source_or_missing_android_cannot_be_promoted(self):
        with self.assertRaises(ValueError):
            final_release.accepted(self.root, 'c' * 40)
        manual = deepcopy(self.proof['manual'])
        manual['android']['passed'] = False
        (self.root / 'manual.json').write_text(json.dumps(manual))
        with patch('final_release.quiet_command') as command, self.assertRaises(ValueError):
            final_release.promote(self.root, self.source)
        command.assert_not_called()

    def test_user_authorized_release_keeps_manual_acceptance_incomplete(self):
        policy = self.defer_manual_checks()
        (self.root / 'manual.json').unlink()
        self.prepare_final()
        metadata = final_release.read(self.bundle / 'candidate.json')
        self.assertFalse(metadata['release_acceptance_complete'])
        self.assertNotIn('phase13_acceptance',metadata)
        self.assertEqual(metadata['release_policy'],policy)
        self.assertEqual(metadata['automated_acceptance']['vision_top3'],.96)
        self.assertIn('remain unverified',(self.bundle / 'RELEASE_NOTES.md').read_text())
        with patch('final_release.local_image_digest',return_value='sha256:'+'b'*64), patch('final_release.confirm_registry_identity'):
            final_release.package(self.root,self.bundle,self.archive,self.source)

    def test_manual_exception_cannot_waive_runtime_vision_or_source(self):
        self.defer_manual_checks()
        with self.assertRaises(ValueError):
            final_release.accepted(self.root,'c'*40)
        vision = final_release.read(self.root / 'vision.json')
        (self.root / 'vision.json').write_text(json.dumps({**vision,'top3':.94}))
        with self.assertRaises(ValueError):
            final_release.accepted(self.root,self.source)
        (self.root / 'vision.json').write_text(json.dumps(vision))
        path=self.root / 'bundle/verification.json'
        path.write_text(json.dumps({**final_release.read(path),'registry_pull_verified':False}))
        with self.assertRaises(ValueError):
            final_release.accepted(self.root,self.source)

    def test_unapproved_extra_exception_is_rejected(self):
        policy=self.defer_manual_checks()
        policy['deferred_checks'].append('registry_pull')
        (self.root / 'release-policy.json').write_text(json.dumps(policy))
        with self.assertRaises(ValueError):
            final_release.accepted(self.root,self.source)

    def test_existing_destination_prevents_any_promotion(self):
        def hub(path):
            return {} if path.endswith('cooklens-frontend/tags/2.0.0') else None
        with patch('final_release.confirm_registry_identity'), patch('final_release.hub_resource', side_effect=hub), \
                patch('final_release.quiet_command') as command, self.assertRaisesRegex(ValueError, 'already exists'):
            final_release.promote(self.root, self.source)
        command.assert_not_called()

    def test_private_destination_prevents_any_promotion(self):
        with patch('final_release.confirm_registry_identity'), \
                patch('final_release.hub_resource', return_value={'is_private': True}), \
                patch('final_release.quiet_command') as command, self.assertRaisesRegex(ValueError, 'public'):
            final_release.promote(self.root, self.source)
        command.assert_not_called()

    def test_promote_uses_digest_sources_and_preserves_single_manifest(self):
        with patch('final_release.confirm_registry_identity') as verify, \
                patch('final_release.hub_resource', return_value=None), \
                patch('final_release.quiet_command') as command:
            final_release.promote(self.root, self.source)
        self.assertEqual(command.call_count, 4)
        for call in command.call_args_list:
            args = call.args[0]
            self.assertIn('--prefer-index=false', args)
            self.assertTrue(args[-2].endswith(':2.0.0'))
            self.assertIn('@sha256:', args[-1])
        self.assertEqual(verify.call_count, 2)
        self.assertEqual(set(verify.call_args.args[0]['digests'].values()), {'sha256:' + 'b' * 64})

    def test_prepare_preserves_artifacts_and_uses_accepted_llm_selector(self):
        self.prepare_final()
        metadata = json.loads((self.bundle / 'candidate.json').read_text())
        self.assertEqual(metadata['application_candidate'], '2.0.0')
        self.assertEqual(metadata['promoted_from'], '2.0.0-rc.2')
        self.assertIn('LLM_MODEL=selected-model\n', (self.bundle / '.env.example').read_text())
        self.assertIn('LLM_API_KEY=\n', (self.bundle / '.env.example').read_text())
        self.assertEqual(metadata['images']['qdrant'], 'qdrant/qdrant:v1.19.2')
        self.assertTrue((self.bundle / 'notices/AUTHORSHIP.md').is_file())
        with self.assertRaises(ValueError):
            final_release.prepare(self.root, self.bundle, self.source)
        with self.assertRaises(ValueError):
            final_release.prepare(self.root, self.root / 'bundle/nested', self.source)

    def test_gemini_bundle_selects_google_endpoint_and_accepted_model(self):
        self.proof['manual']['assistant'].update(provider='gemini', model_selector='gemini-3.1-flash-lite')
        (self.root / 'manual.json').write_text(json.dumps(self.proof['manual']))
        package(self.root / 'bundle',Path(self.tmp.name) / 'gemini-candidate.tar.gz',**self.proof)
        self.prepare_final()
        environment=(self.bundle / '.env.example').read_text()
        self.assertIn('LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai\n',environment)
        self.assertIn('LLM_MODEL=gemini-3.1-flash-lite\n',environment)
        self.assertIn('LLM_API_KEY=\n',environment)

    def test_final_report_requires_anonymous_pull_assistant_and_exact_images(self):
        self.prepare_final()
        path = self.bundle / 'verification.json'
        original = json.loads(path.read_text())
        for change in ({'registry_pull_verified': False}, {'assistant_volume_backup_restored': False},
                       {'images': {}}, {'application_candidate': '2.0.0-rc.2'}, {'warm_sequential_samples': 10}):
            path.write_text(json.dumps({**original, **change}))
            with self.subTest(change=change), self.assertRaises(ValueError):
                final_release.package(self.root, self.bundle, self.archive, self.source)
            self.assertFalse(self.archive.exists())

    def test_pulled_manifest_mismatch_prevents_packaging(self):
        self.prepare_final()
        with patch('final_release.local_image_digest', return_value='sha256:' + 'c' * 64), self.assertRaisesRegex(ValueError, 'digests'):
            final_release.package(self.root, self.bundle, self.archive, self.source)
        self.assertFalse(self.archive.exists())

    def test_verified_archive_has_empty_example_original_notices_and_no_raw_identity(self):
        self.prepare_final()
        with patch('final_release.local_image_digest', return_value='sha256:' + 'b' * 64), \
                patch('final_release.confirm_registry_identity'):
            final_release.package(self.root, self.bundle, self.archive, self.source)
            with self.assertRaises(ValueError):
                final_release.package(self.root, self.bundle, self.archive, self.source)
        with tarfile.open(self.archive) as archive:
            self.assertIn('.env.example', archive.getnames())
            self.assertIn('notices/AUTHORSHIP.md', archive.getnames())
            self.assertNotIn('identity.json', archive.getnames())
            self.assertNotIn(self.source, archive.extractfile('candidate.json').read().decode())

    def test_extra_files_or_symlinks_cannot_be_included(self):
        self.prepare_final()
        path = self.bundle / 'sessions.sqlite'
        path.write_text('private session')
        with patch('final_release.local_image_digest', return_value='sha256:' + 'b' * 64), \
                patch('final_release.confirm_registry_identity'), self.assertRaises(ValueError):
            final_release.package(self.root, self.bundle, self.archive, self.source)
        path.unlink()
        path.symlink_to(self.root / 'manual.json')
        with patch('final_release.local_image_digest', return_value='sha256:' + 'b' * 64), \
                patch('final_release.confirm_registry_identity'), self.assertRaises(ValueError):
            final_release.package(self.root, self.bundle, self.archive, self.source)

    def test_changed_notice_or_example_configuration_cannot_be_packaged(self):
        self.prepare_final()
        notice = self.bundle / 'notices/AUTHORSHIP.md'
        original = notice.read_text()
        for target, content in ((notice, 'Changed notice'),
                                (self.bundle / '.env.example', 'LLM_API_KEY=\nLLM_API_KEY=private-key\n')):
            target.write_text(content)
            with patch('final_release.local_image_digest', return_value='sha256:' + 'b' * 64), \
                    patch('final_release.confirm_registry_identity'), self.assertRaises(ValueError):
                final_release.package(self.root, self.bundle, self.archive, self.source)
            notice.write_text(original)
