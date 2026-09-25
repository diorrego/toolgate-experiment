# V3 part 2: final exposure and successive discovery

This experiment changes only the final exposure cap among four host-first joint
Toolgate conditions: 1, 3, 5 and 8. Direct MCP exposes all 143 tools as a fresh
control. Each condition runs the same 30 V3 requests five times, for 750 executions.
No V3 timings are reused. Code/results are for a local commit only, with no push.

## Frozen design

- Baseline: local commit 8c9ad7e, V3 design 2.
- Same GPT-6 Luna/high Responses API model, system instructions, tool descriptions,
  generation parameters, 20-turn/240-second case budgets and provider policies.
- Same Jev 1.13.0 joint inclusion questions, lexical top-64 preselection, .70 read
  and .85 mutation thresholds, and alphabetical tool_id exposure order.
- Explicit caps truncate the included set after sorting. No filling, confidence
  reranking, novelty filtering, automatic rotation or forced follow-up query.
- All returned operations remain in context. The operator explicitly confirmed
  V3 reuse: an issued operation replays the same arguments; different arguments
  require fresh preparation. This is not a reusable-schema/new-arguments variant.
- One joint Go core is measured. Rust implements the same additive contract for
  compatibility tests; it is not another experimental condition. No new parallelism,
  service split, voice or Systemgate is introduced. V3's existing read batching
  and parallel_tool_calls parameter stay unchanged.

An omitted exposure_limit preserves historical V3 behavior, including refinement
when more than eight tools are included. Explicit part-2 limits use the same
truncation policy in every joint arm, including the new Joint-8 control. The cap
is trusted provider configuration, absent from model-controlled MCP parameters.
The agent's tool descriptions still say up to eight, unchanged from V3.

The only run-wide counter adjusted for the authorized larger matrix is the model
attempt guard (15000 rather than 3000). The per-execution budgets are identical;
the 20000 Jev-attempt and $20 known-estimated-cost guards remain. An accounting
guard is not an extra agent turn budget or a guarantee about invoices.

## Cases, reset and condition order

Question texts and synthetic fixture are identical to V3, including the recorded
sparse/inconsistent analytics fields. The evaluation adds explicit required names
for the team-members question. Case-specific HMAC identifiers use the same private
seed and remain identical across paired conditions and repetitions; no identifiers
or evaluator data are placed in the model's initial context.

Each scenario/repetition block runs all five conditions serially, restoring the
fixture and creating a new model conversation for every execution. Condition
position rotates by scenario and repetition, so every condition occupies all five
positions exactly once per scenario. Scenario order rotates by seven positions
between repetitions. This controls order effects without assuming API caches are
cold or independent. Provider/SDK/core processes retain normal pools and caches.

The excluded smoke uses three scenarios across all five conditions: tracker joins,
named team membership, and a task mutation. Completion failures in a valid smoke
are retained; model errors are not repaired by tuning prompts or thresholds.

## Corrected primary evaluation

[evaluation.en.json](../data/v3p2/evaluation.en.json) and
[evaluate.mjs](../tools/v3p2/evaluate.mjs) are frozen before part-2 model calls.
Evaluation checks goal evidence, not a mandatory discovery path:

1. A nonempty completed answer must contain the requested semantic anchors, status
   and values under the case's documented case-insensitive patterns. Markdown is
   normalized. Mutations require an affirmative result, not merely an empty finish.
2. Successful native outputs must identify the requested entities by actual IDs
   and labels. Every ID argument must be grounded in an earlier successful result.
3. Explicit relations are checked: flow order, woku/folder membership, tracker
   assignment joins, group member/role and plan count, and complete history retrieval.
   Member names must appear in both native evidence and the final answer.
4. Persisted seeded business documents must match the expected state, including
   unchanged distractors. Only timestamps and Mongoose version counters are ignored.
   A create must add exactly one expected item. Non-reference mutation handlers or
   wrong target IDs fail the improper-mutation check; final state validates values.

For example, finding a saved report first, verifying its folder and then reading
its summary is accepted without requiring list_folders. The oracle does not require
initial full coverage, so a successful cap-one sequence can pass after successive
queries. Reference-path matching remains a diagnostic only.

These are finite evidence/answer checks for an authored dataset, not a universal
natural-language judge. Unknown evidence fails rather than being guessed. The
historical V3 capture was used only as a preflight regression: the valid alternate
report path passes and the two ID-only member answers fail. Its original scores,
failures, retries and observations are untouched. All 76 native oracle calls (the
V3 sequence plus company-member lookup) passed before part-2 model calls.

