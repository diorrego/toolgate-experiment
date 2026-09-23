# Experiment results

Run: `2026-09-23T15-30-21-730Z`. Language: `en`. State: `interrupted`.

The timer starts before host preparation, when present, and ends when the final answer is complete. Initialization of the MCP connection precedes submission and is recorded separately.

| Condition | Final answers | Expected queries | Median | p95 | MCP errors | Agent USD | Jev USD | Total USD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Direct MCP | 8 | 0 | 9.04 s | 15.52 s | 1 | unknown | US$0.000000 | unknown |
| SDK + Go | 0 | 0 | N/A | N/A | 0 | unknown | unknown | unknown |
| SDK + Rust | 0 | 0 | N/A | N/A | 0 | unknown | unknown | unknown |
| Go, host-first preparation | 0 | 0 | N/A | N/A | 0 | unknown | unknown | unknown |
| Rust, host-first preparation | 0 | 0 | N/A | N/A | 0 | unknown | unknown | unknown |

Costs use measured token counts and the dated public Standard price profile. They are API-equivalent estimates, not invoices. Cache reads and writes partition input; reasoning is already part of output. Unknown usage is not zero. Infrastructure, discounts and taxes are excluded.

| Condition | Agent input | Cached input | Agent output | Jev input | Jev output | Known total-cost cases |
|---|---:|---:|---:|---:|---:|---:|
| Direct MCP | 276899 | 159872 | 828 | 0 | 0 | 8/9 |
| SDK + Go | 0 | 0 | 0 | unknown | unknown | 0/8 |
| SDK + Rust | 0 | 0 | 0 | unknown | unknown | 0/8 |
| Go, host-first preparation | 0 | 0 | 0 | unknown | unknown | 0/9 |
| Rust, host-first preparation | 0 | 0 | 0 | unknown | unknown | 0/9 |

Known cost components remain visible when one case lacks complete telemetry. Subtotals are not complete totals when coverage is below the attempt count.

| Condition | Known agent USD subtotal | Agent coverage | Known Jev USD subtotal | Jev coverage |
|---|---:|---:|---:|---:|
| Direct MCP | US$1.371542 | 8/9 | US$0.000000 | 9/9 |
| SDK + Go | US$0.000000 | 0/8 | US$0.000000 | 0/8 |
| SDK + Rust | US$0.000000 | 0/8 | US$0.000000 | 0/8 |
| Go, host-first preparation | US$0.000000 | 0/9 | US$0.000000 | 0/9 |
| Rust, host-first preparation | US$0.000000 | 0/9 | US$0.000000 | 0/9 |

## Paired latency differences

| Pair | Complete pairs | Median second minus first | Second faster | Both queries correct | Median when both correct |
|---|---:|---:|---:|---:|---:|
| direct__go | 0 | N/A | 0 | 0 | N/A |
| direct__rust | 0 | N/A | 0 | 0 | N/A |
| direct__go-first | 0 | N/A | 0 | 0 | N/A |
| direct__rust-first | 0 | N/A | 0 | 0 | N/A |
| go__rust | 0 | N/A | 0 | 0 | N/A |
| go__go-first | 0 | N/A | 0 | 0 | N/A |
| go__rust-first | 0 | N/A | 0 | 0 | N/A |
| rust__go-first | 0 | N/A | 0 | 0 | N/A |
| rust__rust-first | 0 | N/A | 0 | 0 | N/A |
| go-first__rust-first | 0 | N/A | 0 | 0 | N/A |

Negative differences mean the second condition was faster. Final-answer latency includes answers explaining failures; success-only metrics remain separate. A single observation per question is descriptive, not a general language ranking or production SLO.

## Review notes


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
