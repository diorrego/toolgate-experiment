# Experiment results

Run: `2026-09-23T22-02-49-878Z`. Language: `en`. State: `finished`.

The timer starts before host preparation, when present, and ends when the final answer is complete. Initialization of the MCP connection precedes submission and is recorded separately.

| Condition | Final answers | Expected queries | Median | p95 | MCP errors | Agent USD | Jev USD | Total USD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct MCP | 30 | 30 | 18.85 s | 29.25 s | 0 | US$5.873212 | US$0.000000 | US$5.873212 |
| Go, single Choice | 30 | 29 | 21.70 s | 32.96 s | 1 | US$3.886220 | US$0.003637 | US$3.889857 |
| Rust, single Choice | 30 | 30 | 21.25 s | 31.66 s | 0 | US$4.173326 | US$0.003637 | US$4.176963 |
| Go, 22 parallel binary calls | 30 | 29 | 22.15 s | 33.34 s | 0 | US$3.580382 | US$0.013273 | US$3.593655 |
| Rust, 22 parallel binary calls | 30 | 29 | 22.95 s | 32.63 s | 1 | US$4.710614 | US$0.013278 | US$4.723892 |

Costs use measured token counts and the dated public Standard price profile. They are API-equivalent estimates, not invoices. Cache reads and writes partition input; reasoning is already part of output. Unknown usage is not zero. Infrastructure, discounts and taxes are excluded.

| Condition | Agent input | Cached input | Agent output | Jev input | Jev output | Known total-cost cases |
|---|---:|---:|---:|---:|---:|---:|
| Direct MCP | 1871419 | 1480192 | 9615 | 0 | 0 | 30/30 |
| Go, single Choice | 1592826 | 1400960 | 11332 | 86596 | 8370 | 30/30 |
| Rust, single Choice | 1575164 | 1348096 | 11091 | 86594 | 8370 | 30/30 |
| Go, 22 parallel binary calls | 1655238 | 1503872 | 11257 | 316021 | 24054 | 30/30 |
| Rust, 22 parallel binary calls | 1655978 | 1380224 | 11457 | 316153 | 24054 | 30/30 |

Known cost components remain visible when one case lacks complete telemetry. Subtotals are not complete totals when coverage is below the attempt count.

| Condition | Known agent USD subtotal | Agent coverage | Known Jev USD subtotal | Jev coverage |
|---|---:|---:|---:|---:|
| Direct MCP | US$5.873212 | 30/30 | US$0.000000 | 30/30 |
| Go, single Choice | US$3.886220 | 30/30 | US$0.003637 | 30/30 |
| Rust, single Choice | US$4.173326 | 30/30 | US$0.003637 | 30/30 |
| Go, 22 parallel binary calls | US$3.580382 | 30/30 | US$0.013273 | 30/30 |
| Rust, 22 parallel binary calls | US$4.710614 | 30/30 | US$0.013278 | 30/30 |

## Selector concurrency and wall time

| Condition | Jev attempts | Selection batches | Batch median | Batch p95 | Maximum concurrent Jev calls | Sum of overlapping Jev durations |
|---|---:|---:|---:|---:|---:|---:|
| Direct MCP | 0 | 0 | N/A | N/A | 0 | 0.00 s |
| Go, single Choice | 31 | 31 | 0.82 s | 0.95 s | 1 | 25.29 s |
| Rust, single Choice | 31 | 31 | 0.80 s | 0.98 s | 1 | 24.59 s |
| Go, 22 parallel binary calls | 682 | 31 | 0.90 s | 1.00 s | 22 | 551.69 s |
| Rust, 22 parallel binary calls | 682 | 31 | 0.90 s | 1.08 s | 22 | 547.24 s |

Attempt durations overlap in the binary profile. Their sum is not user latency and must not be added to selector wall time or the final-answer timer. Missing response headers and missing token usage remain visible in the JSON summary.

