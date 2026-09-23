# Handoff: parallel binary experiment complete

2026-09-23. Owner: Codex. No Git commit, publication, deployment or declared license.
API 0.1.0. Original manifest: 15e027fb04911d5e3fdce091e273074bdf167ca9f9a2176a959f9307d30e2185.
Publication manifest: 3738ee131340ac2e23f2823efc79f47dbe19e7ec17fd763042fd23e17860b2d2.
Wire schemas and migrations are unchanged; ADR 0003 documents the optional profile.

## Implemented and verified

Both cores support `TOOLGATE_SELECTOR_MODE=binary-parallel-v1`; the default remains
Choice. One validated Choice request per authorized tool, bounded concurrency 22,
request-owned cancellation, no partial-result winner or Jev transport retry.
The single SDK captures selector wall time, overlapping request time, concurrency,
profile and usage. The host switches trusted deployment routing between completed
questions. No selection moved into the SDK or provider, and handlers remain local.

Run 2026-09-23T22-02-49-878Z: 150 final answers, 147 strict matches plus one reviewed
date-equivalent query. Each binary condition has 24 correct automatic selections,
five correctly resolved ambiguities and one abstention. Q30 adds broader reads and
two decision-binding errors. All 1,426 Jev requests have usage captured.

Parallel binary selection did not improve observed latency: paired final-answer
medians are +0.27 s Go and +0.46 s Rust versus single Choice; selector medians are
about 0.90 s versus 0.80-0.82 s. Jev request count is 22x and input/cost about 3.65x.
Total agent cost varies with cache and is not a language or algorithm price claim.

[README results](../README.md), [numerical report](../results/binary/report.md),
[observations](../results/binary-observations.json), and
[verification](../verification/BINARY_PARALLEL.md) contain exact methods and limits.
Historical observations remain intact and both matrices recompute offline.

## Current laboratory state

The experimental four-core supervisor is stopped. Normal Go/Rust Choice cores and
the existing provider are running; provider mode is direct. The updated SDK is an
actual installed tarball. Private answers remain outside the publication tree.
Do not resume the completed matrix or replace failed cases.

## Next action

The requested experiment and English publication package are complete. Review the
paper and source archive before any separate publishing action. A batched
multi-question request would be a new experiment, not a result established here.
Further calibration, larger catalogs, repeated trials and production features
remain separate work. Neither this experiment nor the passing gates closes the
entire production backlog.
