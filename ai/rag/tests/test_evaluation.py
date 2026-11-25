"""Keep retrieval arithmetic and its acceptance boundary honest."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from ai.rag.evaluation.evaluate import evaluate


class EvaluationTests(unittest.TestCase):
    def measure(self, *, cross_dish=False, wrong_ground_truth=False):
        def handler(request):
            if request.url.path == '/health/ready':
                body = {'corpus_version': 'test-v1'}
            elif request.url.path == '/dishes':
                body = {'dishes': [{'normalized_dish': 'pho'}]}
            elif request.url.path.startswith('/recipes/'):
                body = {'corpus_version': 'test-v1', 'recipe': {'normalized_dish': 'banh_mi' if wrong_ground_truth else 'pho'}}
            else:
                query = json.loads(request.content)['query']
                ids = {'first': ['target'], 'second': ['other', 'target'], 'miss': ['other']}[query]
                body = {'corpus_version': 'test-v1', 'recipes': [
                    {'id': value, 'normalized_dish': 'banh_mi' if cross_dish else 'pho'} for value in ids]}
            return httpx.Response(200, json=body)

        cases = [{'case': q, 'confirmed_dish': 'pho', 'query': q, 'relevant_ids': ['target'], 'kind': 'positive'}
                 for q in ['first', 'second', 'miss']]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'queries.json'
            path.write_text(json.dumps({'review_status': 'separate_semantic_pass_same_agent',
                                        'external_review_complete': False, 'cases': cases}))
            client = httpx.Client(base_url='http://recipe-test', transport=httpx.MockTransport(handler))
            with patch('ai.rag.evaluation.evaluate.httpx.Client', return_value=client):
                return evaluate('http://recipe-test', path)

    def test_known_rank_positions_produce_correct_metrics_without_acceptance(self):
        result = self.measure()
        self.assertAlmostEqual(result['hit_at_1'], 1/3)
        self.assertAlmostEqual(result['hit_at_3'], 2/3)
        self.assertAlmostEqual(result['mrr'], .5)
        self.assertFalse(result['technical_gate_met'])
        self.assertFalse(result['acceptance_gate_met'])

    def test_cross_dish_result_is_a_hard_failure(self):
        with self.assertRaisesRegex(ValueError, 'crossed'):
            self.measure(cross_dish=True)

    def test_ground_truth_cannot_point_to_a_different_dish(self):
        with self.assertRaisesRegex(ValueError, 'Ground truth'):
            self.measure(wrong_ground_truth=True)


if __name__ == '__main__':
    unittest.main()
