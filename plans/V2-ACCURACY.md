# V2 accuracy experiment

## Status and authorized scope

Verified, 2026-09-24. Owner: Codex. Publication repository starts at
8d687e5548566850ebdb716da9d8347996f87f6f on main with a clean tree. The enclosing
workspace is not a Git repository. Woku has pre-existing integration edits on
feature/toolgate-comparison; preserve them. Historical observations are immutable.

The operator requests 60 English requirements per condition: direct MCP,
agent-initiated Toolgate, host-first Choice, and host-first parallel binary.
The operator selected Go only (240 cases), GPT-6 Luna through the OpenAI API,
and full business-handler execution on a test database. Paid OpenAI and Jev
calls for this experiment are authorized. No production mutation is authorized.

Primary outcome: first business-tool selection correctness. Also measure eventual
selection, valid arguments, business success, unsafe extra mutations, abstention,
ambiguity, final-answer latency, model/core/handler hops, tokens, estimated API
costs, CPU and memory. Never equate a final answer with successful execution.

## Verified inventory

The 27 active Woku registrars expose 143 tools (73 read, 70 mutation). Hidden
improvement-cycle registrations are not in the active MCP. A registration-only
export used the real MCP tools/list transport and invoked no business dependency.
An isolated API preflight accepted all 143 unmodified function schemas with
model gpt-6-luna, reasoning high, HTTP 200. Preflight consumption stays separate.

Existing Toolgate core lexical retrieval uses top 32 then optional expansion to
64; binary mode evaluates up to 64 retrieved tools with concurrency 22. Catalog
size and inference candidate size must be reported separately. Existing SDK only
supports reads. Woku schemas include six pattern expressions outside the current
schema profile. These cannot be silently stripped. Contract before changes:
3738ee131340ac2e23f2823efc79f47dbe19e7ec17fd763042fd23e17860b2d2.

Read: root PLANS/DECISIONS, shared PRODUCT/ARCHITECTURE/BENCHMARK, publication
CONTRACT/SELECTION/STATE_MACHINE/SECURITY/JSON_SCHEMA_PROFILE, Woku AGENTS and
actual registrars, SDK provider/store, core selection/validation. The optional
root .agents Toolgate skills are absent. Scope is the published experiment,
its Go/Rust schema consumers and single SDK, plus an isolated Woku test harness.
No changes to older source mirrors unless needed by the explicit build path.

## Steps

- [x] Inventory, catalog export, model compatibility probe, clarify four conditions.
- [x] Freeze 60 English cases and oracles before live evaluation.
- [x] Add bounded schema compatibility and authorized mutation SDK support with regressions.
- [x] Provision isolated test databases and genuine Woku handlers; verify state reset.
- [x] Add Responses API runner, complete accounting, immutable/resumable capture guards.
- [x] Run deterministic and integration gates, then independent live smokes.
- [x] Freeze inputs and run all 240 cases without replacing failures.
- [x] Analyze, document limits and update README/handoff in English.

## Planned verification

Contract check and cross-core schema fixtures; Go unit/race/vet; Rust fmt/Clippy
and tests; SDK types/unit/external tarball and durable write approval/replay tests;
runner tests with fake HTTP OpenAI responses; corpus/schema/state oracles;
separate live smoke captures; offline report recomputation and privacy checks.
No runtime gate is claimed passed until its actual command and exit are recorded.

## Risks and recovery

The previous services are stopped. Docker is available but no prior containers
or images are present. Create new explicitly named disposable resources, retaining
old state files. Never use the provider's existing .env to select a business DB.
Synthetic identities and known IDs appear in each requirement where necessary.
Reject real sending integrations; record unavailable capabilities honestly.
A failed/uncertain handler is never automatically retried. Preserve partial runs.

## Gates before the measured matrix

Go make check, Rust make check (with the existing local cargo audit/deny tools
on PATH), SDK npm run check, the external SDK tarball, both core HTTP/PG suites
(29 checks each) and durable mutation suites (11 baseline and five mutation checks
each) passed with exit 0. Host unit tests and both historical numerical reports
passed. All 60 native handler oracles and all 30 persisted mutation oracles passed.
Final API smoke: eight cases, all expected handlers and mutation states passed;
separate evidence is verification/v2/live-smokes.json.

Development failures retained: missing fixture directory and incorrect relative
test path; Rust Clippy collapsible-if; TypeScript fixture narrowing and async lint;
cargo-audit absent from initial PATH; a floating-point exact-equality test; initial
seed prerequisites and missing deletion confirmations. The first development smoke
used an in-process adapter and stopped on artifact drift after four read cases.
It exposed an absent-isError accounting bug, fixed before the final HTTP MCP smoke.
The final provider hosts the SDK and native handlers in the same Woku process.
No development result is part of the measured matrix.

A subsequent protocol review stopped the first candidate matrix after 42 complete
cases (117 model calls, 728 Jev calls), at a case boundary through the artifact
guard. It lacked validation of the public MCP entry-point argument schemas in the
new provider adapter. Added that validation, including rejection before any core
request, and reran all affected gates and eight live smokes. Also rejected draft-07
reference validation siblings to prevent cross-validator dialect differences; the
measured 143 schemas contain no such siblings. Corpus and selection thresholds
were not tuned from results. The 42-case capture is exported separately as an
interrupted run, including its SELECTOR_INVALID_RESPONSE failure and all usage.
Final semantic manifest: 920d202a45799fbeabc89d0810f6c5d5bf2a3c8b77e397b36ee35e8406c8cf0b.

## Final result

Run 2026-09-24T12-31-43-003Z completed all 240 cells with unchanged measured
runtime artifacts: 239 final answers, 237 expected-handler successes, 120/120
correct mutation states, 732 OpenAI requests and 3,926 Jev requests. All usage was
reported. Independent Python Decimal accounting and median recomputation agree
with the public report. Direct and design 1 reached the expected handler in all
60 cases; design 2 reached 59 and design 3 reached 58. Strict first-reference
selection is a separate metric affected by the direct agent's discovery reads.

Four V2 README diagrams were parsed and browser-rendered with Mermaid 11.12.0.
Historical V1 reports recompute unchanged. Publication clarifies only two normative
documentation sections after measurement; measured and publication manifests are
recorded separately, with no runtime or wire change. Complete evidence and limits
are in verification/v2/VERIFICATION.md and results/v2/review-notes.json.
