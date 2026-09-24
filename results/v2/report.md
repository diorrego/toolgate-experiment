# V2 results: selection accuracy with 143 tools

Model: gpt-6-luna/high via Responses API. 60 requirements per condition, 30 reads and 30 mutations.

Run: 2026-09-24T12:31:43.006Z to 2026-09-24T13:05:10.146Z.

## Primary and execution outcomes

| Condition | First task tool | Eventual correct tool | Exact arguments | Expected handler succeeded | Persisted mutations |
|---|---:|---:|---:|---:|---:|
| Direct MCP | 43/60 | 60/60 | 53/60 | 60/60 | 30/30 |
| Design 1 | 60/60 | 60/60 | 60/60 | 60/60 | 30/30 |
| Design 2 | 59/60 | 59/60 | 59/60 | 59/60 | 30/30 |
| Design 3 | 59/60 | 58/60 | 58/60 | 58/60 | 30/30 |

The first task-tool metric excludes the optional woku_guide discovery step. All discovery calls remain in time, token and cost totals. No-match, missing execution and failed cases remain in the denominator.

## Latency and estimated API cost

| Condition | Median task time | p95 | API calls | Jev calls | Total estimated USD |
|---|---:|---:|---:|---:|---:|
| Direct MCP | 10.48 s | 16.62 s | 211 | 0 | $0.071341 |
| Design 1 | 9.53 s | 15.09 s | 247 | 94 | $0.048590 |
| Design 2 | 4.41 s | 9.24 s | 124 | 63 | $0.034459 |
| Design 3 | 5.75 s | 10.87 s | 150 | 3769 | $0.104033 |

These are token-based API estimates, not reconciled invoices. Cache reads and writes use their respective prices. Missing usage is unknown, not zero. All cases contribute to task time, including failures and turn-limit termination. Completed-answer latency is reported separately in the numerical summary.

## Selector behavior and errors

| Condition | First preparation abstentions | Ambiguities | Correct tool in ambiguity | MCP errors | Wrong mutation attempts |
|---|---:|---:|---:|---:|---:|
| Direct MCP | 0 | 0 | 0 | 0 | 0 |
| Design 1 | 0 | 0 | 0 | 35 | 0 |
| Design 2 | 0 | 0 | 0 | 1 | 0 |
| Design 3 | 1 | 25 | 25 | 5 | 0 |

## Paired comparison to direct MCP

| Condition | Median paired latency difference | Direct only correct | Toolgate only correct | Both correct |
|---|---:|---:|---:|---:|
| Design 1 | -2.23 s | 0 | 17 | 43 |
| Design 2 | -5.53 s | 0 | 16 | 43 |
| Design 3 | -4.19 s | 0 | 16 | 43 |

## Scope and limits

This is one authored 60-case corpus, one serial local run and one Go configuration. It does not establish universal accuracy, a language winner, large-load performance, production safety or sending/refund execution. Toolgate retrieves at most 64 candidates from the full catalog; Choice initially evaluates at most 32, binary evaluates retrieved candidates with concurrency at most 22.

The summary includes read/mutation strata, Wilson intervals, descriptive p99, per-hop timings, token categories, CPU and RSS. Small-sample tail estimates and confidence intervals do not account for corpus-selection bias or repeated-run variability.

[Protocol](../../docs/V2-ACCURACY.md), [observations](observations.json), [full numerical summary](summary.json).
