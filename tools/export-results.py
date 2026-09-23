"""Explicitly export numeric observations, never private questions, arguments or answers."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from analysis import analyze


def sanitize(report, public_corpus):
    summary, indexed = analyze(report)
    public = {k:copy.deepcopy(report[k]) for k in ('runId','state','language','modes','primaryBoundary','hashes')}
    allowed_environment = ('node','codex','platform','release','arch','cpu','totalMemoryBytes','concurrency','postgres','coreAffinity','connectTimeoutMs','jevTimeoutMs','coreTimeoutMs','sdkTimeoutMs','mcpProfile','model','effort','jevModel','providerFramework','providerMcpSdk','resourceMeasurement','pricingBasis','selectorProfiles','maximumJevConcurrency','coreProcesses','profileRouting')
    public['environment'] = {k:copy.deepcopy(report['environment'][k]) for k in allowed_environment if k in report['environment']}
    public['environment']['dataset'] = 'Private authorized provider data; not distributed.'
    public.update(sanitized=True, cases=public_corpus['cases'], records=[], response_differences=summary['response_differences'],
                  privacy='Answers, arguments, identifiers, trace IDs and local paths are excluded. Exported correctness grades require the private source for independent regrading.')
    if 'experiment' in report: public['experiment'] = report['experiment']
    public['reviewNotes'] = []  # Public review notes are a separate, deliberately authored artifact.
    for original in report['records']:
        r = indexed[(original['caseId'], original['mode'])]
        item = {k:copy.deepcopy(r[k]) for k in ('caseId','mode','model','status','answerCompleteMs','turnCompleteMs','hostPrepareMs','turnStartOffsetMs','tokenUsage') if k in r}
        item['resources'] = {name:{k:value.get(k) for k in ('cpuMs','peakRssKiB')} for name,value in r.get('resources',{}).items() if name in ('go','rust','provider','proxy','agentHost','goBinary','rustBinary')}
        item['finalAnswerPresent'] = bool(r.get('finalAnswer'))
        item['grade'] = {k:copy.deepcopy(r['grade'][k]) for k in ('expected_query','tool_errors','initial_selection_status','initial_tool_matches','expected_in_initial_candidates') if k in r['grade']}
        for field in ('tools','hostTools'):
            item[field] = [{'tool':t.get('tool'),'status':t.get('status'),'error':bool(t.get('error')), 'result':{'isError':bool((t.get('result') or {}).get('isError'))}} for t in r.get(field, [])]
        item['toolTimeline'] = [{k:e[k] for k in ('event','tool','elapsedMs') if k in e} for e in r.get('toolTimeline', [])]
        item['trace'] = []
        for event in r.get('trace', []):
            if event.get('kind') != 'sdk_remote': continue
            item['trace'].append({'kind':'sdk_remote','attempts':event.get('attempts'), 'durationMs':event.get('durationMs'),
                                  'hops':[{k:hop.get(k) for k in ('status','jevCalls','jevMs','jevUsageCalls','jevInputTokens','jevOutputTokens','selectorMs','jevMaxConcurrent','selectorProfile')} for hop in event.get('hops', [])]})
        public['records'].append(item)
    return public


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',type=Path,required=True);p.add_argument('--public-corpus',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args = p.parse_args(); source = args.input.read_bytes()
    public = sanitize(json.loads(source),json.loads(args.public_corpus.read_text()))
    public['privateSourceSha256'] = hashlib.sha256(source).hexdigest()
    public['publicCorpusSha256'] = hashlib.sha256(args.public_corpus.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(public,indent=2)+'\n')
    print(json.dumps({'records':len(public['records']),'sanitized':True}))


if __name__=='__main__':main()
