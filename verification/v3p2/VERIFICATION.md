# V3 part 2 verification

The requested 750 executions completed, with 150 per condition and exactly five
repetitions for every scenario/condition pair. Base commit: 8c9ad7e. Delivery is a
local commit only; no push or external repository metadata update is authorized.

## Implementation gates

All listed commands passed with exit 0. Private log hashes are in checks.json.

| Directory | Command | Coverage |
|---|---|---|
| backend-go | `make check` | formatting, vet, tests, race, staticcheck, audit, production build, contract |
| backend-rust | `make check` | formatting, release Clippy/tests/build, audit/deny and contract |
| sdk-typescript | `npm run check` | formatting, lint, types, tests, generated sources and external package consumer |
| repository | `node tools/pack-sdk.mjs` | actual tarball installed in the provider's test consumer |
| repository | `python3 tools/exposure-conformance.py` | real HTTP/PostgreSQL checks on Go and Rust; lab environment configured |
| repository | `make unit report-check` | existing tests, part-2 tests and historical/current report recomputation |
| repository | `python3 tools/v3p2/audit.py` | independent decimal pricing, cell counts, five-repetition success and paired medians |

Exposure conformance verifies caps 1/3/5/8, unchanged inclusion requests, unchanged
full positive sets, alphabetical truncation, no padding, invalid-cap rejection,
complete versus unobserved diagnostic stages, and legacy omission behavior. It
also covers ownership, idempotency, atomic bundles, remote decisions, effect guards,
approval/replay and uncertain-execution handling. The SDK retains no local selector.

Wire version is 0.1.0. The optional trusted request field and trace are documented
by ADR 0006 and semantic manifest
27ce350b50f7082ea8d2720ee79b99a7cca881d060c8094423a37a085b95e080.
No SQL migration, inclusion threshold, prompt or provider business handler changed.

## Freeze and live evidence

All 76 native oracle calls passed before part-2 model calls. The historical V3
regression accepts the valid report-first route and rejects both ID-only member
answers, without modifying V3 observations. The 15-cell smoke completed with 13
goals satisfied; its two missing-name failures remain excluded from the main matrix.
Every cap was respected and no diagnostic data entered model results.

The definitive matrix ran from 2026-09-24T21:08:41.196Z through
2026-09-25T00:18:01.137Z. All measured fingerprints stayed unchanged. Each cell is
an immutable private file; the public export checks its hash and recomputes the
online grade before retaining both original and final verdicts. No failed cell was
replaced, no controls came from historical runs, and no new parallelism was used.

There were 3,838 agent calls and 1,534 Jev attempts. All 375 mutation states matched,
with no improper mutation invocation. There were 749 final answers; one Joint-1
read scenario exhausted the 20-turn budget. Independent checks verify all 750
pair identities and the five condition positions per scenario.

Two Jev attempts have missing consumption: Joint-8 V3-04/repetition 2 (504), and
Joint-5 V3-27/repetition 5 (503). They remain counted. Therefore exact total
estimated costs for those conditions are unknown. The whole matrix's known
reported cost is a lower bound of $1.774735323, not an invoice or a complete total.

## Outcome-verifier audit

The user-goal requirements were fixed before measurement. Implementation defects
in phrase/path recognition caused false negatives: equivalent empty-history text,
the verb raised, phone display formatting, an unrequested draft-status word, and
an alternative endpoint explicitly proving totalEvents=0. The final evaluator
applies these same semantic requirements uniformly across conditions/repetitions,
with positive and negative regression tests. It does not modify model inputs,
responses, selection, execution, time, costs or stored state.

The 725 original online successes and all original grades are retained. Seventeen
recognition corrections yield 742 audited successes. The eight remaining failures
are preserved: unresolved member names, missing tracker names, wrong saved-report
lookup, and a turn-limit termination. See evaluator-clarification.json and
results/v3p2/review-notes.json. This is not blinded independent human adjudication.

## Scope and shutdown

V3 question texts, fixture, code under tools/v3 and historical results/verification
remain unchanged. Only part-2 report generation is added to the report checker.
SDK/core changes are additive and tested on both consumers; only Go is measured.
The provider source, credentials, seed and raw payloads remain outside Git.

The owned provider, single Go core, TLS supervisor, Redis and database containers
are stopped. Test data and captures remain intact. All experiment ports were
verified free; unrelated services were not stopped. Final local staging uses a
file allowlist, byte comparison and credential scan. No push is performed.


Operational-freeze deviation: the recognizer required corrections during/after
inspection of measured outputs. Final success counts are audited outcomes, not
wholly preregistered automatic scores. Both original and corrected verdicts remain
available; selection, execution, timing and consumption were not changed.
