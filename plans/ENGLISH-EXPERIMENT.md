# Execution plan: English experiment and reproducibility package

## Scope and baseline

Owner: Codex. Date: 2026-09-23. Verified. This folder and its parent have no
Git metadata, so there is no source commit to report. Runtime and wire provenance
is recorded in docs/source-manifest.json. Contract 0.1.0, export manifest SHA-256
34735acc922c2261570bed30a849007f3165c7752ab0312547f50ef011aed24f.
The measured runtime retains the original manifest
160a06fdad7daad26705a239998c7f74a46eaeba3617a61f1db9d955db1736bd.

Authorized work: finish this English source package, run the same 30 questions in
five conditions against the existing authorized development provider, and report
actual measurements. No provider source/data, declared license, publication,
commits, production changes or development subagents. No em dashes.
Requirements TG-006/029/033/034 cover measurement, privacy and packaging; this
does not close the full core/SDK backlog or invent missing CT identifiers.

## Inventory and sources

Read parent AGENTS, DECISIONS, PLANS, PRODUCT, ARCHITECTURE and BENCHMARK; local
AGENTS, CONTRACT, SECURITY, reproduction/integration guides, runner and analysis.
The historical session was inspected as read-only reference. Workspace is
authoritative. Both original cores and provider are running. Existing provider
changes are preserved. The referenced development skills are absent.

The earlier English attempt stopped after an expired MCP token. Its 43 records
remain intact. Two prior live smoke tests and source-copy checks are recorded in
verification/. The results directory and final README results were unfinished.

## Steps and acceptance

- [x] Stop on MCP authentication/setup failure, preserve the record, restore direct
  mode, and reject unavailable direct tools before paid inference.
- [x] Verify renewed access with one live smoke, then freeze the harness and run
  a fresh serial 150-case matrix. Do not retry failed cases or build during it.
- [x] Review tool/filter correctness, response differences, token coverage and
  failures. Retain all observations and distinguish final answers from success.
- [x] Export sanitized measurements and reproduce the numerical summary offline.
- [x] Complete the mini-paper README, provider guide, limitations and future work.
- [x] Check the source-only package outside this workspace, record exact gates,
  and leave a handoff. No private runtime files in the publication artifact.

## Validation and recovery

Node host tests and Python analysis tests; make check; make integration with the
dedicated disposable export database; source-only copy verification and secret/
path/punctuation checks. Live calls require --allow-paid and existing normal OAuth.
Initialization failure is a stopped attempt, never a reason to loop through paid
questions without tools. Resume rejects drift and never reruns recorded cases.
Keep aborted captures separate and disclose them alongside the completed matrix.

## Evidence

Initial regression: `node --test tools/tests/run-safety.test.mjs` failed with exit 1
because run-safety.mjs did not exist. Further evidence will be appended at closure.

Live matrix: 2026-09-23T15-41-24-430Z. Renewed direct smoke passed; 11 Node
host/adapter/safety tests and 8 Python tests passed before this run. The harness
is frozen, including the new run-safety source hash. No compilation runs alongside
the matrix. Q06 findings are preserved in results/review-notes.json.

## Closure

Completed all 150 English cases and the public mini-paper, data export, provider
guide and archive tooling. Numerical analysis reproduces exactly from public
observations. Independent source-copy make check exited 0. Integration initially
exited 2 because the dedicated test container was stopped; after restarting that
same container, make integration exited 0 with 29 HTTP/PG and 11 SDK checks per
core. No fixtures or assertions were weakened. Full evidence, exclusions and
next actions are in ../verification/VERIFICATION.md and HANDOFF.md.
