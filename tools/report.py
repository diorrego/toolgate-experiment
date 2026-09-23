"""Analyze a private run or recompute numerical summaries from sanitized observations."""
import argparse
import html
import json
import os
from pathlib import Path
from analysis import analyze, dollars, seconds, LABELS, PRICING


def markdown(report, summary):
    lines = ['# Experiment results', '', f"Run: `{report['runId']}`. Language: `{report.get('language', 'unknown')}`. State: `{report['state']}`.", '',
             'The timer starts before host preparation, when present, and ends when the final answer is complete. Initialization of the MCP connection precedes submission and is recorded separately.', '',
             '| Condition | Final answers | Expected queries | Median | p95 | MCP errors | Agent USD | Jev USD | Total USD |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for mode, s in summary['modes'].items():
        c = s['api_equivalent_cost']
        cells = [LABELS[mode], s['final_answers'], s['expected_queries'], seconds(s['p50_final_ms']), seconds(s['p95_final_ms']), s['mcp_errors'], dollars(c['agent_usd']), dollars(c['jev_usd']), dollars(c['total_usd'])]
        lines.append('| ' + ' | '.join(map(str, cells)) + ' |')
    lines += ['', 'Costs use measured token counts and the dated public Standard price profile. They are API-equivalent estimates, not invoices. Cache reads and writes partition input; reasoning is already part of output. Unknown usage is not zero. Infrastructure, discounts and taxes are excluded.', '',
              '| Condition | Agent input | Cached input | Agent output | Jev input | Jev output | Known total-cost cases |', '|---|---:|---:|---:|---:|---:|---:|']
    for mode, s in summary['modes'].items():
        c = s['api_equivalent_cost']
        cells = [LABELS[mode], s['input_tokens'], s['cached_input_tokens'], s['output_tokens'], c['jev_input_tokens'], c['jev_output_tokens'], str(c['total_usd_measured_cases'])+'/'+str(s['attempts'])]
        lines.append('| ' + ' | '.join('unknown' if v is None else str(v) for v in cells) + ' |')
    lines += ['', 'Known cost components remain visible when one case lacks complete telemetry. Subtotals are not complete totals when coverage is below the attempt count.', '',
              '| Condition | Known agent USD subtotal | Agent coverage | Known Jev USD subtotal | Jev coverage |',
              '|---|---:|---:|---:|---:|']
    for mode, s in summary['modes'].items():
        c = s['api_equivalent_cost']
        cells = [LABELS[mode], dollars(c['agent_usd_known_subtotal']), f"{c['agent_usd_measured_cases']}/{s['attempts']}", dollars(c['jev_usd_known_subtotal']), f"{c['jev_usd_measured_cases']}/{s['attempts']}"]
        lines.append('| ' + ' | '.join(cells) + ' |')
    if any('selector_measurements' in s for s in summary['modes'].values()):
        lines += ['', '## Selector concurrency and wall time', '',
                  '| Condition | Jev attempts | Selection batches | Batch median | Batch p95 | Maximum concurrent Jev calls | Sum of overlapping Jev durations |',
                  '|---|---:|---:|---:|---:|---:|---:|']
        for mode, s in summary['modes'].items():
            m = s.get('selector_measurements', {})
            cells = [LABELS[mode], str(s['jev_attempts']), str(m.get('selection_batches', 0)), seconds(m.get('batch_wall_p50_ms')), seconds(m.get('batch_wall_p95_ms')), str(m.get('max_concurrent_requests', 0)), seconds(s['jev_ms'])]
            lines.append('| ' + ' | '.join(cells) + ' |')
        lines += ['', 'Attempt durations overlap in the binary profile. Their sum is not user latency and must not be added to selector wall time or the final-answer timer. Missing response headers and missing token usage remain visible in the JSON summary.']
        lines += ['', '## Initial selection and resolution', '',
                  '| Condition | Automatic selections | Expected automatic tool | Ambiguities | Ambiguities containing expected tool | No match |',
                  '|---|---:|---:|---:|---:|---:|']
        for mode, s in summary['modes'].items():
            q = s.get('selection_quality')
            if not q: continue
            lines.append('| ' + ' | '.join([LABELS[mode], *[str(q[k]) for k in ('automatic_choices','automatic_expected_tool','ambiguities','ambiguities_containing_expected_tool','abstentions')]]) + ' |')
        lines += ['', 'An ambiguity is not counted as an automatic wrong-tool choice. The expected tool can remain among the candidates and be resolved by the agent. Final expected-query grades above measure the complete workflow separately.']
    lines += ['', '## Paired latency differences', '', '| Pair | Complete pairs | Median second minus first | Second faster | Both queries correct | Median when both correct |', '|---|---:|---:|---:|---:|---:|']
    for name, p in summary['paired'].items():
        cells = [name, p['completed_pairs'], seconds(p['median_second_minus_first_ms']), p['second_faster'], p['both_correct_pairs'], seconds(p['both_correct_median_second_minus_first_ms'])]
        lines.append('| ' + ' | '.join(map(str, cells)) + ' |')
    lines += ['', 'Negative differences mean the second condition was faster. Final-answer latency includes answers explaining failures; success-only metrics remain separate. A single observation per question is descriptive, not a general language ranking or production SLO.', '', '## Review notes', '']
    lines += report.get('reviewNotes', [])
    lines += ['', '## Environment', '', '```json', json.dumps(summary['environment'], indent=2), '```', '', '## Price sources', '']
    lines += ['- '+url for url in PRICING['sources']]
    return '\n'.join(lines)+'\n'


def private_html(report, summary, indexed):
    esc = html.escape
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><title>Toolgate experiment answers</title>',
             '<style>body{font:16px system-ui;max-width:1200px;margin:auto;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{padding:16px;border:1px solid #bbb;margin:12px 0}summary{cursor:pointer;font-weight:bold}</style>',
             '<h1>Toolgate: questions, answers, latency and cost</h1><p>Private provider data. Do not publish this page.</p>',
             '<pre>'+esc(markdown(report, summary))+'</pre>']
    for case in report['cases']:
        parts.append('<details><summary>'+esc(case['id']+' '+case['question'])+'</summary>')
        for mode in summary['modes']:
            r = indexed.get((case['id'], mode))
            parts.append('<section><h2>'+esc(LABELS[mode])+'</h2>')
            if not r:
                parts.append('<p>Pending.</p></section>'); continue
            parts.append('<p>'+esc(seconds(r.get('answerCompleteMs')))+' | '+esc(r['status'])+'</p>')
            parts.append('<pre>'+esc(r.get('finalAnswer') or 'No final answer was captured.')+'</pre>')
            parts.append('<details><summary>Tools, traces and usage</summary><pre>'+esc(json.dumps({k:r.get(k) for k in ('tools','hostTools','trace','tokenUsage','toolTimeline','hostPrepareMs','turnStartOffsetMs','resources','api_equivalent_cost')},indent=2,ensure_ascii=False))+'</pre></details></section>')
        parts.append('</details>')
    return '\n'.join(parts)+ '</html>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--review', type=Path)
    parser.add_argument('--private-html', type=Path)
    args = parser.parse_args(); report = json.loads(args.input.read_text())
    if args.review:
        review = json.loads(args.review.read_text())
        if review['runId'] != report['runId']: raise ValueError('Review belongs to a different run')
        report['reviewNotes'] = review['notes']
    summary, indexed = analyze(report)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    (args.output_dir/'report.md').write_text(markdown(report, summary))
    if args.private_html:
        if report.get('sanitized'): raise ValueError('Public observations contain no private answers')
        args.private_html.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(args.private_html, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as out:
            os.fchmod(out.fileno(), 0o600); out.write(private_html(report, summary, indexed))
    print(json.dumps({'runId':report['runId'], 'records':len(report['records']), 'expected':summary['expected_records'], 'state':report['state']}))


if __name__ == '__main__': main()
