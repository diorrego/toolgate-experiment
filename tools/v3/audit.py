"""Independent decimal-price and matrix arithmetic audit; no model calls."""
from pathlib import Path
import json
import statistics
import decimal
import hashlib
import math

D = decimal.Decimal
root = Path(__file__).resolve().parents[2]
base = root / 'results/v3'
observations = json.loads((base / 'observations.json').read_text())
summary = json.loads((base / 'summary.json').read_text())
assert len(observations['records']) == 120
assert len({(r['caseId'], r['mode']) for r in observations['records']}) == 120
checks = []
for mode, expected in summary['byMode'].items():
    rows = [r for r in observations['records'] if r['mode'] == mode]
    assert len(rows) == 30
    assert math.isclose(statistics.median(r['taskMs'] for r in rows), expected['latencyMs']['p50'], abs_tol=1e-8)
    assert sum(r['grade']['workflowSuccess'] for r in rows) == expected['workflowSuccess']
    assert sum(r['effect'] == 'write' and r['grade']['state']['correct'] for r in rows) == expected['mutationsCorrect']
    model, jev = D(0), D(0)
    model_calls, jev_calls, missing_model, missing_jev = 0, 0, 0, 0
    for row in rows:
        for call in row['modelCalls']:
            model_calls += 1
            usage = call['usage']
            if usage is None:
                assert call['costUSD'] is None
                missing_model += 1
                continue
            tokens = usage['input_tokens']
            cached = usage['input_tokens_details']['cached_tokens']
            writes = usage['input_tokens_details'].get('cache_write_tokens', 0)
            output = usage['output_tokens']
            assert 0 <= cached + writes <= tokens
            cost = ((D(tokens-cached-writes)*D('.1') + D(cached)*D('.01') + D(writes)*D('.125')) * (2 if tokens > 272000 else 1) + D(output)*D('.5') * (D('1.5') if tokens > 272000 else 1)) / D(1000000)
            assert abs(cost-D(str(call['costUSD']))) < D('1e-12')
            model += cost
        for request in row['remote']:
            for hop in request['hops']:
                jev_calls += hop['jevCalls'] or 0
                if hop['jevCalls'] is None or hop['jevUsageCalls'] != hop['jevCalls']:
                    missing_jev += 1
                if hop['jevInputTokens'] is not None:
                    jev += D(hop['jevInputTokens']) * D('.042') / D(1000000)
    assert model_calls == expected['modelCalls'] and jev_calls == expected['jevCalls']
    assert abs(model-D(str(expected['knownOpenaiCostUSD']))) < D('1e-10')
    assert abs(jev-D(str(expected['knownJevCostUSD']))) < D('1e-10')
    if missing_model or missing_jev:
        assert expected['totalCostUSD'] is None
    else:
        assert abs(model+jev-D(str(expected['totalCostUSD']))) < D('1e-10')
    checks.append({'mode': mode, 'cells': 30, 'modelCalls': model_calls, 'jevCalls': jev_calls, 'medianMs': expected['latencyMs']['p50'], 'independentKnownDecimalUSD': str(model+jev), 'missingModelUsage': missing_model, 'incompleteJevHops': missing_jev})
result = {'passed': True, 'checks': checks, 'observationsSha256': hashlib.sha256((base / 'observations.json').read_bytes()).hexdigest()}
(root / 'verification/v3/numerical-audit.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(checks, indent=2))
