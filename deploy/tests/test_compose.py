"""The root Compose must start the packaged app without source-build prerequisites."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which('docker'), 'Docker CLI is required to validate Compose')
class ComposeTests(unittest.TestCase):
    def config(self, **overrides):
        excluded = {'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES',
                    'COOKLENS_IMAGE_PREFIX', 'COOKLENS_IMAGE_TAG', 'HOST_PORT', 'HOST_BIND',
                    'LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_TIMEOUT_SECONDS',
                    'LLM_MAX_OUTPUT_TOKENS', 'LLM_MAX_INPUT_TOKENS'}
        env = {key: value for key, value in os.environ.items() if key not in excluded}
        env.update(overrides)
        output = subprocess.check_output(
            ['docker', 'compose', '--env-file', os.devnull, '-f', str(ROOT / 'compose.yaml'),
             'config', '--format', 'json'], cwd=ROOT, env=env)
        return json.loads(output)

    def test_default_start_needs_only_packaged_images(self):
        config = self.config()
        self.assertEqual(config['name'], 'cooklens')
        self.assertEqual(set(config['services']),
                         {'frontend', 'backend', 'vision', 'recipes', 'qdrant', 'recipe-init'})
        for name, service in config['services'].items():
            self.assertNotIn('build', service)
            self.assertNotIn('profiles', service)
            self.assertNotIn('container_name', service)
            self.assertTrue(all(v['type'] == 'volume' for v in service.get('volumes', [])))
            if name != 'qdrant':
                app = 'recipes' if name == 'recipe-init' else name
                self.assertEqual(service['image'], f'trantung2006/cooklens-{app}:2.0.0-rc.2')
        self.assertEqual(config['volumes']['recipe-index']['name'], 'cooklens_recipe-index')

    def test_frontend_waits_for_ai_and_index(self):
        services = self.config()['services']
        for service, dependency, condition in [
            ('recipe-init', 'qdrant', 'service_healthy'),
            ('recipes', 'recipe-init', 'service_completed_successfully'),
            ('backend', 'vision', 'service_healthy'),
            ('backend', 'recipes', 'service_healthy'),
            ('frontend', 'backend', 'service_healthy'),
        ]:
            self.assertEqual(services[service]['depends_on'][dependency]['condition'], condition)

    def test_lan_or_port_change_exposes_only_the_web_entrypoint(self):
        for overrides, host, port in [({}, '127.0.0.1', '8080'),
                                      ({'HOST_BIND': '192.0.2.10', 'HOST_PORT': '8090'},
                                       '192.0.2.10', '8090')]:
            with self.subTest(overrides=overrides):
                config = self.config(**overrides)
                for name, service in config['services'].items():
                    if name != 'frontend':
                        self.assertFalse(service.get('ports'))
                binding, = config['services']['frontend']['ports']
                self.assertEqual((binding['host_ip'], binding['published'], binding['target']),
                                 (host, port, 8080))
                self.assertTrue(config['networks']['application']['internal'])

    def test_llm_runtime_configuration_is_backend_only_and_ai_stays_internal(self):
        from uuid import uuid4
        key = 'test-' + str(uuid4())
        config = self.config(LLM_API_KEY=key, LLM_MAX_OUTPUT_TOKENS='256')
        backend = config['services']['backend']
        self.assertEqual(backend['environment']['LLM_API_KEY'], key)
        self.assertEqual(backend['environment']['LLM_MAX_OUTPUT_TOKENS'], '256')
        self.assertEqual(set(backend['networks']), {'application', 'llm-egress'})
        self.assertFalse(config['networks']['llm-egress'].get('internal', False))
        for name, service in config['services'].items():
            if name != 'backend':
                self.assertFalse(any(field.startswith('LLM_') for field in service.get('environment', {})))
                self.assertNotIn('llm-egress', service['networks'])
            if name in ('vision', 'recipes', 'recipe-init', 'qdrant'):
                self.assertEqual(set(service['networks']), {'application'})
        self.assertEqual(self.config()['services']['backend']['environment']['LLM_API_KEY'], '')
