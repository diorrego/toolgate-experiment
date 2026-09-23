# Handoff: completed English experiment package

2026-09-23. Owner: Codex. No Git metadata or commit for this folder. Contract 0.1.0,
export manifest 34735acc922c2261570bed30a849007f3165c7752ab0312547f50ef011aed24f.
The measured original manifest is
160a06fdad7daad26705a239998c7f74a46eaeba3617a61f1db9d955db1736bd.

## Completed

The English package includes independent Go/Rust cores, one SDK, shared wire
contract, locks, migrations, tests, configurable host, BYO-provider adapter/guide,
corpus template, mini-paper README and sanitized observations. Woku server,
business responses, bound IDs and credentials are excluded. No license is declared.
No commits, upload, deployment or publication occurred.

Run 2026-09-23T15-41-24-430Z completed 150 final answers. Strict expected-query
matches: 30 direct, 28 Go, 30 Rust, 30 Go host-first, 29 Rust host-first. Manual
review confirms the remaining Rust host-first query is timestamp-equivalent.
Go Q06/Q28 failed at MCP argument validation; Q30 added reads in every condition
and decision-binding failures in ordinary Go/Rust. All remain in the results.
Costs are API-equivalent; two Go cases lack Jev telemetry. Direct mode is restored.

Median final-answer times: 19.40 s direct, 25.43 s Go, 26.00 s Rust, 19.96 s Go
host-first, 21.36 s Rust host-first. Host-first reduces paired medians by 4.70/4.04 s
relative to ordinary Go/Rust but remains slower than direct by 2.09/2.96 s in paired
medians. One pass cannot establish a general language ranking.

## Verification

[Exact commands, exits, failures and limits](../verification/VERIFICATION.md).
Independent source-copy `make check` passed. `make integration` passed after the
dedicated stopped test PostgreSQL container was restarted. It passed 29 HTTP/PG
and 11 SDK checks per core, with an actual tarball consumer. No heavy gates ran
during the measurement. Frozen runtime/host hashes and public/private numerical
parity were verified. The initial OAuth-interrupted capture remains separately
available as sanitized observations.

## Next action and limits

The requested package is complete. Review README and run `make report-check` for
offline numerical verification. `python3 tools/package-source.py` builds a source
archive excluding private/generated files; it does not publish it. Supply an
authenticated backend MCP and integrate the SDK for another live experiment.
Do not repeat a finished run or silently replace its failed cases. Future work in
README covers protocol adherence, broader reads, grading precision, more trials,
larger catalogs, write workflows and production operation. Those are separate tasks.

## Subsequent experiment completed

The latest handoff is [BINARY-HANDOFF.md](BINARY-HANDOFF.md). It covers the optional
parallel profile, fresh controls, final results and restored laboratory state.
The original English observations described above remain intact.
