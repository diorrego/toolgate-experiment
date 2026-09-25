"""Independent decimal, pairing and repeated-scenario arithmetic audit."""
from pathlib import Path
from decimal import Decimal as D
import json, statistics, math, hashlib
root=Path(__file__).resolve().parents[2]
obs=json.loads((root/'results/v3p2/observations.json').read_text())
summary=json.loads((root/'results/v3p2/summary.json').read_text())
rows=obs['records'];assert len(rows)==750 and len({(r['caseId'],r['repeat'],r['mode']) for r in rows})==750
checks=[]
for mode,s in summary['byMode'].items():
 group=[r for r in rows if r['mode']==mode];assert len(group)==150
 all_five=0
 for case in {r['caseId'] for r in group}:
  block=[r for r in group if r['caseId']==case];assert sorted(r['repeat'] for r in block)==[1,2,3,4,5];assert sorted(r['position'] for r in block)==[0,1,2,3,4]
  all_five+=all(r['grade']['success'] for r in block)
 assert all_five==s['scenariosAllFive'];assert sum(r['grade']['success'] for r in group)==s['successes']
 assert math.isclose(statistics.median(r['taskMs'] for r in group),s['latencyMs']['p50'],abs_tol=1e-8)
 agent=D(0);jev=D(0);agent_calls=0;jev_calls=0;missing=0
 for r in group:
  for c in r['modelCalls']:
   agent_calls+=1;u=c['usage'];assert u is not None
   n=u['input_tokens'];cached=u['input_tokens_details']['cached_tokens'];write=u['input_tokens_details'].get('cache_write_tokens',0);out=u['output_tokens'];assert 0<=cached+write<=n
   value=((D(n-cached-write)*D('.1')+D(cached)*D('.01')+D(write)*D('.125'))*(2 if n>272000 else 1)+D(out)*D('.5')*(D('1.5') if n>272000 else 1))/D(1000000)
   assert abs(value-D(str(c['costUSD'])))<D('1e-12');agent+=value
  for call in r['remote']:
   for h in call['hops']:
    assert h['jevCalls'] is not None and h['jevUsageCalls'] is not None
    jev_calls+=h['jevCalls'];missing+=h['jevCalls']-h['jevUsageCalls'];jev+=D(h['jevInputTokens'])*D('.042')/D(1000000)
 assert agent_calls==s['agent']['calls'] and jev_calls==s['jev']['calls']
 assert abs(agent-D(str(s['agent']['knownCostUSD'])))<D('1e-10');assert abs(jev-D(str(s['jev']['knownCostUSD'])))<D('1e-10')
 if missing:assert s['totalCostUSD'] is None
 else:assert abs(agent+jev-D(str(s['totalCostUSD'])))<D('1e-10')
 checks.append({'mode':mode,'executions':150,'scenariosAllFive':all_five,'agentCalls':agent_calls,'jevCalls':jev_calls,'unreportedJevUsageAttempts':missing,'knownDecimalUSD':str(agent+jev)})
for p in summary['paired']:
 values=[]
 for scenario in p['perScenario']:
  deltas=[]
  for pair in scenario['pairs']:
   a=next(r for r in rows if r['caseId']==scenario['caseId'] and r['repeat']==pair['repeat'] and r['mode']==p['mode'])
   b=next(r for r in rows if r['caseId']==scenario['caseId'] and r['repeat']==pair['repeat'] and r['mode']==p['control'])
   assert math.isclose(a['taskMs']-b['taskMs'],pair['differenceMs'],abs_tol=1e-8);deltas.append(pair['differenceMs'])
  assert len(deltas)==5;assert math.isclose(statistics.median(deltas),scenario['medianDifferenceMs'],abs_tol=1e-8);values.extend(deltas)
 assert len(values)==150;assert math.isclose(statistics.median(values),p['pairedDifferencesMs']['p50'],abs_tol=1e-8)
result={'passed':True,'checks':checks,'pairedComparisons':len(summary['paired']),'observationsSha256':hashlib.sha256((root/'results/v3p2/observations.json').read_bytes()).hexdigest()}
(root/'verification/v3p2/numerical-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(checks,indent=2))