## Where reference tools are lost

An optional bounded HTTP diagnostic carries integer indices into the immutable
catalog, not extra schemas: retrieved, included and exposed. Null means a stage
was not completed; [] means it completed with no results. The provider converts
indices to metadata IDs for private evaluation. It never forwards these diagnostics
to the agent. SDK/provider checks treat malformed or out-of-catalog telemetry as unknown.

Each reference tool is classified on the initial discovery and cumulatively:
preselection, inclusion, final cut, exposed, or delivery/unobserved failure.
Failed inclusion is not a negative vote. A tool trimmed on one request but exposed
later is cumulatively exposed. Later narrow queries legitimately omit already used
tools; their omissions are not automatically task failures. A valid alternative
route can succeed without ever exposing a particular reference tool.

Actual exposure counts come from returned operations, including repeated exposure
and distinct tools retained over the execution. Actual usage comes from native
handler calls, with per-preparation lists and unused exposure recorded separately.
Additional preparations include failed requests. SDK retries and every Jev attempt
remain separately counted, even when they do not produce a usable set.

## Timing, consumption and analysis

Question-to-termination time includes initial host preparation, later queries,
model calls, remote decisions, handlers, failed calls and final response generation.
MCP bootstrap is recorded separately, as in V3. There are no heavy build/test runs
or concurrent experimental cells during the measured matrix.

Report complete executions out of 150 per condition and scenarios correct in all
five repetitions out of 30. Publish the full 0-to-5 distribution and every
scenario/repetition outcome. Median and p95 include failures; successful and failed
latency are also shown separately. Each timing difference pairs the same scenario
and repetition with the fresh direct or Joint-8 control. Scenario-level medians
are also aggregated so each scenario has equal weight.

Agent and Jev calls, token categories and cost estimates remain separate. Missing
usage is unknown, not zero; known consumption is only a lower bound in that case.
The V3 price snapshot is retained. Cost per successful execution includes spending
on failures in its numerator. CPU and RSS are recorded, but this is not a load or
language-performance study. Small timing differences do not establish a general
winner; completeness and five-repetition reliability matter first.

## Reproduction and captures

Native Woku handlers are not vendored. Live repetition requires the compatible
provider and the V3 control interface plus /ids. The included fixture, provider
adapter and protocol tests do not substitute for actual business handlers.
Use the private V3-style config with tools/v3p2/run.mjs and the corrected evaluator.
Keep credentials, raw model outputs, native results and fixture seed outside Git.

The runner writes an immutable raw cell plus an atomic manifest checkpoint. An
active-cell marker rejects automatic resume after an uncertain interruption.
Completed failed cells are preserved on a normal resume; they are never replaced.
Artifacts and evaluator are fingerprinted, and a completed run cannot resume.

After completion:

```sh
node tools/v3p2/report.mjs --private=/path/to/private-run-manifest.json
node tools/v3p2/report.mjs --check
```

The export regrades every private cell and checks its SHA, model cost and Jev
accounting. Public observations retain only allowlisted metrics, verdicts and tool
metadata; raw provider payloads and model output remain private. See the part-2
plan and verification directory for actual gate results and excluded captures.


## Completed audit and verifier clarifications

The matrix completed all 750 cells. Original online verdicts are retained in
onlineGrade. The finite recognizer had implementation false negatives under the
already fixed user requirements: equivalent empty-history wording, affirmative
raised confirmations, phone formatting, an unrequested draft-status word, and
an alternative endpoint explicitly reporting events=[] and totalEvents=0. The
same requirement checks are applied uniformly in final-evaluation.mjs. Seventeen
verdicts change from the original 725 to 742 successes. No model input, response,
selection, state, timing or cost changed; no execution was replaced. This is a
deterministic implementation-assisted audit, not blinded human adjudication.

Two failed Jev attempts did not report token consumption. Their counts remain,
and the affected condition totals are unknown, with known costs reported only as
lower bounds. See the comparative report, review notes and verification record.
The experiment services are stopped and data retained. Delivery is local only.


Operational-freeze deviation: the recognizer required corrections during/after
inspection of measured outputs. Final success counts are audited outcomes, not
wholly preregistered automatic scores. Both original and corrected verdicts remain
available; selection, execution, timing and consumption were not changed.
