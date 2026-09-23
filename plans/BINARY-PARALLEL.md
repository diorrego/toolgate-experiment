# Execution plan: independent parallel tool suitability

Date: 2026-09-23. Owner: Codex. Completed. No development subagents or Git
commit. User authorization: one final English experiment where each question
is evaluated independently against all 22 authorized tools in parallel.

## Scope and baseline

Implement the same optional selector profile in the original Go and Rust cores,
mirror it in this publication package, and extend SDK telemetry and the portable
harness. Keep the existing English observations and source archives intact.
New prose, prompts, corpus and reports are English, without em dashes. No license,
publication, production deployment or provider writes. The existing authorized
development MCP and paid Jev access remain the live test environment.

Requirements TG-006/013/014/015/018/019/020/023/024/029/031/033 apply. This is a
GO-12/13/18 and RS-12/13/18 experimental slice with SDK measurement regression,
not closure of the complete backlogs or invented CT cases. Baseline wire contract
0.1.0 remains unchanged. Original documentation hash before this extension:
160a06fdad7daad26705a239998c7f74a46eaeba3617a61f1db9d955db1736bd; export:
34735acc922c2261570bed30a849007f3165c7752ab0312547f50ef011aed24f.

## Design

Use the existing validated Jev Choice request with one tool and `none` in each
independent call. All 22 authorized candidates launch concurrently under a bounded
worker/future pool; do not batch 22 questions into one API request. There are no
transport retries, early winners, hidden local selection or extra Jev arbitration.
Wait for the set; any missing/invalid response prevents automatic selection.
Retain the current acceptance threshold and margin; ties return needs_choice and
all negative results return no_match. Independent scores are not normalized into
a fictitious global probability distribution. Ambiguity resolution does not infer
again and authorization remains a separate code check.

Use a fixed selector mode at core startup. The laboratory owns four core processes
(two languages, two profiles) and selects their loopback routes between completed
questions through its trusted TLS proxy configuration. The SDK and MCP interface
remain common. Both profiles keep the same deadlines, pools, resources and safety
work. Count every attempted/completed/cancelled Jev request and report selector wall
time separately from the sum of overlapping request durations.

## Matrix and validation

Thirty identical English questions in five serial, rotated conditions: direct,
Go/Rust choice with host preparation, Go/Rust binary-parallel with host preparation.
One sample per question/condition. Expected initial selector calls: 60 choice and
1320 binary calls, plus separately recorded smokes and any observed additional
preparations. Freeze artifacts after deterministic gates and live smokes. Preserve
failures and stop on authentication/setup failure. No builds during measurement.

- [x] Regression tests: real HTTP concurrency barrier, only one tool per request,
  unauthorized candidates absent, multiple/zero positives, invalid responses,
  cancellation, full attempt/usage counts and cross-core parity.
- [x] Implement bounded parallel selection and optional telemetry in both cores.
- [x] Verify the same SDK, package consumer and durable workflow against both.
- [x] Run and review the live matrix with the existing English corpus.
- [x] Add sanitized results, exact costs/coverage and limitations to the mini-paper.
- [x] Update provenance, independent package checks, archive and handoff.

Sources: parent/local AGENTS, SDD selection/concurrency/testing sections, shared
CONTRACT/STATE_MACHINE/SELECTION/SECURITY/BENCHMARK, and TypeSafe Choice/API docs.
The current TypeSafe documentation recommends batching for efficiency, but this
experiment deliberately tests the user's independent-request topology. No latency
benefit is assumed. Futures support may promote the already locked futures-util
0.3.34 dependency (MIT OR Apache-2.0) for bounded, cancellation-owned futures;
no spawned task per candidate and no new service dependency is introduced.

## Progress

Go HTTP barrier and cancellation tests passed under -race. Rust reduction tests
passed. Both cores passed 19 identical real HTTP/PostgreSQL binary checks, including
22 simultaneous one-tool requests, permission filtering, timeout usage, ambiguity
resolution without new inference and invalid-response rejection. Go check and Rust
release Clippy passed. SDK measurement regression failed before implementation and
passed afterward. Full SDK and baseline gates remain in progress.

Two helper commands initially used the wrong working directory and failed without
editing their target files. One npx formatting attempt resolved an unpinned version
but matched no files; formatting was rerun using the pinned workspace executable.
No manifest or dependency upgrade resulted from that attempt.

ADR 0003 extends only the explicit experimental profile. Contract locks were
verified before the selection addendum and regenerated with repository functions.
Migration records preserve old/new hashes; wire schemas and API 0.1.0 are unchanged.

## Frozen live matrix

Run 2026-09-23T22-02-49-878Z is active. All four live profile smokes passed with
complete usage and the expected tool; binary smokes recorded exactly 22 requests
and peak concurrency 22. Root Go/SDK gates, Rust release tests/Clippy/audit/deny,
Woku typecheck, baseline conformance and the publication package make check passed
before measurement. The existing provider loaded SDK tarball
`toolgate-sdk-8809435a98f46c40.tgz`. No heavy checks or builds during the live run.

The original two-core supervisor was stopped after ownership/PID verification.
A dedicated four-profile supervisor now owns the test listeners. Provider MCP
remains on 8081 with its normal OAuth and local handlers. After the matrix, restore
direct/choice routing; the normal two-core supervisor can be restored without
changing binaries or captured results. Do not rerun completed cases or tune prompts.

The private laboratory capture is under `.local/binary-experiment/` outside this
publication folder. Progress checks contain only counts and case labels. Final
work remains: review, sanitize, report, latest-source verification, archive and
handoff. Historical English observations remain unchanged.

## Closure

The matrix finished with 150 answers and 1,426 measured Jev requests. Public/private
analyses match, frozen hashes and all selector profiles were verified, and all
closing gates passed. The normal two-core Choice laboratory and direct provider
mode were restored. Results, limitations and failures are documented in README
and ../verification/BINARY_PARALLEL.md; the current handoff is BINARY-HANDOFF.md.
The earlier active-run paragraphs are the chronological record, not current state.
