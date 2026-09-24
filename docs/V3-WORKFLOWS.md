# V3: dependent business workflows

V3 extends [V2](V2-ACCURACY.md) to requests that require several tools. Its primary
outcome is completion of the reference workflow with grounded arguments and the
expected persisted state. Selecting a plausible tool set is a separate outcome.

## Fixed conditions

Thirty English requests per condition, 120 cells: direct MCP, agent-first joint
Toolgate, host-first joint Toolgate, and host-first parallel Toolgate. The catalog
is the same 143 active Woku tools as V2. The agent is GPT-6 Luna/high through the
Responses API; selection uses Jev 1.13.0. Only Go is measured. Rust implements and
tests the same additive contract, but it is not another benchmark arm.

Real native Woku business handlers execute in an isolated MongoDB database.
The provider contains the installed TypeScript SDK, a durable PostgreSQL ledger,
and the authenticated MCP endpoint. The independent Go service uses PostgreSQL
and verified HTTPS to Jev. The SDK uses verified HTTPS to the Go service. All
fixture data is synthetic; this is not a production deployment or a refund test.

The agent receives only the question, instructions, MCP definitions appropriate
to its condition, and actual tool results. It never receives the oracle, seed,
expected tool names, fixture dump or evaluator's control endpoints.

## What changed

`prepare_workflow(intent)` asks the remote core for a bounded tool set. The response
contains up to eight ordinary operations, each with one selected schema. The agent
determines dependencies, calls discovery tools, extracts IDs, and then supplies
arguments to later operations. The core does not execute a workflow or inspect
business results. Every invocation retains the remote execution decision,
provider authorization/approval and durable claim/replay checks from V2.

For example, a request about tracker names and values for a woku described as
"Mercury Reception" requires discovering its ID, reading its tracker assignments,
and joining their tracker IDs with the tracker catalog. Toolgate returns schemas;
Luna performs the discovery and join. A definition can be selected once but used
several times with different entities: each fresh invocation needs a fresh
operation. Replaying the same operation cannot execute different arguments.

Jev Choice selects one option, so V2's single multi-option question cannot directly
return a set. V3 uses one yes/no Choice question per retrieved candidate. Joint
mode batches those named questions into one API request; parallel mode sends them
individually, with at most 22 concurrent requests. These are request-batching
conditions, not evidence that Jev internally reasons over the entire set jointly.
Both use identical inclusion questions and authorized metadata. Lexical retrieval
still limits the set to 64, read inclusion requires .70, other effects .85. There
is no competing-tool margin for multi-label inclusion. More than eight positive
tools returns `needs_refinement`; missing/invalid selector answers fail the whole
preparation. No silent partial set is accepted.

Design 1 starts with Luna constructing the workflow intent. Designs 2 and 3 start
with the trusted host submitting the verbatim user question and only then invoke
Luna. All three let the agent prepare a narrower remaining workflow if tools are
missing or another invocation is needed. Every such recovery counts toward time,
tokens, cost and calls. No evaluator supplies missing tools after selection.

The identical agent budget is 20 responses and 240 seconds per cell, raised from
V2's 8/120 for multi-step tasks. `parallel_tool_calls: true` allows multiple calls
in a response. The host executes independent read calls in batches of at most
four; writes and preparations are serial barriers. The agent must wait for a
discovery result before calling a tool that depends on it. All admitted work is
joined before the next case. The selector/core budgets remain 2200/3000 ms.

## Corpus and oracles

[The corpus](../data/v3/corpus.en.json) contains 15 reads and 15 mutations, 75
reference handler calls, two to four calls per request and at least two distinct
tool types in every case. There are 39 distinct reference tools; 104 catalog tools
have no positive reference step (some can still support valid alternative paths).
Sixteen requests have two reference calls, thirteen have three, and one has four. It spans wokus, folders, flows, forms, clients, tickets,
action plans, teams, trackers, saved reports, data flows and quarantines. There
are no outbound deliveries. Similar-name distractors accompany discovery targets.

[The fixture](../data/v3/fixture.json) stores synthetic templates. On reset every
24-hex identifier is replaced by HMAC(seed, case ID + original ID), so an agent
cannot guess sequential IDs or reuse an ID from a prior case. All four conditions
get the same IDs and baseline for a case. The seed stays outside model context.
Native models cast fixture types; email uses the provider's encryption service.
Client phone values follow the native digits-only storage rule.