## Initial selection and resolution

| Condition | Automatic selections | Expected automatic tool | Ambiguities | Ambiguities containing expected tool | No match |
|---|---:|---:|---:|---:|---:|
| Go, single Choice | 30 | 30 | 0 | 0 | 0 |
| Rust, single Choice | 30 | 30 | 0 | 0 | 0 |
| Go, 22 parallel binary calls | 24 | 24 | 5 | 5 | 1 |
| Rust, 22 parallel binary calls | 24 | 24 | 5 | 5 | 1 |

An ambiguity is not counted as an automatic wrong-tool choice. The expected tool can remain among the candidates and be resolved by the agent. Final expected-query grades above measure the complete workflow separately.

## Paired latency differences

| Pair | Complete pairs | Median second minus first | Second faster | Both queries correct | Median when both correct |
|---|---:|---:|---:|---:|---:|
| direct__go-choice-first | 30 | 3.50 s | 5 | 29 | 3.45 s |
| direct__rust-choice-first | 30 | 2.86 s | 2 | 30 | 2.86 s |
| direct__go-binary-first | 30 | 2.78 s | 3 | 29 | 3.03 s |
| direct__rust-binary-first | 30 | 3.00 s | 3 | 29 | 3.06 s |
| go-choice-first__rust-choice-first | 30 | -0.59 s | 18 | 29 | -0.61 s |
| go-choice-first__go-binary-first | 30 | 0.27 s | 15 | 28 | 0.27 s |
| go-choice-first__rust-binary-first | 30 | 0.23 s | 15 | 28 | 0.23 s |
| rust-choice-first__go-binary-first | 30 | 0.06 s | 15 | 29 | 0.16 s |
| rust-choice-first__rust-binary-first | 30 | 0.46 s | 11 | 29 | 0.52 s |
| go-binary-first__rust-binary-first | 30 | 0.35 s | 14 | 29 | 0.43 s |

Negative differences mean the second condition was faster. Final-answer latency includes answers explaining failures; success-only metrics remain separate. A single observation per question is descriptive, not a general language ranking or production SLO.

## Review notes

Q06 / Go single Choice: the model used nine fractional-second digits in the inclusive upper bound. The strict timestamp oracle rejects that difference. Node Date.getTime() maps it to the same millisecond as the expected bound, and the business result matches direct MCP. The automatic grade is preserved; this equivalent query is identified separately by review.
Q09 / both binary profiles: initial preparation returned no_match and the agent made no execution call. These are failed-query outcomes despite successful transport and final explanatory answers. They remain in global latency/cost statistics and are excluded only from the explicitly labeled paired-correct subset. The aggregate capture does not distinguish all-negative votes from a single insufficient positive.
Configuration review: both PostgreSQL pools have maximum size 16. Go sets MinIdleConns=4; Rust does not configure a matching minimum. This policy is unchanged between Choice and binary profiles within each language, but is an additional confound for cross-language comparisons. An earlier README description incorrectly implied matching idle minima and has been corrected. No runtime configuration was changed during measurement.
Q24: response differences in Rust Choice, Go binary and Rust binary are limited to the order of the same five statsByDestination entries. All values match. The raw arrays were not sorted or replaced to make them compare equal.
Q30: every condition performed the requested limit=5 read and an additional limit=50 read. Rust binary and Go Choice first attempted changing the already executed operation and received DECISION_MISMATCH, then prepared a new operation. All additional reads, selections and model work remain in the capture. This adds one new selection batch per SDK condition: 1 request in Choice and 22 in binary. The matching-query grade does not certify the absence of unnecessary broader reads.

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
  "selectorProfiles": [
    "choice",
    "binary-parallel-v1"
  ],
  "maximumJevConcurrency": 22,
  "coreProcesses": 4,
  "profileRouting": "Trusted local TLS proxy state; fixed profile per process; switches only between completed questions",
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
