"""Measure the fixed query set; distinguish technical thresholds from external acceptance."""
import argparse
import json
from pathlib import Path

import httpx


def evaluate(url, queries):
    specification = json.loads(queries.read_text())
    cases = specification['cases']
    if not cases or len({c['case'] for c in cases}) != len(cases):
        raise ValueError('Evaluation cases must be nonempty and uniquely named')
    positives = hit1 = hit3 = empty = cross_dish = holdout = holdout_hit1 = 0
    reciprocal_rank = 0.
    covered = set()
    with httpx.Client(base_url=url, timeout=5, trust_env=False) as client:
        response = client.get('/health/ready')
        response.raise_for_status()
        version = response.json()['corpus_version']
        response = client.get('/dishes')
        response.raise_for_status()
        catalog = {d['normalized_dish'] for d in response.json()['dishes']}
        expected_dishes = {}
        for case in cases:
            if case['confirmed_dish'] not in catalog:
                raise ValueError('Evaluation dish is outside the taxonomy')
            for recipe_id in case['relevant_ids']:
                if recipe_id not in expected_dishes:
                    response = client.get('/recipes/' + recipe_id)
                    response.raise_for_status()
                    detail = response.json()
                    if detail['corpus_version'] != version:
                        raise ValueError('Corpus changed during evaluation')
                    expected_dishes[recipe_id] = detail['recipe']['normalized_dish']
                if expected_dishes[recipe_id] != case['confirmed_dish']:
                    raise ValueError('Ground truth recipe belongs to a different dish')
        for case in cases:
            response = client.post('/search', json={'confirmed_dish': case['confirmed_dish'], 'query': case['query'], 'top_k': 3})
            response.raise_for_status()
            body = response.json()
            if body['corpus_version'] != version:
                raise ValueError('Corpus changed during evaluation')
            recipes = body['recipes']
            cross_dish += sum(r['normalized_dish'] != case['confirmed_dish'] for r in recipes)
            expected = set(case['relevant_ids'])
            if not expected:
                if recipes:
                    raise ValueError('Uncovered dish unexpectedly returned a recipe')
                empty += 1
                continue
            positives += 1
            covered.add(case['confirmed_dish'])
            ranks = [i for i,r in enumerate(recipes, 1) if r['id'] in expected]
            best = min(ranks) if ranks else None
            if best is not None:
                hit1 += best == 1
                hit3 += best <= 3
                reciprocal_rank += 1 / best
            if case['kind'] == 'contrastive_holdout':
                holdout += 1
                holdout_hit1 += best == 1
    if cross_dish:
        raise ValueError('Recipe search crossed the confirmed-dish filter')
    if not positives:
        raise ValueError('Evaluation needs positive queries')
    at1, at3, mrr = hit1 / positives, hit3 / positives, reciprocal_rank / positives
    full_coverage = covered == catalog and len(catalog) == 30
    separate_review = specification['review_status'] == 'separate_semantic_pass_same_agent'
    technical_gate = positives >= 150 and full_coverage and at1 >= .90 and at3 >= .95 and separate_review
    external_review = specification.get('external_review_complete', False) is True
    return {'corpus_version': version, 'queries': len(cases), 'positive_queries': positives,
            'covered_dishes': len(covered), 'truthful_empty_queries': empty,
            'hit_at_1': at1, 'hit_at_3': at3, 'mrr': mrr, 'cross_dish_results': cross_dish,
            'contrastive_holdout_queries': holdout,
            'contrastive_holdout_hit_at_1': holdout_hit1 / holdout if holdout else None,
            'review_status': specification['review_status'], 'technical_gate_met': technical_gate,
            'external_review_complete': external_review,
            'acceptance_gate_met': technical_gate and external_review,
            'limitation': '27 dishes have one candidate. Separate semantic pass used the same implementation agent; external review and kitchen verification remain Phase 7 work.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8001')
    parser.add_argument('--queries', type=Path, default=Path(__file__).with_name('queries.json'))
    parser.add_argument('--report', type=Path)
    parser.add_argument('--require-technical-gate', action='store_true')
    args = parser.parse_args()
    report = evaluate(args.url, args.queries)
    output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    print(output, end='')
    if args.require_technical_gate and not report['technical_gate_met']:
        raise SystemExit('Recipe retrieval technical gate failed')