Reference calls are executed independently before live evaluation. Each must
succeed, every dependent ID must appear in an earlier successful result, every
expected answer fact must exist in the native output, and all 15 mutation state
oracles must match. Fixture/schema corrections during this preparation are
development work, not replaced measured cases. See the verification evidence.

The primary reference-workflow grade requires:

- All named steps succeed with the required argument subsets. Discovery `search`
  is accepted where the corpus explicitly declares it as an alternative.
- Declared dependencies finish before dependent calls start. Each ID argument
  must appear in an earlier successful business result; same-response guesses
  do not become grounded because their calls happen to finish later.
- Final persisted business documents equal the expected snapshot, including
  unchanged distractors. Only timestamps and Mongoose version counters are ignored.
- No non-reference mutation invocation is made. Reads must leave business state
  unchanged. Appending tasks or assigning trackers must create exactly one entry.

This is a reference-path metric, not proof that every possible valid alternative
workflow was enumerated. Extra read calls are counted but do not alone fail a
case. A successful handler sequence and a final answer are recorded separately.
Case-specific literal answer facts are an additional diagnostic, not an LLM judge
or a comprehensive semantic evaluation of prose. Final-answer wording is not used
to waive a failed handler, guessed ID or incorrect database state.

Initial set precision counts selected tools matching the reference or an explicit
alternative; initial step coverage measures how many required step types the
initial set supports. Direct MCP has no separate selection stage, so these
metrics are not applied to its full catalog. End-to-end comparison uses actual
execution. Operation/selector failures, abstentions and refinements remain in
the measured matrix. No successful-only latency substitution is made.

## Accounting and reproducibility

Fresh conversations, reset state and serial cells with rotating condition order
follow V2. With 30 cases the four positions occur seven or eight times per arm,
not exactly equally. Question-to-termination time includes host preparation,
model requests, MCP calls, remote decisions, local handlers and final generation.
MCP connection/list bootstrap is recorded separately. CPU and RSS use the same
process sampling approach as V2. The host retains prior captures in memory, so
its RSS includes accumulated measurement data. Overlapping calls are not added
to task time.

Raw private captures retain attempts, usage, synthetic traces, answers and state.
Published observations remove model output and provider payloads while retaining
scores, tool identities and accounting. Missing usage is unknown, never zero.
Costs use the V2 price snapshot and remain estimates, not invoices. A changed
corpus, multi-label selector and larger turn budget prevent causal comparisons
between V2 and V3 medians.

Use `tools/v3/run.mjs --live --config=<private-config>` against the documented
V2 control protocol plus evaluator-only `/ids`. The provider must remap fixtures
before registration context use, expose `workflow_tools` from the shared MCP
file for gate modes, and include native start/end times and outputs in the private
trace. `tools/v3/provider.mjs` hosts the SDK in the provider. Do not expose control
routes or seed to the evaluated agent or deploy this lab adapter in production.

The harness fingerprints the corpus, fixture, catalog, SDK, core binary, provider,
agent loop and dependencies. A completed run cannot resume; drift stops a run at
a cell boundary. Separate smoke captures are not part of the main matrix.

Implementation contract: [ADR 0005](../shared/adr/0005-v3-workflow-preparation.md).
API mechanics: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [TypeSafe question batches](https://docs.typesafe.ai/api).


## Development captures

A first candidate matrix stopped after 31 completed cells to fix an overly strict
folder-filter oracle and align selector timeout/HTTP-error classification across
cores. It is retained in [development observations](../results/v3/development-observations.json)
with original grades and usage. The corrected folder case accepts discovery in
any order but requires evidence of the actual folder and woku in successful
outputs. All 30 user questions are unchanged. The final matrix starts afresh;
no candidate cell is spliced into it. Repeated development/smoke queries can warm
provider caches; this is not a cold-cache or held-out-corpus study.


## Local analysis commands

After a complete capture, generate the secondary interpretation first, then the
allowlisted export, primary report and independent numerical audit:

```sh
node tools/v3/review.mjs --private=<private-completed-capture>
node tools/v3/analyze.mjs --private=<private-completed-capture>
python3 tools/v3/audit.py
make report-check
```

The secondary review does not change the frozen grades. It documents a valid
folder-report discovery alternative and checks whether the team-members answer
resolves names. It is post-run, source-backed analysis by Codex, not blinded
independent adjudication. Read its fixture limitations before generalizing.

The summary includes serial timed-task throughput and total matrix wall throughput,
not a saturation/load benchmark. Failed/limited cases remain in the denominator.
The implementation and completed results are committed locally only; the operator
has not authorized pushing V3 to the remote repository.
