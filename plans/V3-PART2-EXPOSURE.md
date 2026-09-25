# V3 part 2: exposure size and successive discovery

Owner: Codex. Baseline 8c9ad7e; clean main. Local commit only, no push.
Authorized: 30 unchanged V3 questions x five conditions x five repetitions = 750
fresh executions, plus an excluded smoke. Same synthetic native provider, Go joint
selector, GPT-6 Luna/high, exact V3 prompts and per-case budgets (20 turns, 240s).
Paid API calls are authorized by the requested experiment. No production access.

## Isolation

Only final exposure changes: direct 143, joint caps 1/3/5/8. The preselector stays
lexical top-64, inclusion questions and thresholds stay byte-identical, and the
existing alphabetical tool_id order is preserved. Explicit cap requests truncate
the positive set after inclusion, without padding, novelty filtering or rotation.
An omitted cap preserves historical V3 overflow behavior. Joint-8 is rerun, not
borrowed from history. Diagnostics never reach the agent. One core deployment;
no new parallelism or services. Existing V3 read batching is unchanged.

The operator explicitly confirmed unchanged V3 operation reuse: identical arguments
replay; new arguments after execution require a new preparation. The prompt and
availability policy stayed unchanged.

## Evaluation and schedule

Freeze a condition-independent outcome oracle before smoke/model calls. Accept
valid alternative discovery when identity and requested results are grounded;
require member names in V3-08. Check final answer, exact mutation state, unrelated
state and mutation calls. Reference set coverage is diagnostic only. Preserve all
V3 originals, failures, retries and excluded development evidence.

Five repetitions rotate both scenario and condition order. Each (scenario,repeat)
block runs all five conditions serially with fresh context and reset fixture;
per-block IDs are identical across conditions. Keep 20 turns/240 seconds per cell.
Scale the operational model-attempt guard to 15000 for the authorized 750 cells;
retain the $20 known-cost guard and 20000 Jev-attempt guard. These guards are not
extra agent budget. Preserve failed cells, checkpoint each cell, resume only under
unchanged fingerprints and never retry an uncertain effect.

Report per-execution success and scenarios successful in all five repetitions,
paired scenario/repetition timing, p50/p95, separate agent/Jev usage and estimated
cost, successive preparations, actual exposure/usage and first/cumulative stage
losses. Missing usage is unknown. No general winner from small differences.

## Implementation and checks

- [x] ADR/shared optional trusted exposure cap; Go/Rust parity, SDK telemetry.
- [x] Corrected outcome specification and deterministic regression tests.
- [x] 750-cell runner, immutable records, diagnostics and reproducible reports.
- [x] Native oracles, deterministic gates, HTTP/PG parity and excluded smoke.
- [x] Freeze, run all 750 cells, audit results and preserve failures.
- [x] Comparative README, stop owned services, local commit and handoff.

Relevant requirements: TG-013/014 selection, TG-018/020 child decisions,
TG-021/023/024 local authorized durable execution, TG-029/033 metadata/accounting.
Read root instructions, PLANS/DECISIONS and shared selection/security/state contract,
V3 handoff, core workflow implementations, SDK provider and exact V3 host loop.
Optional root Toolgate skills remain absent. Old root mirrors and Woku source are
outside scope; use private wrapper artifacts and the published experiment tree.


## Completed evidence

All 750 cells completed under unchanged measured fingerprints, with 749 final
answers, 3,838 agent calls and 1,534 Jev attempts. Every one of the 375 mutation
states matched, and no improper mutation handler was invoked. Goal success by
condition is 150/148/147/148/149 out of 150; scenarios correct in all five repetitions
are 30/28/27/28/29. Median task times are 13.66/20.62/12.30/9.88/9.78 seconds.

The original online verifier recorded 725 successes. Its mechanical recognizer
had false negatives; all originals remain in onlineGrade and private cell files.
The final audit has 742 successes under the same user-goal requirements, applying
uniform recognition corrections documented in evaluator-clarification.json. No
model response, timing or cost was replaced. The small Joint-5/Joint-8 median
difference is not evidence of a general winner.

All deterministic, native, package, HTTP/PG and numerical gates passed. Two Jev
attempts have no reported usage; Joint-5/Joint-8 total costs are unknown, with known
lower bounds published. The 15-cell smoke remains separate. All owned services are
stopped. This work is committed locally only, without a push.
