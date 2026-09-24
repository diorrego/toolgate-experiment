# V3 verification

Completed locally on 2026-09-24. The operator explicitly requested a local commit
only. No push, repository metadata update, deployment or package publication is
part of this delivery.

## Contract and implementation

Base commit: b3b42c3a09a0f03de965aa7ff2932f2e17f959b7. Contract wire version 0.1.0;
additive workflow API semantic manifest:
`ecb438ea4b0f3ac8294be2187a90adb963fbd6e74828f7173c1f0e47e15cc8f2`.
The migration, ADR 0005 and generated consumers are included. Legacy APIs and SQL
migrations are unchanged. Both cores implement the new workflow endpoint; only
Go is measured. The SDK remains the sole provider integration, with no selector.

The checks below ran with exit 0. Machine-specific private paths are represented
by the documented lab environment variables. Exact log hashes are in checks.json.

| Directory | Command | Evidence |
|---|---|---|
| backend-go | `make check` | format, vet, tests, race, staticcheck, vulnerability audit, build, contract |
| backend-rust | `make check` | format, release Clippy/tests/build, audit, deny, contract; local audit tools on PATH |
| sdk-typescript | `npm run check` | format, lint, types, tests, generated-code checks, external tarball consumer |
| repository | `node tools/pack-sdk.mjs` | actual installed SDK used by provider and integration tests |
| repository | `python3 tools/workflow-conformance.py` | 18 HTTP/PG checks and nine SDK checks for each of Go/Rust x joint/parallel |
| repository | `python3 tools/core-conformance.py go --sdk` | 29 legacy checks plus durable mutation checks |
| repository | `python3 tools/core-conformance.py rust --sdk` | same legacy and durable mutation checks |
| repository | `node --test tools/tests/v3.test.mjs` | five corpus, dependency, concurrency and state regressions |

Workflow conformance covers atomic/idempotent bundles, duplicate requests,
authorization filtering before inference, child ownership and decisions, no
inference during execution, no partial selection on malformed output, explicit
overflow/abstention, deadline/HTTP-error parity, per-effect guards, approval before
dispatch/replay and no repeated uncertain effect. SDK unit tests reject duplicate
tools, wrong catalogs, changed effects and altered schemas before any snapshot is
stored. Native oracles passed all 75 real handler calls and all 30 dependency/state
checks, including 15 requested mutations.

## Measured run and audit

The definitive capture has 120 unique cells, 120 final answers and unchanged
fingerprints throughout the matrix. Both running Go executables matched the
fingerprinted binary. All 4,352 compiled native-provider files matched the V2
manifest. Main-run consumption is fully reported: 549 OpenAI calls and 3,298 Jev
calls, with estimated API cost $0.270314074. No failed cell was replaced.

All 60 mutation states matched, with no non-reference mutation invocation. The
frozen reference grade is 30/30, 29/30, 30/30, 30/30. A valid alternative discovery
path explains the one reference miss. The separate name-completeness review is
30/30, 29/30, 30/30, 29/30. It is explicitly post-run and not blinded; see the
review notes for the two ID-only answers and the synthetic fixture limitations.

The exporter regrades private traces/state and checks recorded usage against the
frozen corpus. `python3 tools/v3/audit.py` independently checks decimal pricing,
cache partitions, medians and cell/call totals. `make report-check` recomputes V1,
the V1 binary follow-up, V2 and V3. Four README diagrams were browser-rendered with
Mermaid 11.12.0 and visually inspected; this temporary validation dependency is
not a product dependency.

## Excluded development

Two eight-case smokes are separate. A 31-cell candidate run stopped at a completed
cell boundary to correct folder-join equivalence and timeout/error classification.
All 30 question texts are unchanged. Its original scores and consumption remain
in development-observations.json. Its usage is incomplete, so total cost is
unknown; excluded-runs.json distinguishes the known lower bound from a total.
There are no spliced or silently replaced cells.

Additional setup failures were resolved before the final pass: an absent decoder
in the initial regression, wrong command cwd, an undersized mock accept backlog,
wrong fixture field names, phone storage normalization, a double-canonicalized
SDK digest, and test lint failures. No production endpoint or data was used.

## Shutdown and local delivery

The owned provider, Go profiles, TLS supervisor, Redis and test database containers
are stopped. Ports 8182, 6390, 19091, 19093, 19441, 19443, 55459 and 27029 were
verified free. Database volumes and private captures were retained. Unrelated
services were not stopped. Credential/private-path scans and final Git checks
are recorded with the local commit handoff.
