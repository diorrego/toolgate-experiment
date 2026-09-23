# Verification record

Date: 2026-09-23. No Git repository or source commit exists for this folder.
Runtime/wire provenance is in [the source manifest](../docs/source-manifest.json).
The complete matrix is identified by run `2026-09-23T15-41-24-430Z`.

## Independent source build

A new directory outside the author's workspace received only publishable files.
It contained no provider source, node_modules, target, dist, binaries or private
runtime state. Commands below ran after the live measurement finished.
The audit tools were provided on PATH; the toolchain versions are in the README.

| Command | Working directory | Exit | Evidence |
|---|---|---:|---|
| `npm ci --ignore-scripts` | Independent copy, `sdk-typescript/` | 0 | [Install log](independent-npm-install.log) |
| `make check` | Independent copy root | 0 | [Check log](independent-check.log) |
| `make integration` | Independent copy root, first attempt | 2 | [Initial failure](independent-integration.log) |
| `docker start toolgate-repro-pg` | Repository root | 0 | [Command record](independent-copy.json) |
| `make integration` | Independent copy root, second attempt | 0 | [Passing integration](independent-integration-retry.log) |

The first integration attempt failed because the dedicated export PostgreSQL
container was stopped, with previous exit code 0. Its image was
postgres:17.11-alpine and port 55449. Restarting that same disposable container
resolved the failure. No migrations, seeds, credential replacements or destructive
cleanup were performed. TOOLGATE_LAB_STATE pointed to this test configuration;
the database was a prerequisite, not bundled private state or a business database.

`make check` covered contract lock/generation, repository checks, numerical result
recomputation, Go format/vet/unit/race/Staticcheck/govulncheck/build, Rust fmt/Clippy/
release tests/build/audit/deny, and SDK format/lint/types/20 tests/external tarball/
generation. It also passed 8 Python and 11 Node host/adapter/safety tests.
`make integration` installed an actual SDK tarball and passed 29 HTTP/PostgreSQL
checks plus 11 durable SDK checks against each core, including multiple processes,
restart/replay, actor isolation and current authorization. Jev was a synthetic HTTP
fixture for these deterministic suites. Zero-test bootstrap/doc targets are not
counted as additional behavior tests.

## Measurement and public data

From the external laboratory root (which contains this `toolgate/` folder), the
exact authorized invocation was:

```sh
node toolgate/tools/run-experiment.mjs --config=.local/english-experiment/config.json --allow-paid
```

That private config supplied the actual artifact, corpus and provider paths. It is
not included in this package. The command exited 0 with 150 records and restored
direct mode. The renewed direct smoke was separate from the matrix.

- [Final measurement checks](final-measurement.json): 150 final answers, 147 strict
  matches, one additional manually equivalent query, six MCP errors; frozen hashes
  unchanged and public/private numerical analyses equal.
- [Review notes](../results/review-notes.json): Q06/Q28 validation failures, date
  precision, Q24 array order, and extra Q30 reads. Raw captures were not edited.
- [Interrupted attempt](interrupted-attempt.json): the earlier English OAuth
  interruption remains separate and is not discarded.
- [Public-file review](public-review.json): known local credential values and
  bound identifiers absent; no private-key/JWT patterns. This is a scoped review,
  not a claim that a regex detects every possible secret.

`python3 tools/check-results.py` recomputed all numerical tables without access to
private answers. `python3 tools/check-repository.py` checked local links, required
files, excluded provider paths, author-specific paths and forbidden punctuation.
The source-only build precedes the final documentation/evidence additions; those
additions received these lightweight checks again. Runtime and test sources did
not change after the independent build.

## Failures and limits

The initial safety regression failed with exit 1 because run-safety.mjs did not
exist; it passed after implementation. An internal finalization helper initially
failed to resolve the private corpus path relative to its config; correcting the
path allowed all recorded hashes to be verified without altering captures.

No production, deployment, npm publication, live-provider writes, full CT corpus,
high-load/fuzz campaign or additional host compatibility suite was executed. This
does not certify the full SDD or production readiness. The copied legacy logs in
this directory are earlier evidence; the independent-copy logs above are the
closing checks for this package.
