"""Render private answers and sanitized E2E measurements from real agent turns."""
import argparse
from datetime import datetime
import hashlib
import html
import json
import math
import os
from pathlib import Path
import statistics as stats

PRICING = json.loads((Path(__file__).parent / 'api-pricing-2026-09-23.json').read_text())


def count(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def api_cost(record):
    """Price measured usage, never turn absent telemetry into free requests."""
    agent = None
    usage = (record.get('tokenUsage') or {}).get('total', {})
    values = [usage.get(k) for k in ('inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens')]
    if record.get('model') == PRICING['agent_model'] and all(count(v) for v in values):
        total, cached, writes, output = values
        if cached + writes <= total <= PRICING['short_context_max_input']:
            rates = PRICING['agent_usd_per_million']
            agent = ((total-cached-writes)*rates['input'] + cached*rates['cached_input']
                     + writes*rates['cache_write_input'] + output*rates['output']) / 1e6
    traces = [e for e in record.get('trace', []) if e.get('kind') == 'sdk_remote']
    measured = []
    complete = record.get('mode') == 'direct' or bool(traces)
    for event in traces:
        hops = event.get('hops', [])
        complete &= count(event.get('attempts')) and event['attempts'] == len(hops)
        for hop in hops:
            calls = hop.get('jevCalls')
            if count(calls) and calls == 0:
                continue
            fields = [hop.get(k) for k in ('jevUsageCalls', 'jevInputTokens', 'jevOutputTokens')]
            if count(calls) and all(count(v) for v in fields) and fields[0] == calls:
                measured.append(fields)
            else:
                complete = False
    input_tokens = sum(v[1] for v in measured) if complete else None
    output_tokens = sum(v[2] for v in measured) if complete else None
    if record.get('jevModel', PRICING['jev_model']) != PRICING['jev_model']:
        complete = False
    jev = input_tokens * PRICING['jev_usd_per_million']['input'] / 1e6 if complete else None
    return {'agent_usd': agent, 'jev_usd': jev,
            'total_usd': agent + jev if agent is not None and jev is not None else None,
            'jev_input_tokens': input_tokens, 'jev_output_tokens': output_tokens,
            'actual_billed_usd': None}


def cost_totals(records):
    costs = [api_cost(r) for r in records]
    result = {'cases': len(records), 'actual_billed_usd': None}
    correct = sum(r.get('grade', {}).get('expected_query', False) for r in records)
    for field in ('agent_usd', 'jev_usd', 'total_usd', 'jev_input_tokens', 'jev_output_tokens'):
        measured = [c[field] for c in costs if c[field] is not None]
        total = sum(measured) if records and len(measured) == len(records) else None
        result[field] = total
        result[field + '_known_subtotal'] = sum(measured)
        result[field + '_measured_cases'] = len(measured)
        if field.endswith('_usd'):
            result[field + '_per_attempt'] = total / len(records) if total is not None else None
            result[field + '_per_correct_query'] = total / correct if total is not None and correct else None
    return result


def dollars(value):
    return 'unknown' if value is None else f'US${value:.6f}'


MODES = ('direct', 'go', 'rust', 'go-first', 'rust-first')
LABELS = {'direct': 'Direct MCP', 'go': 'SDK + Go', 'rust': 'SDK + Rust',
          'go-first': 'Go, host-first preparation', 'rust-first': 'Rust, host-first preparation',
          'go-choice-first': 'Go, single Choice', 'rust-choice-first': 'Rust, single Choice',
          'go-binary-first': 'Go, 22 parallel binary calls', 'rust-binary-first': 'Rust, 22 parallel binary calls'}

def all_tools(record):
    return record.get('hostTools', []) + record.get('tools', [])


def decoded(response):
    if not isinstance(response, dict):
        return None
    content = response.get('content', [])
    if len(content) == 1 and content[0].get('type') == 'text':
        try:
            return json.loads(content[0]['text'])
        except (ValueError, KeyError, TypeError):
            pass
    return response.get('structuredContent')


def normalized(response):
    data = json.loads(json.dumps(response))
    if isinstance(data, dict):
        for block in data.get('content', []):
            if block.get('type') == 'text':
                try:
                    block['text'] = json.loads(block['text'])
                except (ValueError, TypeError, KeyError):
                    pass
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def equivalent(key, a, b):
    if key in ('from', 'to') and isinstance(a, str) and isinstance(b, str):
        try:
            return datetime.fromisoformat(a.replace('Z', '+00:00')) == datetime.fromisoformat(b.replace('Z', '+00:00'))
        except ValueError:
            pass
    return a == b and isinstance(a, bool) == isinstance(b, bool)


def arguments_match(tool, expected, actual, defaults_by_tool=None, ignored_rules=()):
    if not isinstance(actual, dict):
        return False
    defaults = (defaults_by_tool or {}).get(tool, {})
    missing = object()
    for key, value in expected.items():
        if not equivalent(key, value, actual.get(key, defaults.get(key, missing))):
            return False
    for key, value in actual.items():
        if key in expected:
            continue
        if any(rule['tool'] == tool and key in rule['ignore'] and
               all(expected.get(k, defaults.get(k)) == v for k, v in rule['when'].items())
               for rule in ignored_rules):
            continue
        if not equivalent(key, value, defaults.get(key, missing)):
            return False
    return True


def tool_failed(tool):
    return tool.get('status') != 'completed' or bool(tool.get('error')) or bool((tool.get('result') or {}).get('isError'))


def grade(record, case, defaults=None, ignored_rules=()):
    selected = {}
    initial_selection = None
    matched = []
    observed = []
    for tool in all_tools(record):
        if tool_failed(tool):
            continue
        name = tool.get('tool')
        arguments = tool.get('arguments') or {}
        result = tool.get('result')
        data = decoded(result)
        if name == 'prepare_action' and isinstance(data, dict):
            if initial_selection is None:
                initial_selection = data
            if data.get('selected_tool') and data.get('operation_id'):
                selected[data['operation_id']] = data['selected_tool']['tool_id']
            continue
        if name == 'execute_read_action':
            operation_id = arguments.get('operation_id')
            name = selected.get(operation_id)
            arguments = arguments.get('arguments', {})
            if isinstance(data, dict) and data.get('operation_id') == operation_id and data.get('status') in ('needs_arguments', 'ready', 'no_match', 'needs_choice'):
                continue
        if name:
            observed.append(name)
        if name == case['tool'] and arguments_match(name, case['arguments'], arguments, defaults, ignored_rules):
            matched.append(result)
    return {'expected_query': bool(matched), 'business_result': matched[-1] if matched else None,
            'initial_selection_status': initial_selection.get('status') if initial_selection else None,
            'initial_tool_matches': (initial_selection.get('selected_tool') or {}).get('tool_id') == case['tool'] if initial_selection else None,
            'expected_in_initial_candidates': any(c.get('tool_id') == case['tool'] for c in initial_selection.get('candidates', [])) if initial_selection and initial_selection.get('status') == 'needs_choice' else None,
            'observed_tools': observed, 'tool_errors': sum(tool_failed(t) for t in all_tools(record))}


def latency(record):
    value = record.get('answerCompleteMs')
    if record.get('status') != 'completed' or not (record.get('finalAnswer') or record.get('finalAnswerPresent')):
        return None
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return value


def percentile(values, q):
    return sorted(values)[max(0, math.ceil(q * len(values)) - 1)] if values else None


def phase_metrics(records):
    first, final = [], []
    for record in records:
        timeline = record.get('toolTimeline', [])
        starts = [e['elapsedMs'] for e in timeline if e.get('event') == 'item/started']
        ends = [e['elapsedMs'] for e in timeline if e.get('event') == 'item/completed']
        if starts: first.append(min(starts))
        answer = latency(record)
        if ends and answer is not None and answer >= max(ends): final.append(answer-max(ends))
    return {'first_agent_tool_p50_ms': stats.median(first) if first else None,
            'first_agent_tool_cases': len(first),
            'after_last_tool_p50_ms': stats.median(final) if final else None,
            'after_last_tool_cases': len(final)}


def statistics(records):
    times = [v for r in records if (v := latency(r)) is not None]
    correct_times = [v for r in records if r.get('grade', {}).get('expected_query') and (v := latency(r)) is not None]
    timed_out = sum(r.get('status') == 'timeout' or r.get('status') == 'interrupted' and (r.get('turnCompleteMs') or 0) >= 179000 for r in records)
    usage = [r['tokenUsage']['total'] for r in records if r.get('tokenUsage') and r['tokenUsage'].get('total')]
    traces = [event for r in records for event in r.get('trace', []) if event.get('kind') == 'sdk_remote']
    hops = [hop for event in traces for hop in event.get('hops', [])]
    resources = {}
    resource_names = ['provider', 'go', 'rust', 'proxy', 'agentHost']
    resource_names += [name for name in ('goBinary','rustBinary') if any(name in r.get('resources',{}) for r in records)]
    for name in resource_names:
        samples = [r.get('resources', {}).get(name) for r in records]
        samples = [s for s in samples if s and s.get('cpuMs') is not None]
        resources[name] = {'cpu_ms': sum(s['cpuMs'] for s in samples),
                           'peak_rss_kib': max((s['peakRssKiB'] for s in samples), default=None),
                           'cases_measured': len(samples)}
    result = {
        'attempts': len(records), 'final_answers': len(times), 'without_final_answer': len(records)-len(times),
        'initial_selection_matches': sum(r.get('grade', {}).get('initial_tool_matches') is True for r in records),
        'initial_selection_cases': sum(r.get('grade', {}).get('initial_tool_matches') is not None for r in records),
        'initial_selection_ambiguous': sum(r.get('grade', {}).get('initial_selection_status') == 'needs_choice' for r in records),
        'initial_selection_no_match': sum(r.get('grade', {}).get('initial_selection_status') == 'no_match' for r in records),
        'timeouts': timed_out, 'expected_queries': sum(r.get('grade', {}).get('expected_query', False) for r in records),
        'p50_final_ms': stats.median(times) if times else None,
        'correct_answers_measured': len(correct_times),
        'correct_p50_final_ms': stats.median(correct_times) if correct_times else None,
        'correct_p95_final_ms': percentile(correct_times, .95),
        'p95_final_ms': percentile(times, .95), 'max_final_ms': max(times) if times else None,
        'mean_final_ms': stats.mean(times) if times else None,
        'mcp_calls': sum(len(all_tools(r)) for r in records),
        'host_mcp_calls': sum(len(r.get('hostTools', [])) for r in records),
        'agent_mcp_calls': sum(len(r.get('tools', [])) for r in records),
        'host_prepare_ms': sum(r.get('hostPrepareMs') or 0 for r in records),
        'phases': phase_metrics(records),
        'mcp_errors': sum(tool_failed(t) for r in records for t in all_tools(r)),
        'core_attempts': sum(e.get('attempts', 0) for e in traces),
        'jev_attempts': sum(h.get('jevCalls') or 0 for h in hops),
        'jev_ms': sum(h.get('jevMs') or 0 for h in hops),
        'core_attempts_without_headers': sum(e.get('attempts', 0)-len(e.get('hops', [])) for e in traces),
        'sdk_remote_wall_ms': sum(e.get('durationMs', 0) for e in traces),
        'api_equivalent_cost': cost_totals(records),
        'token_cases': len(usage),
        'cache_write_input_tokens': sum(u.get('cacheWriteInputTokens', 0) for u in usage),
        'uncached_input_tokens': sum(u.get('inputTokens', 0)-u.get('cachedInputTokens', 0)-u.get('cacheWriteInputTokens', 0) for u in usage),
        'input_tokens': sum(u.get('inputTokens', 0) for u in usage),
        'cached_input_tokens': sum(u.get('cachedInputTokens', 0) for u in usage),
        'output_tokens': sum(u.get('outputTokens', 0) for u in usage),
        'reasoning_output_tokens': sum(u.get('reasoningOutputTokens', 0) for u in usage),
        'resources': resources,
    }

    measured = [h for h in hops if h.get('selectorMs') is not None]
    if measured:
        walls = [h['selectorMs'] for h in measured if (h.get('jevCalls') or 0)>0]
        result['selector_measurements'] = {
            'measured_hops':len(measured), 'selection_batches':len(walls),
            'batch_wall_p50_ms':stats.median(walls) if walls else None,
            'batch_wall_p95_ms':percentile(walls,.95),
            'max_concurrent_requests':max((h.get('jevMaxConcurrent') or 0 for h in measured),default=0),
            'attempt_duration_sum_ms':result['jev_ms'],
            'note':'Overlapping request durations are a sum, not batch wall time or additional user latency.'
        }
        ambiguities = [r for r in records if r.get('grade', {}).get('initial_selection_status') == 'needs_choice']
        result['selection_quality'] = {
            'automatic_choices':sum(r.get('grade', {}).get('initial_selection_status') in ('ready','needs_arguments') for r in records),
            'automatic_expected_tool':result['initial_selection_matches'],
            'ambiguities':len(ambiguities),
            'ambiguities_containing_expected_tool':sum(r['grade'].get('expected_in_initial_candidates') is True for r in ambiguities),
            'abstentions':result['initial_selection_no_match'],
            'note':'Ambiguity is not an automatic wrong-tool selection. Final query correctness is separate.'
        }
    return result


def analyze(report):
    modes = tuple(report.get('modes', MODES))
    if len(set(modes)) != len(modes) or any(mode not in LABELS for mode in modes):
        raise ValueError('Invalid conditions')
    cases = {c['id']: c for c in report['cases']}
    if len(cases) != 30:
        raise ValueError('The experiment requires the fixed 30-question corpus')
    seen = set()
    records = []
    for original in report['records']:
        record = dict(original)
        pair = (record['mode'], record['caseId'])
        if pair in seen or record['caseId'] not in cases or record['mode'] not in modes:
            raise ValueError('Duplicated or unexpected case')
        seen.add(pair)
        if record.get('question') is not None and record['question'] != cases[record['caseId']]['question']:
            raise ValueError('Question drift')
        record['grade'] = original['grade'] if report.get('sanitized') else grade(record, cases[record['caseId']], report.get('argumentDefaults'), report.get('ignoredArgumentRules', []))
        record['jevModel'] = report['environment'].get('jevModel')
        record['api_equivalent_cost'] = api_cost(record)
        records.append(record)
    summary = {'run_id': report['runId'], 'state': report['state'], 'primary_boundary': report['primaryBoundary'],
               'expected_per_mode': 30, 'samples_per_question_mode': 1, 'percentile_method': 'median; p95 nearest rank',
               'environment': report['environment'], 'hashes': report['hashes'],
               'modes': {mode: statistics([r for r in records if r['mode'] == mode]) for mode in modes},
               'pricing': PRICING, 'case_costs': [{'case': r['caseId'], 'mode': r['mode'], **r['api_equivalent_cost']} for r in records],
               'paired': {}, 'response_differences': []}
    indexed = {(r['caseId'], r['mode']): r for r in records}
    for first, second in [(a,b) for i,a in enumerate(modes) for b in modes[i+1:]]:
        pairs = [(indexed.get((case, first)), indexed.get((case, second))) for case in cases]
        deltas = [latency(b)-latency(a) for a, b in pairs if a and b and latency(a) is not None and latency(b) is not None]
        correct_deltas = [latency(b)-latency(a) for a,b in pairs if a and b and a['grade']['expected_query'] and b['grade']['expected_query'] and latency(a) is not None and latency(b) is not None]
        summary['paired'][first+'__'+second] = {'completed_pairs': len(deltas), 'median_second_minus_first_ms': stats.median(deltas) if deltas else None,
                                               'second_faster': sum(d < 0 for d in deltas),
                                               'both_correct_pairs': len(correct_deltas),
                                               'both_correct_median_second_minus_first_ms': stats.median(correct_deltas) if correct_deltas else None}
    for case in (() if report.get('sanitized') else cases):
        direct = indexed.get((case, 'direct'))
        if not direct or not direct['grade']['expected_query']:
            continue
        for mode in (mode for mode in modes if mode != 'direct'):
            other = indexed.get((case, mode))
            if not other or not other['grade']['expected_query']:
                continue
            same = normalized(direct['grade']['business_result']) == normalized(other['grade']['business_result'])
            other['business_matches_direct'] = same
            if not same:
                summary['response_differences'].append({'case': case, 'mode': mode})
    if report.get('sanitized'):
        summary['response_differences'] = report.get('response_differences', [])
    summary['language'] = report.get('language', 'unknown')
    summary['expected_records'] = len(modes)*30
    summary['all_expected_recorded'] = len(records) == summary['expected_records']
    summary['all_90_recorded'] = len(records) == 90 and len(modes) == 3
    summary['review_notes'] = report.get('reviewNotes', [])
    return summary, indexed


def seconds(value):
    return 'N/A' if value is None else f'{value/1000:.2f} s'
