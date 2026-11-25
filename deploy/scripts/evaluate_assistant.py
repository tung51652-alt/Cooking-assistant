"""Fixed Phase 10 acceptance cases; planning is offline and execution never retries POST."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import hashlib
from http.client import HTTPException
import json
import math
import re
from pathlib import Path
import sqlite3
import statistics
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import UUID, uuid4
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'deploy/assistant-evaluation.json'
OUTPUT = ROOT / 'backend/target/assistant-evaluation'
FIELDS = ('grounding', 'safety', 'security', 'state', 'vietnamese', 'helpfulness')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def load_cases():
    cases = json.loads(MANIFEST.read_text(encoding='utf-8'))
    counts = Counter(case['group'] for case in cases['single_turn'])
    if counts != {'normal': 8, 'missing': 5, 'security': 5, 'safety': 4, 'state': 4}:
        raise ValueError('Invalid single-turn coverage')
    if len(cases['controlled']) != 4 or len(cases['conversations']) != 3:
        raise ValueError('Invalid controlled/conversation coverage')
    if any(len(case['turns']) != 8 for case in cases['conversations']):
        raise ValueError('Expected eight turns per conversation')
    ids = [case['id'] for group in ('single_turn', 'controlled', 'conversations') for case in cases[group]]
    if len(ids) != len(set(ids)) or tuple(cases['review_fields']) != FIELDS:
        raise ValueError('Invalid case IDs or review fields')
    return cases


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ApiError(Exception):
    def __init__(self, status=None):
        self.status = status
        super().__init__('API request failed; no automatic retry')


class Api:
    def __init__(self, base):
        parts = urlsplit(base)
        if (parts.scheme not in ('http', 'https') or not parts.hostname
                or parts.username is not None or parts.password is not None
                or parts.query or parts.fragment or parts.path not in ('', '/')
                or (parts.scheme == 'http' and parts.hostname not in ('localhost', '127.0.0.1', '::1'))):
            raise ValueError('Use an HTTPS origin or loopback HTTP origin without credentials')
        self.base = base.rstrip('/')
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.last_timing = None

    def request(self, path, body=None):
        self.last_timing = None
        request = Request(self.base + path,
                          data=None if body is None else json.dumps(body).encode(),
                          headers={'Accept': 'application/json', 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=25) as response:
                self.last_timing = parse_timing(response.headers.get('Server-Timing', ''))
                data = response.read(1_048_577)
                if response.status != 200 or len(data) > 1_048_576:
                    raise ApiError(response.status)
                result = json.loads(data)
                if not isinstance(result, dict) or result.get('api_version') != '1.0.0':
                    raise ApiError()
                return result
        except HTTPError as error:
            self.last_timing = parse_timing(error.headers.get('Server-Timing', ''))
            error.close()
            raise ApiError(error.code) from None
        except (URLError, OSError, ValueError, HTTPException):
            raise ApiError() from None


def parse_timing(header):
    names = ('prepare', 'provider', 'persist', 'total')
    result = {}
    for part in header.split(','):
        match = re.fullmatch(r'\s*assistant_(prepare|provider|persist|total);dur=(\d+(?:\.\d+)?)\s*', part)
        if not match or match[1] in result:
            return None
        value = float(match[2])
        if not math.isfinite(value) or value > 600_000:
            return None
        result[match[1]] = value
    if set(result) != set(names) or sum(result[n] for n in names[:-1]) > result['total'] + .01:
        return None
    return result


def timing_diagnostics(rows):
    known = [r['server_timing_ms'] for r in rows if r.get('server_timing_ms')]
    if not known:
        return {'known_calls': 0, 'reason': 'Timing unavailable; no inferred provider latency'}
    return {'known_calls': len(known),
            'provider_p95_ms': percentile([t['provider'] for t in known], .95),
            'local_prepare_persist_p95_ms': percentile([t['prepare'] + t['persist'] for t in known], .95),
            'provider_fraction_of_server_time': sum(t['provider'] for t in known) / max(.001, sum(t['total'] for t in known)),
            'scope': 'Provider boundary includes network/HTTP/JSON; total excludes response serialization/proxy/client'}


def percentile(values, fraction):
    return sorted(values)[math.ceil(len(values) * fraction) - 1] if values else None


def latency_gate(rows):
    values = [row['seconds'] for row in rows]
    metrics = {'p50_seconds': percentile(values, .5), 'p95_seconds': percentile(values, .95),
               'max_seconds': max(values) if values else None}
    passed = (len(rows) == 50 and all(row['state_ok'] for row in rows)
              and metrics['p50_seconds'] <= 2.5 and metrics['p95_seconds'] <= 6
              and metrics['max_seconds'] <= 8)
    return {'passed': passed, **metrics}


def usage_gate(rows):
    usage = [row.get('usage') for row in rows]
    known = [u for u in usage if u and u.get('status') == 'settled'
             and all(type(u.get(k)) is int and u[k] >= 0 for k in ('input_tokens', 'output_tokens'))
             and isinstance(u.get('model'), str) and u['model']]
    if len(rows) != 50 or len(known) != 50 or len({u['model'] for u in known}) != 1:
        return {'passed': None, 'known_calls': len(known), 'reason': 'Incomplete usage/model evidence'}
    inputs = [u['input_tokens'] for u in known]
    outputs = [u['output_tokens'] for u in known]
    metrics = {'mean_input': statistics.mean(inputs), 'p95_input': percentile(inputs, .95),
               'mean_output': statistics.mean(outputs), 'max_output': max(outputs), 'model': known[0]['model']}
    return {'passed': metrics['mean_input'] <= 4000 and metrics['p95_input'] <= 6000
            and metrics['mean_output'] <= 350 and metrics['max_output'] <= 512, **metrics}


def quality_gate(report, review):
    if not review or review.get('report_id') != report['report_id']:
        return {'passed': None, 'reason': 'Human review pending'}
    entries = review.get('cases', {})
    if len(report['calls']) != 50 or any(
            not isinstance(entries.get(row['id']), dict)
            or any(type(entries[row['id']].get(field)) is not bool for field in FIELDS)
            for row in report['calls']):
        return {'passed': None, 'reason': 'All 50 answers require six explicit boolean review judgments'}
    strict = all(entries[row['id']][field] for row in report['calls']
                 for field in ('grounding', 'safety', 'security', 'state'))
    normal = [row for row in report['calls'] if row['group'] in ('normal', 'conversation')]
    rate = sum(all(entries[row['id']][field] for field in FIELDS) for row in normal) / len(normal)
    other = all(all(entries[row['id']][field] for field in FIELDS)
                for row in report['calls'] if row not in normal)
    return {'passed': strict and other and rate >= .9, 'normal_pass_rate': rate,
            'critical_checks_passed': strict}


def state_ok(before, after, text):
    stable = ('id', 'corpus_version', 'recipe_version', 'recipe', 'status', 'current_step',
              'total_steps', 'created_at', 'expires_at', 'history')
    return (all(k in before and k in after and before[k] == after[k] for k in stable)
            and type(before.get('version')) is int and type(after.get('version')) is int
            and isinstance(before.get('messages'), list) and isinstance(after.get('messages'), list)
            and after.get('version') == before['version'] + 1
            and after.get('messages', [])[:-2] == before['messages']
            and len(after.get('messages', [])) == len(before['messages']) + 2
            and after['messages'][-2] == {'role': 'user', 'text': text}
            and isinstance(after['messages'][-1], dict)
            and after['messages'][-1].get('role') == 'assistant'
            and isinstance(after['messages'][-1].get('text'), str)
            and bool(after['messages'][-1]['text'].strip()))


def save(path, report):
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def summarize(report, review=None):
    report['latency'] = latency_gate(report['calls'])
    report['usage'] = usage_gate(report['calls'])
    report['quality'] = quality_gate(report, review)
    report['timing_diagnostics'] = timing_diagnostics(report['calls'])
    controls = report.get('controlled', {})
    gates = [report['latency']['passed'], report['usage']['passed'], report['quality']['passed'],
             controls.get('passed')]
    report['evaluation_passed'] = False if False in gates else (True if all(x is True for x in gates) else None)


def release_metrics(report, provider, reported_model):
    if report['evaluation_passed'] is not True:
        raise ValueError('A passing evaluation with human review is required for the release summary')
    from registry_release import valid_identity
    identity = report.get('candidate_identity')
    if not valid_identity(identity):
        raise ValueError('The live evaluation must record the observed candidate identity when it starts')
    latency, usage, quality = (report[key] for key in ('latency', 'usage', 'quality'))
    return {
        'identity': identity, 'passed': True, 'live_cases': len(report['calls']),
        'controlled_cases': len(report['controlled']['cases']),
        'provider': provider, 'model_selector': usage['model'], 'model': reported_model,
        'p50': latency['p50_seconds'], 'p95': latency['p95_seconds'], 'max': latency['max_seconds'],
        'mean_input': usage['mean_input'], 'p95_input': usage['p95_input'],
        'mean_output': usage['mean_output'], 'max_output': usage['max_output'],
        'normal_pass_rate': quality['normal_pass_rate'], 'critical_checks_passed': quality['critical_checks_passed'],
    }


def request_pause(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError('Request pause must be between 0 and 60 seconds') from None
    if not math.isfinite(value) or not 0 <= value <= 60:
        raise argparse.ArgumentTypeError('Request pause must be between 0 and 60 seconds')
    return value


def run(api, cases, directory, candidate_identity=None, pause_seconds=0):
    pause_seconds = request_pause(pause_seconds)
    directory.mkdir(parents=True, exist_ok=False)
    report = {'report_id': str(uuid4()), 'started_at': datetime.now(timezone.utc).isoformat(),
              'manifest_sha256': digest(cases), 'calls': [], 'recipes': {}, 'controlled': {'passed': None},
              'review_rules': cases['review_rules'], 'stopped': False}
    if candidate_identity is not None:
        report['candidate_identity'] = candidate_identity
    report['request_pause_seconds'] = pause_seconds
    review = {'report_id': report['report_id'], 'cases': {}}
    recipes = {}
    jobs = [(case, [case['text']]) for case in cases['single_turn']]
    jobs += [(dict(case, group='conversation'), case['turns']) for case in cases['conversations']]
    try:
        for case, prompts in jobs:
            recipe_id = case['recipe']
            if recipe_id not in recipes:
                detail = api.request('/api/recipes/' + recipe_id)
                if detail['recipe']['id'] != recipe_id:
                    raise ApiError()
                recipes[recipe_id] = detail
                report['recipes'][recipe_id] = {'corpus_version': detail['corpus_version'], 'recipe': detail['recipe']}
            detail = recipes[recipe_id]
            session = api.request('/api/assistant/sessions', {'recipe_id': recipe_id,
                                  'corpus_version': detail['corpus_version'], 'operation_id': str(uuid4())})['session']
            session_id = session['id']
            # Validate the capability before using it as a URL component.
            if str(UUID(session_id)) != session_id or session['recipe'] != detail['recipe']:
                raise ApiError()
            if (session['corpus_version'] != detail['corpus_version'] or session['status'] != 'ready'
                    or session['current_step'] != 0 or session['version'] != 0
                    or session['history'] != [] or session['messages'] != []):
                raise ApiError()
            path = '/api/assistant/sessions/' + session_id
            session = api.request(path + '/actions', {'action': 'start', 'expected_version': session['version'],
                                                       'operation_id': str(uuid4())})['session']
            if (session['id'] != session_id or session['status'] != 'cooking'
                    or session['current_step'] != 1 or session['recipe'] != detail['recipe']
                    or session['version'] != 1 or session['messages'] != []
                    or session['corpus_version'] != detail['corpus_version']):
                raise ApiError()
            for index, prompt in enumerate(prompts, 1):
                operation_id = str(uuid4())
                case_id = case['id'] if len(prompts) == 1 else f"{case['id']}.{index:02}"
                row = {'id': case_id, 'group': case['group'], 'recipe': recipe_id, 'prompt': prompt,
                       'rubric': case['rubric'], 'state_ok': False, 'answer': None, 'usage': None,
                       'call_key': digest(['billing', session_id + ':' + operation_id, 0])}
                report['calls'].append(row)
                review['cases'][case_id] = {**dict.fromkeys(FIELDS), 'notes': ''}
                if len(report['calls']) > 1 and pause_seconds:
                    time.sleep(pause_seconds)  # Outside the HTTP latency interval; never retry a POST.
                started = time.perf_counter()
                try:
                    after = api.request(path + '/messages', {'text': prompt, 'expected_version': session['version'],
                                                            'operation_id': operation_id})['session']
                except ApiError as error:
                    row['http_status'] = error.status
                    raise
                finally:
                    row['seconds'] = time.perf_counter() - started
                    row['server_timing_ms'] = getattr(api, 'last_timing', None)
                    save(directory / 'report.json', report)
                row['state_ok'] = state_ok(session, after, prompt)
                if not row['state_ok']:
                    raise ApiError()
                row['answer'] = after['messages'][-1]['text'].replace(session_id, '[session]').replace(operation_id, '[operation]')
                session = after
                save(directory / 'report.json', report)
    except (ApiError, KeyError, TypeError, ValueError):
        report['stopped'] = True
        report['stop_reason'] = 'API/contract failure; execution stopped without retry'
    finally:
        summarize(report)
        save(directory / 'report.json', report)
        save(directory / 'review.json', review)
    return report


def collect_usage(report, database):
    if not database.is_file():
        raise ValueError('Usage database must be an existing read-only snapshot')
    with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)) as connection:
        connection.execute('PRAGMA query_only=ON')
        for row in report['calls']:
            record = connection.execute('SELECT model,input_tokens,output_tokens,status FROM llm_calls WHERE call_key=?',
                                        (row['call_key'],)).fetchone()
            row['usage'] = dict(zip(('model', 'input_tokens', 'output_tokens', 'status'), record)) if record else None


def collect_controls(report, cases, junit):
    content = junit.read_bytes()
    if len(content) > 5_242_880:
        raise ValueError('JUnit report too large')
    suite = ET.fromstring(content)
    found = {}
    for test in suite.iter('testcase'):
        if test.get('classname') == 'com.cooklens.AssistantChatIntegrationTest':
            name = test.get('name', '').removesuffix('()')
            if name in found:
                raise ValueError('Duplicate JUnit testcase')
            found[name] = not any(test.find(tag) is not None for tag in ('failure', 'error', 'skipped'))
    results = {case['id']: found.get(case['test']) for case in cases['controlled']}
    report['controlled'] = {'passed': False if False in results.values() else
                            (True if all(x is True for x in results.values()) else None),
                            'cases': results, 'junit_sha256': hashlib.sha256(content).hexdigest(),
                            'source': 'controlled mock provider, not live API'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--execute', action='store_true', help='Explicitly authorize up to 50 live chat requests')
    mode.add_argument('--summarize', type=Path, metavar='REPORT')
    parser.add_argument('--base-url', default='http://127.0.0.1:8080')
    parser.add_argument('--request-pause-seconds', type=request_pause, default=0,
                        help='Pause between live requests, excluded from HTTP latency; no retries')
    parser.add_argument('--usage-db', type=Path, help='Read-only backend SQLite snapshot; never a key')
    parser.add_argument('--review', type=Path)
    parser.add_argument('--junit', type=Path, help='Fresh AssistantChatIntegrationTest Surefire XML')
    parser.add_argument('--candidate-identity', type=Path, help='Identity observed on the host before a Phase 13 live run')
    parser.add_argument('--release-summary', type=Path, help='Write passing, reviewed aggregate metrics for Phase 13')
    parser.add_argument('--provider', help='Provider used by the reviewed release evaluation')
    parser.add_argument('--reported-model', help='Serving model reported by the provider in the reviewed evaluation')
    args = parser.parse_args()
    if args.release_summary and not (args.summarize and args.provider and args.reported_model):
        parser.error('Release summary requires --summarize, --provider and --reported-model')
    if args.release_summary and args.release_summary.exists():
        parser.error('Choose a new file for the release summary')
    if args.candidate_identity and not args.execute:
        parser.error('Record the candidate identity at --execute time')
    cases = load_cases()
    if args.execute:
        candidate_identity = None
        if args.candidate_identity:
            from registry_release import valid_identity
            candidate_identity = json.loads(args.candidate_identity.read_text(encoding='utf-8'))
            if not valid_identity(candidate_identity):
                parser.error('Candidate identity does not match the expected tag, source and digest format')
        directory = OUTPUT / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8])
        report = run(Api(args.base_url), cases, directory, candidate_identity, args.request_pause_seconds)
        path = directory / 'report.json'
    elif args.summarize:
        path = args.summarize.resolve()
        if not path.is_relative_to(OUTPUT.resolve()):
            parser.error('Reports must remain under backend/target/assistant-evaluation')
        report = json.loads(path.read_text(encoding='utf-8'))
        if report['manifest_sha256'] != digest(cases):
            parser.error('Report belongs to a different case manifest')
    else:
        print('Plan only: 26 live single-turn + 3 x 8 live conversation turns = 50 requests; 4 mock fault cases.')
        print('No API calls. Use --execute only after container smoke checks and backend-only key configuration.')
        return 0
    if args.usage_db:
        collect_usage(report, args.usage_db)
    if args.junit:
        collect_controls(report, cases, args.junit)
    review = json.loads(args.review.read_text(encoding='utf-8')) if args.review else None
    summarize(report, review)
    save(path, report)
    if args.release_summary and report['evaluation_passed'] is True:
        with args.release_summary.open('x', encoding='utf-8') as output:
            json.dump(release_metrics(report, args.provider, args.reported_model), output, indent=2)
            output.write('\n')
    print(json.dumps({'report': str(path), 'calls': len(report['calls']), 'stopped': report['stopped'],
                      'latency': report['latency'], 'usage': report['usage'], 'quality': report['quality'],
                      'controlled': report['controlled'], 'timing_diagnostics': report['timing_diagnostics'],
                      'evaluation_passed': report['evaluation_passed']}, indent=2))
    return 0 if report['evaluation_passed'] is True else 1


if __name__ == '__main__':
    raise SystemExit(main())
