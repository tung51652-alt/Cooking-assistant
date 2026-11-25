"""Acceptance tooling must keep mock outcomes, live evidence and human review separate."""
from copy import deepcopy
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlunsplit
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import evaluate_assistant as evaluation


class FakeApi:
    def __init__(self, failure=None):
        self.failure = failure
        self.calls = 0
        self.ids = []

    def request(self, path, body=None):
        if path.startswith('/api/recipes/'):
            return {'corpus_version': 'test-corpus', 'recipe': {'id': path.rsplit('/', 1)[-1]}}
        if path == '/api/assistant/sessions':
            identifier = str(uuid4())
            self.ids.append(identifier)
            self.session = {'id': identifier, 'recipe': {'id': body['recipe_id']}, 'corpus_version': 'test-corpus',
                            'recipe_version': 'test-recipe', 'status': 'ready', 'current_step': 0, 'total_steps': 3,
                            'version': 0, 'history': [], 'messages': [], 'created_at': 'now', 'expires_at': 'later'}
        elif path.endswith('/actions'):
            self.session.update(status='cooking', current_step=1, version=1)
        elif path.endswith('/messages'):
            self.calls += 1
            if self.failure == 'transport':
                raise evaluation.ApiError(504)
            self.session['version'] += 1
            self.session['messages'] += [{'role': 'user', 'text': body['text']},
                                         {'role': 'assistant', 'text': 'Theo công thức: trả lời giả lập.'}]
            if self.failure == 'state':
                self.session['current_step'] += 1
        return {'session': deepcopy(self.session)}


class AssistantEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.cases = evaluation.load_cases()

    def run_fixture(self, failure=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name) / 'run'
        api = FakeApi(failure)
        return api, directory, evaluation.run(api, self.cases, directory)

    def known_report(self):
        _, _, report = self.run_fixture()
        for row in report['calls']:
            row['usage'] = {'model': 'fixture-model', 'input_tokens': 4000, 'output_tokens': 350, 'status': 'settled'}
        return report

    def reviews(self, report):
        return {'report_id': report['report_id'], 'cases': {
            row['id']: dict.fromkeys(evaluation.FIELDS, True) for row in report['calls']}}

    def test_request_pacing_does_not_enter_http_latency_or_retry_calls(self):
        clock = [0.0]
        def now():
            clock[0] += .1
            return clock[0]
        def pause(seconds):
            clock[0] += seconds
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(evaluation.time, 'perf_counter', side_effect=now), \
                patch.object(evaluation.time, 'sleep', side_effect=pause) as sleep:
            api = FakeApi()
            report = evaluation.run(api, self.cases, Path(tmp) / 'paced', pause_seconds=5)
        self.assertEqual(api.calls,50)
        self.assertEqual(sleep.call_count,49)
        self.assertTrue(all(abs(row['seconds']-.1)<.000001 for row in report['calls']))
        self.assertEqual(report['request_pause_seconds'],5)
        self.assertIsNone(report['evaluation_passed'])
        for value in (-1,61,'nan','inf','invalid'):
            with self.assertRaises(argparse.ArgumentTypeError):
                evaluation.request_pause(value)

    def test_manifest_coverage_and_corpus_facts(self):
        corpus = {r['id']: r for r in json.loads((evaluation.ROOT / 'data/recipes/corpus.json').read_text(encoding='utf-8'))}
        for case in self.cases['single_turn'] + self.cases['conversations']:
            self.assertIn(case['recipe'], corpus)
            self.assertTrue(case['rubric'])
        normal = [c for c in self.cases['single_turn'] if c['group'] == 'normal']
        self.assertGreaterEqual(len({c['recipe'] for c in normal}), 4)
        recipe = corpus['cooklens_banh_can_home']
        self.assertIsNone(recipe['prep_time_minutes'])
        self.assertIsNone(recipe['cook_time_minutes'])
        self.assertIsNone(next(i['quantity'] for i in recipe['ingredients'] if i['name'] == 'Ớt băm'))
        self.assertIsNone(next(i['quantity'] for i in corpus['cooklens_banh_gio_home']['ingredients']
                               if i['name'] == 'Lá chuối sạch để gói'))

    def test_plan_does_not_construct_transport(self):
        with patch.object(sys, 'argv', ['evaluate_assistant.py']), patch.object(evaluation, 'Api') as api:
            self.assertEqual(evaluation.main(), 0)
            api.assert_not_called()

    def test_timing_parser_drops_untrusted_or_inconsistent_headers(self):
        header = 'assistant_prepare;dur=2.000, assistant_provider;dur=100.500, assistant_persist;dur=1.000, assistant_total;dur=104.000'
        timing = evaluation.parse_timing(header)
        self.assertEqual(timing['provider'], 100.5)
        for value in ('', header + ', secret;dur=1', header.replace('100.500', '-1'),
                      header.replace('104.000', '1.000'), header.replace('100.500', 'NaN')):
            self.assertIsNone(evaluation.parse_timing(value))
        self.assertEqual(evaluation.timing_diagnostics([{}])['known_calls'], 0)
        stats = evaluation.timing_diagnostics([{'server_timing_ms': timing}])
        self.assertEqual(stats['provider_p95_ms'], 100.5)
        self.assertEqual(stats['local_prepare_persist_p95_ms'], 3)

    def test_fifty_calls_unreviewed_never_pass_and_no_capabilities_in_artifacts(self):
        api, directory, report = self.run_fixture()
        self.assertEqual(api.calls, 50)
        self.assertEqual(len(api.ids), 29)
        self.assertEqual(len(report['calls']), 50)
        self.assertTrue(all(row['state_ok'] for row in report['calls']))
        self.assertIsNone(report['evaluation_passed'])
        self.assertIsNone(report['quality']['passed'])
        self.assertIsNone(report['usage']['passed'])
        text = (directory / 'report.json').read_text(encoding='utf-8')
        for capability in api.ids:
            self.assertNotIn(capability, text)
        self.assertNotIn('operation_id', text)

    def test_transport_and_wrong_state_stop_without_retry(self):
        for failure in ('transport', 'state'):
            api, _, report = self.run_fixture(failure)
            self.assertEqual(api.calls, 1)
            self.assertTrue(report['stopped'])
            self.assertFalse(report['evaluation_passed'])
            self.assertFalse(report['calls'][0]['state_ok'])

    def test_state_checks_reject_wrong_session_recipe_history_or_pair(self):
        before = {'id': 'a', 'version': 1, 'recipe': {'id': 'r'}, 'messages': [], 'history': [],
                  'corpus_version': 'c', 'recipe_version': 'r', 'status': 'cooking', 'current_step': 1,
                  'total_steps': 3, 'created_at': 'now', 'expires_at': 'later'}
        after = dict(before, version=2, messages=[{'role': 'user', 'text': 'q'}, {'role': 'assistant', 'text': 'a'}])
        self.assertTrue(evaluation.state_ok(before, after, 'q'))
        for key, value in [('id', 'b'), ('recipe', {'id': 'other'}), ('history', [{}]), ('version', 3),
                           ('messages', [{'role': 'assistant', 'text': 'a'}]),
                           ('messages', [{'role': 'user', 'text': 'q'}, 'invalid assistant record'])]:
            self.assertFalse(evaluation.state_ok(before, dict(after, **{key: value}), 'q'))

    def test_latency_nearest_rank_boundaries_and_failures_are_not_filtered(self):
        rows = [{'seconds': 2.5, 'state_ok': True} for _ in range(50)]
        rows[-3:] = [{'seconds': 6, 'state_ok': True}, {'seconds': 8, 'state_ok': True}, {'seconds': 8, 'state_ok': True}]
        result = evaluation.latency_gate(rows)
        self.assertTrue(result['passed'])
        self.assertEqual(result['p95_seconds'], 6)
        rows[-1]['seconds'] = 8.01
        self.assertFalse(evaluation.latency_gate(rows)['passed'])
        rows[-1]['seconds'] = 8
        rows[0]['state_ok'] = False
        self.assertFalse(evaluation.latency_gate(rows)['passed'])
        self.assertFalse(evaluation.latency_gate(rows[:-1])['passed'])

    def test_release_summary_requires_review_and_exports_only_aggregate_metrics(self):
        report = self.known_report()
        with self.assertRaises(ValueError):
            evaluation.release_metrics(report, 'nvidia', 'reported-model')
        report['controlled'] = {'passed': True, 'cases': dict.fromkeys(('F01', 'F02', 'F03', 'F04'), True)}
        evaluation.summarize(report, self.reviews(report))
        with self.assertRaises(ValueError):
            evaluation.release_metrics(report, 'nvidia', 'reported-model')
        report['candidate_identity'] = {'tag': 'v2.0.0-rc.3', 'source_sha': 'a' * 40,
                                        'digests': {'trantung2006/cooklens-backend:2.0.0-rc.3': 'sha256:' + 'b' * 64}}
        summary = evaluation.release_metrics(report, 'nvidia', 'reported-model')
        self.assertEqual(summary['model_selector'], 'fixture-model')
        self.assertEqual(summary['model'], 'reported-model')
        self.assertEqual(summary['identity'], report['candidate_identity'])
        self.assertEqual(summary['live_cases'], 50)
        self.assertEqual(summary['controlled_cases'], 4)
        self.assertEqual(summary['mean_input'], 4000)
        self.assertNotIn('answer', json.dumps(summary))

    def test_usage_unknown_is_not_zero_and_thresholds_are_enforced(self):
        report = self.known_report()
        self.assertTrue(evaluation.usage_gate(report['calls'])['passed'])
        for usage in (None, {'status': 'unknown', 'input_tokens': 1, 'output_tokens': None}):
            report['calls'][0]['usage'] = usage
            self.assertIsNone(evaluation.usage_gate(report['calls'])['passed'])
        report = self.known_report()
        report['calls'][0]['usage']['output_tokens'] = 513
        self.assertFalse(evaluation.usage_gate(report['calls'])['passed'])
        report = self.known_report()
        report['calls'][0]['usage']['input_tokens'] = 6001
        self.assertFalse(evaluation.usage_gate(report['calls'])['passed'])

    def test_quality_requires_complete_matching_human_review_and_all_critical_checks(self):
        report = self.known_report()
        review = self.reviews(report)
        self.assertTrue(evaluation.quality_gate(report, review)['passed'])
        review['report_id'] = 'other-run'
        self.assertIsNone(evaluation.quality_gate(report, review)['passed'])
        review = self.reviews(report)
        review['cases']['N01']['grounding'] = False
        self.assertFalse(evaluation.quality_gate(report, review)['passed'])
        review['cases']['N01']['grounding'] = None
        self.assertIsNone(evaluation.quality_gate(report, review)['passed'])
        review = self.reviews(report)
        for name in ('N01', 'N02', 'N03'):
            review['cases'][name]['helpfulness'] = False
        self.assertTrue(evaluation.quality_gate(report, review)['passed'])
        review['cases']['N04']['helpfulness'] = False
        self.assertFalse(evaluation.quality_gate(report, review)['passed'])

    def test_actual_sqlite_usage_correlates_only_hashed_call_keys(self):
        _, directory, report = self.run_fixture()
        database = directory / 'usage.sqlite'
        with closing(sqlite3.connect(database)) as connection:
            connection.execute('CREATE TABLE llm_calls(call_key TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,status TEXT)')
            connection.execute('INSERT INTO llm_calls VALUES(?,?,?,?,?)',
                               (report['calls'][0]['call_key'], 'fixture', 120, 30, 'settled'))
            connection.commit()
        evaluation.collect_usage(report, database)
        self.assertEqual(report['calls'][0]['usage']['input_tokens'], 120)
        self.assertIsNone(report['calls'][1]['usage'])
        self.assertIsNone(evaluation.usage_gate(report['calls'])['passed'])
        with self.assertRaises(ValueError):
            evaluation.collect_usage(report, directory / 'missing.sqlite')

    def test_controlled_results_require_named_passing_mock_testcases(self):
        _, directory, report = self.run_fixture()
        junit = directory / 'junit.xml'
        tests = ''.join(f'<testcase classname="com.cooklens.AssistantChatIntegrationTest" name="{c["test"]}"/>'
                        for c in self.cases['controlled'])
        junit.write_text('<testsuite>' + tests + '</testsuite>', encoding='utf-8')
        evaluation.collect_controls(report, self.cases, junit)
        self.assertTrue(report['controlled']['passed'])
        junit.write_text('<testsuite>' + tests.replace('/>', '><skipped/></testcase>', 1) + '</testsuite>', encoding='utf-8')
        evaluation.collect_controls(report, self.cases, junit)
        self.assertFalse(report['controlled']['passed'])
        junit.write_text('<testsuite/>', encoding='utf-8')
        evaluation.collect_controls(report, self.cases, junit)
        self.assertIsNone(report['controlled']['passed'])

    def test_transport_rejects_redirects_credential_urls_and_retries(self):
        credential_url = urlunsplit(('https', 'user:secret@example.com', '', '', ''))
        for base in ('http://example.com', credential_url, 'https://example.com?key=secret',
                     'https://example.com/v1', 'file:///tmp'):
            with self.assertRaises(ValueError):
                evaluation.Api(base)
        api = evaluation.Api('http://127.0.0.1:8080')
        self.assertIsNone(evaluation.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other'))
        api.opener = Mock()
        api.opener.open.side_effect = OSError('untrusted sensitive detail')
        with self.assertRaises(evaluation.ApiError) as error:
            api.request('/api/assistant/sessions', {'text': 'question'})
        self.assertNotIn('sensitive', str(error.exception))
        self.assertEqual(api.opener.open.call_count, 1)


if __name__ == '__main__':
    unittest.main()
