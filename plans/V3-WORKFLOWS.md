# V3 multi-tool workflow experiment

Owner: Codex. Status: complete locally, 2026-09-24.
Baseline: b3b42c3 (V2), clean main. The operator confirmed V2 is the base and
authorized V3: 30 English requirements in each of four conditions, Go only,
GPT-6 Luna/high API, Jev 1.13.0, all 143 tools, native test-database handlers.
Paid model calls and synthetic database changes are in scope. Production is not.

## Design and contract

Preserve TG-001 through TG-008 and TG-010 through TG-034. A workflow preparation
selects a bounded SET of authorized tools, returning separate normal operations.
The agent owns dependency ordering, argument extraction and synthesis. Every
business invocation still requires a remote decision and provider-local durable
ledger/authorization/approval. No business result is sent to the selector.

The additive /v1/workflows endpoint and prepare_workflow MCP surface are shared
by both cores and the one SDK. Legacy single-operation APIs stay unchanged.
Joint selection asks one closed yes/no Choice question per retrieved tool in one
Jev request; parallel selection sends those same questions separately with 22
workers. Existing lexical retrieval cap 64, read threshold .70 and mutation .85
are retained; multi-label inclusion has no competing-tool margin. More than eight
positives returns needs_refinement, never silent truncation. All responses must
validate before any child operation is committed. See ADR 0005.

Direct receives all 143 schemas. Design 1 asks the agent to prepare a workflow.
Design 2 prepares from the verbatim user request before the agent, jointly.
Design 3 does the same with separate concurrent judgments. All gated agents can
request further preparation when discovery reveals a missing tool; count every
repair. No oracle data is exposed to the host, model or selector.

## Corpus and grading

Author 30 requirements with 2+ distinct necessary tools and genuine ID dependencies;
15 reads and 15 mutations, no external sends. Add distractor records and derive
per-case opaque IDs from a private seed, shared across conditions but unknown to
the agent. Verify reference sequences against actual handlers before freezing.
Use named steps, dependency edges, exact required argument subsets, expected
persisted state and explicit answer facts. Accept documented equivalent discovery
paths. Report initial tool-set precision/recall, complete workflow success, grounded
dependency execution, mutation state, final answers, unnecessary/unsafe mutations,
latency, all API/core/handler hops, tokens/cost estimates, CPU and RSS.

Preserve rotating order, fresh conversations, database reset before each cell.
Raise identical limits to 20 model turns/240 seconds for longer workflows; allow
multiple function calls per response with bounded read concurrency, serial writes.
Record the change from V2. No test-result-driven corpus edits or replacement cells.

## Steps and gates

- [x] Inspect V2, confirm naming, read applicable instructions and official API docs.
- [x] Freeze ADR, additive schemas and implement Go/Rust/SDK with negative tests.
- [x] Build fixture and 30 native multi-step oracles with dependency/state checks.
- [x] Implement host scheduling, multi-call handling and grading with fake tests.
- [x] Run contract/generation, Go/race, Rust/Clippy, SDK/tarball, real DB parity.
- [x] Separate final live smoke passed; frozen main matrix completed all 120 cases.
- [x] Audit results, write English README/report and handoff, stop owned services.

Relevant sources read: root PLANS/DECISIONS/PRODUCT/ARCHITECTURE, toolgate AGENTS,
V2 plan/handoff, shared API/state/security/selection, SDK provider/remote and core
prepare/persistence paths; Woku AGENTS. Local optional Toolgate skills are absent.
Do not edit old root core mirrors, provider source or historical result captures.

## Evidence

Initial semantic manifest:
431b6fc5be13e9b6bea0bebb17bf0d834312bf30862e52ca4b02f18434a48f96.

New manifest: ecb438ea4b0f3ac8294be2187a90adb963fbd6e74828f7173c1f0e47e15cc8f2.
Go make check, Rust make check, SDK npm run check, external tarball, legacy
HTTP/PG suites (29 checks each plus durable mutation SDK), workflow conformance
(18 HTTP/PG checks and nine SDK checks per core/profile) passed. Five host tests
passed. All 75 native oracle calls, 30 state checks and grounded dependencies
passed. Eight live smoke cells passed and remain separate from the main run.

Development failures: new Go workflow decoder test first failed because the
implementation was absent; a generator was initially invoked from the wrong cwd;
the fixture used wrong ticket/report field names and treated native phone storage
as encrypted instead of normalized plaintext; these were corrected against native
schemas before freezing. The local mock server's default five-connection accept
backlog caused a parallel test timeout; an explicit 128 backlog fixed the fixture.
SDK preparation initially double-canonicalized the schema digest; reuse of the
existing binding verifier corrected this before any live smoke.

The first candidate matrix was deliberately stopped at a completed-cell boundary
with 31 records (140 OpenAI calls, 921 Jev calls). Its raw file is preserved and
its original scores/usage are exported in results/v3/development-observations.json.
Two infrastructure/methodology corrections preceded the definitive pass:

- V3-02 now permits unfiltered woku discovery plus a folder join, requiring output
  evidence for the target folder and woku. User text and all other cases are
  unchanged. Both valid orders and rejection of a different folder have a regression.
- Both workflow selectors classify deadline expiration as DEADLINE_EXCEEDED (504)
  and non-JSON HTTP failures as SELECTOR_UNAVAILABLE (503). The HTTP client's
  deadline can fire before context cancellation becomes visible, so Go also checks
  the wrapped deadline error; Rust handles request timeout and outer deadline.
  The new deterministic HTTP tests passed for both profiles on both cores.

These corrections were not substituted into prior scores. The final native
oracles all pass. The SDK additionally tests rejection of duplicate tools, wrong
catalog versions, wrong effects and altered schemas before storing snapshots.
The final smoke and definitive matrix use new immutable captures. Historical V1
and V2 measurements are untouched.


## Final result and delivery restriction

The definitive run completed 120 unique cells from 18:50:41Z to 19:21:18Z with
unchanged artifacts, 120 final answers, 549 OpenAI calls and 3,298 Jev calls.
All 60 mutation states matched. Reference success is 30/29/30/30; the explicitly
secondary completion review is 30/29/30/29. The difference is explained in the
report, not hidden by regrading original observations. Main estimated cost is
$0.270314074 with complete usage. Native execution had no handler errors; two MCP
operation errors were recovered and remain counted. All owned services stopped.

The operator explicitly directed that the commit remain local. Do not push or
update the GitHub repository metadata. See V3-HANDOFF.md and verification/v3.
