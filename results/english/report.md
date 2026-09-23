# Experiment results

Run: `2026-09-23T15-41-24-430Z`. Language: `en`. State: `finished`.

The timer starts before host preparation, when present, and ends when the final answer is complete. Initialization of the MCP connection precedes submission and is recorded separately.

| Condition | Final answers | Expected queries | Median | p95 | MCP errors | Agent USD | Jev USD | Total USD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct MCP | 30 | 30 | 19.40 s | 28.89 s | 0 | US$5.658768 | US$0.000000 | US$5.658768 |
| SDK + Go | 30 | 28 | 25.43 s | 42.73 s | 5 | US$4.917558 | unknown | unknown |
| SDK + Rust | 30 | 30 | 26.00 s | 37.70 s | 1 | US$5.438722 | US$0.003636 | US$5.442358 |
| Go, host-first preparation | 30 | 30 | 19.96 s | 33.15 s | 0 | US$5.080328 | US$0.003637 | US$5.083965 |
| Rust, host-first preparation | 30 | 29 | 21.36 s | 33.77 s | 0 | US$4.256962 | US$0.003637 | US$4.260599 |

Costs use measured token counts and the dated public Standard price profile. They are API-equivalent estimates, not invoices. Cache reads and writes partition input; reasoning is already part of output. Unknown usage is not zero. Infrastructure, discounts and taxes are excluded.

| Condition | Agent input | Cached input | Agent output | Jev input | Jev output | Known total-cost cases |
|---|---:|---:|---:|---:|---:|---:|
| Direct MCP | 1893241 | 1529088 | 9763 | 0 | 0 | 30/30 |
| SDK + Go | 2093062 | 1847168 | 12229 | unknown | unknown | 28/30 |
| SDK + Rust | 2096455 | 1793792 | 12366 | 86582 | 8370 | 30/30 |
| Go, host-first preparation | 1574967 | 1247488 | 11161 | 86606 | 8370 | 30/30 |
| Rust, host-first preparation | 1575209 | 1339392 | 11188 | 86589 | 8370 | 30/30 |

Known cost components remain visible when one case lacks complete telemetry. Subtotals are not complete totals when coverage is below the attempt count.

| Condition | Known agent USD subtotal | Agent coverage | Known Jev USD subtotal | Jev coverage |
|---|---:|---:|---:|---:|
| Direct MCP | US$5.658768 | 30/30 | US$0.000000 | 30/30 |
| SDK + Go | US$4.917558 | 30/30 | US$0.003402 | 28/30 |
| SDK + Rust | US$5.438722 | 30/30 | US$0.003636 | 30/30 |
| Go, host-first preparation | US$5.080328 | 30/30 | US$0.003637 | 30/30 |
| Rust, host-first preparation | US$4.256962 | 30/30 | US$0.003637 | 30/30 |

## Paired latency differences

| Pair | Complete pairs | Median second minus first | Second faster | Both queries correct | Median when both correct |
|---|---:|---:|---:|---:|---:|
| direct__go | 30 | 6.21 s | 1 | 28 | 6.69 s |
| direct__rust | 30 | 6.60 s | 0 | 30 | 6.60 s |
| direct__go-first | 30 | 2.09 s | 5 | 30 | 2.09 s |
| direct__rust-first | 30 | 2.96 s | 6 | 29 | 2.97 s |
| go__rust | 30 | 0.98 s | 14 | 28 | 0.46 s |
| go__go-first | 30 | -4.70 s | 26 | 28 | -4.73 s |
| go__rust-first | 30 | -3.08 s | 26 | 28 | -3.30 s |
| rust__go-first | 30 | -5.00 s | 30 | 30 | -5.00 s |
| rust__rust-first | 30 | -4.04 s | 27 | 29 | -3.90 s |
| go-first__rust-first | 30 | 0.77 s | 10 | 29 | 0.79 s |

Negative differences mean the second condition was faster. Final-answer latency includes answers explaining failures; success-only metrics remain separate. A single observation per question is descriptive, not a general language ranking or production SLO.

## Review notes

Q06 / SDK + Go: two prepare_action calls were rejected with INVALID_REQUEST. The first omitted required known_arguments; the second supplied an unsupported request field. No SDK-to-core trace was captured for this case. The failed query, final answer latency and agent usage remain in the observations. Missing Jev telemetry is kept unknown, not priced as zero.
Q06 / Rust with host-first preparation: the upper date bound used nine fractional digits instead of the oracle's three. The strict timestamp grader reports a mismatch. The measured Node provider parses both strings to the same millisecond (1790121599999) using Date.getTime(), and the business result equals direct MCP. This is a grading precision limitation, not a demonstrated wrong date window. The original grade remains unchanged; the manually reviewed semantic match is reported separately.
Q24: observed business-response differences are confined to the order of five statsByDestination entries. The entries and their values match as a multiset. The raw arrays were not sorted or replaced to obtain equality.
Q28 / SDK + Go: prepare_action first omitted required known_arguments, then used an unsupported user_intent field. Both calls returned INVALID_REQUEST and no SDK-to-core trace was captured. This is a second failed query caused by model arguments at the MCP boundary, not evidence of a Go core selection failure. Its latency and measured agent usage remain included; Jev usage stays unknown.
Q30: after the requested limit=5 query, all five conditions queried again with limit=50. The expected-query metric means at least one matching successful call occurred, not that every call matched the oracle or no broader read occurred. Go and Rust each tried changing arguments on an already executed operation, received DECISION_MISMATCH, then prepared a new read operation. These additional calls, model turns, selection attempts and costs are retained. This is not a retry after EXECUTION_UNKNOWN.

## Environment

```json
{
  "node": "v24.18.0",
  "codex": "codex-cli 0.155.1",
  "platform": "linux",
  "release": "7.0.0-31-generic",
  "arch": "x64",
  "cpu": "Intel(R) Core(TM) i7-8565U CPU @ 1.80GHz",
  "totalMemoryBytes": 33519669248,
  "concurrency": 1,
  "postgres": "17.11-alpine",
  "coreAffinity": "0,1",
  "connectTimeoutMs": 1000,
  "jevTimeoutMs": 2200,
  "coreTimeoutMs": 3000,
  "sdkTimeoutMs": 3500,
  "mcpProfile": "2025-11-25",
  "model": "gpt-6-astra",
  "effort": "high",
  "jevModel": "jev-1.13.0",
  "providerFramework": "NestJS 11.1.12",
  "providerMcpSdk": "1.29.0",
  "resourceMeasurement": "agentHost measures only the npm launcher; native worker tree and remote model resources are unmeasured",
  "pricingBasis": "Standard API equivalent; actual invoice unobserved",
  "dataset": "Private authorized provider data; not distributed."
}
```

## Price sources

- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/api
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/reasoning
