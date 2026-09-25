# V3 part 2: exposure size and successive discovery

Run: 2026-09-24T21:08:41.196Z to 2026-09-25T00:18:01.137Z. Five fresh conditions, 30 unchanged V3 cases, five repetitions each (750 executions).

## Primary outcomes

| Condition | Complete executions | Scenarios correct 5/5 | Mutation state | Median task time | p95 | Total estimated API USD |
|---|---:|---:|---:|---:|---:|---:|
| direct | 150/150 | 30/30 | 75/75 | 13.66 s | 21.64 s | $0.236797 |
| joint-1 | 148/150 | 28/30 | 75/75 | 20.62 s | 38.06 s | $0.594404 |
| joint-3 | 147/150 | 27/30 | 75/75 | 12.30 s | 23.94 s | $0.336748 |
| joint-5 | 148/150 | 28/30 | 75/75 | 9.88 s | 24.35 s | unknown; known >= $0.300462 |
| joint-8 | 149/150 | 29/30 | 75/75 | 9.78 s | 21.82 s | unknown; known >= $0.306325 |

All executions remain in latency and cost totals, including failures and extra preparations. Completion uses the corrected frozen goal-evidence/answer/state oracle, not initial reference coverage. The numerical summary separates successful and failed latency and includes the per-scenario 0-to-5 success counts. These are token-price estimates, not invoices.

## Agent and selector accounting

| Condition | Agent calls | Agent input / output tokens | Agent estimated USD | Jev calls | Jev input tokens | Jev estimated USD |
|---|---:|---:|---:|---:|---:|---:|
| direct | 672 | 19459704 / 37613 | $0.236797 | 0 | 0 | $0.000000 |
| joint-1 | 1174 | 3509264 / 128182 | $0.187009 | 718 | 9699890 | $0.407395 |
| joint-3 | 713 | 2288734 / 83462 | $0.157524 | 316 | 4267242 | $0.179224 |
| joint-5 | 645 | 2170089 / 75060 | $0.157034 | 254 | 3414937 | unknown |
| joint-8 | 634 | 2307795 / 74307 | $0.167535 | 246 | 3304510 | unknown |

Cache partitions and usage completeness are retained in the summary. Two Jev attempts did not report usage: V3-04/repetition 2/Joint-8 returned 504, and V3-27/repetition 5/Joint-5 returned 503. Their attempts and recovery remain counted. Joint-5 and Joint-8 total costs are unknown; reported consumption is a lower bound, not a zero-filled estimate.

## Actual exposure and successive queries

| Condition | Preparations | Additional preparations | Cases with additional queries | Mean tools per preparation | Mean distinct exposed per execution | Mean distinct used per execution |
|---|---:|---:|---:|---:|---:|---:|
| direct | 0 | 0 | 0/150 | n/a | 143.00 | 3.63 |
| joint-1 | 718 | 568 | 150/150 | 0.98 | 3.41 | 2.88 |
| joint-3 | 316 | 166 | 110/150 | 2.41 | 4.04 | 2.87 |
| joint-5 | 253 | 103 | 75/150 | 3.10 | 4.57 | 2.89 |
| joint-8 | 246 | 96 | 66/150 | 3.50 | 5.17 | 2.94 |

A cap is an upper bound, not a target. Sets are not filled, rotated or filtered for novelty. Old operations remain available under the unchanged V3 rule: same-argument reuse replays; a different argument set after execution needs another preparation. With cap 1, successive discovery is expected and is not itself a failure.

## Paired time differences

Negative means the condition took less time than the contemporaneous control. Each pair shares scenario and repetition. The second aggregate gives equal weight to each scenario after taking its five-repetition median difference.

| Condition | Control | Median of 150 paired differences | Median of 30 scenario medians | Scenarios with lower median time |
|---|---|---:|---:|---:|
| joint-1 | direct | 6.22 s | 6.20 s | 4/30 |
| joint-3 | direct | -1.53 s | -0.90 s | 18/30 |
| joint-5 | direct | -3.92 s | -4.65 s | 21/30 |
| joint-8 | direct | -3.58 s | -3.63 s | 25/30 |
| direct | joint-8 | 3.58 s | 3.63 s | 5/30 |
| joint-1 | joint-8 | 8.84 s | 10.12 s | 1/30 |
| joint-3 | joint-8 | 0.81 s | 0.19 s | 12/30 |
| joint-5 | joint-8 | 0.10 s | 0.35 s | 14/30 |

The summary publishes all five differences for every scenario, not just aggregates. Direct and joint-8 are rerun controls; no historical time is substituted.

## Reference-tool loss diagnostics

These are counts of scenario/repetition/reference-tool entries that were never exposed during that execution. Narrow follow-up queries naturally omit already used tools. A reference tool can be absent while a valid alternative path still completes the goal. Unknown or failed stages are not counted as negative inclusion decisions.

| Condition | Preselection | Inclusion | Final cut | Delivery/error or unobserved | Exposed at least once |
|---|---:|---:|---:|---:|---:|
| joint-1 | 0 | 0 | 14 | 0 | 361 |
| joint-3 | 2 | 5 | 9 | 0 | 359 |
| joint-5 | 2 | 6 | 7 | 0 | 360 |
| joint-8 | 1 | 6 | 0 | 0 | 368 |

Per-preparation retrieved/included/exposed tool identities, first-discovery losses and cumulative losses are retained in observations and the numerical summary. Traces are evaluator metadata and were not included in model input.

## Evaluator implementation audit

The semantic outcome requirements were fixed before measurement, but the online recognizer had false negatives. The final audit recognizes equivalent empty-history wording, affirmative raised confirmations, formatted phone numbers and an explicit zero-event total from an alternative endpoint. It also removes a draft-status word requirement that was not requested. These corrections apply uniformly across conditions and repetitions. No question, model call, response, time, cost or persisted state was changed; no execution was replaced.

Both onlineGrade and the final grade are retained. The original online total was 725/750; the requirement-based audited total is 742/750. The [clarification record](../../verification/v3p2/evaluator-clarification.json) documents each rule, and [review notes](review-notes.json) list changed verdicts and remaining failures. The recognizer corrections are a disclosed deviation from the initial operational freeze. Final success counts are audited outcomes, not wholly preregistered automatic scores or blinded independent human adjudication.

## Scope and interpretation

Only final exposure differs among the four joint arms. V3 inclusion instructions, thresholds, alphabetical order, top-64 retrieval, model/prompt, per-case budgets and availability policy are unchanged. The explicit cap truncates after inclusion; omitted-cap legacy V3 behavior is preserved. No new parallelism, service split, Systemgate or voice test is added.

Five repetitions of one authored corpus measure within-scenario variability, not performance on five independent datasets. Small median differences do not establish a general winner. Compare full completion, 5/5 scenario reliability and total spending before considering conditional successful-task speed. The fixture remains the V3 fixture, including its documented sparse/inconsistent analytics fields.

[Protocol and frozen criteria](../../docs/V3-PART2.md) · [Observations](observations.json) · [Full numerical summary](summary.json)
