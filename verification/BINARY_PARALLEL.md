# Binary-parallel verification and evidence

Date: 2026-09-23. Run: `2026-09-23T22-02-49-878Z`. No source commit exists for this
folder. [Current source provenance](../docs/EXPORT_PROVENANCE.md) identifies the
initial snapshot, current runtime files and explicit contract-manifest migration.

## Commands and outcomes

The original implementations and this publication folder were both checked. All
commands below finished with exit 0. No builds or heavy suites ran during the live
matrix. Paths in the copied logs are sanitized; source and numerical data are not.

| Command | Directory | Evidence |
|---|---|---|
| `make check` | Original `backend-go/` | [Go gates](binary/go-check.log) |
| `cargo fmt --all -- --check` | Original `backend-rust/` | Ran before the release gates |
| `cargo clippy --release --workspace --all-targets --all-features --locked -- -D warnings` | Original `backend-rust/` | [Clippy](binary/rust-clippy.log) |
| `cargo test --release --workspace --all-features --locked` | Original `backend-rust/` | [Rust tests](binary/rust-tests.log) |
| `cargo build --release --locked` | Original `backend-rust/` | [Build](binary/rust-build.log) |
| `cargo-audit audit` and `cargo-deny check` | Original `backend-rust/`, pinned audit binaries | [Audit](binary/rust-audit.log), [policy](binary/rust-deny.log) |
| `npm run check` | Original `sdk-typescript/` | [SDK gates](binary/sdk-check.log) |
| `./node_modules/.bin/tsc --noEmit` | External development provider | [Typecheck](binary/woku-types.log) |
| `make check` | Publication folder root, pinned audit tools on PATH | [Export gates](binary/export-check.log) |
| `make unit report-check` | Publication folder root, after the matrix | [Final analysis/host checks](binary/final-analysis-host.log) |
| `make integration` | Publication folder root, after the matrix | [Both profiles and cores](binary/export-integration.log) |

The SDK suite has 20 tests plus type/generation checks and a real tarball consumer.
The final analysis suite has 10 Python tests; the host/adapter suite has 11 Node
tests. Publication integration installs the tarball outside the npm workspace and
passes 29 baseline HTTP/PostgreSQL checks, 11 durable SDK checks, and 19 binary
HTTP/PostgreSQL checks per core. The disposable export database uses scoped runtime
roles and port 55449. No business database or paid Jev calls are used by these gates.

The binary HTTP fixture uses a 22-request barrier. It verifies one authorized tool
per request, real simultaneous arrivals, complete usage, ambiguity/abstention,
idempotent replay, resolution/decisions without new inference, invalid-response
rejection and timeout accounting. Go also runs explicit cancellation tests under
the race detector. Rust's request-owned futures retain metrics on cancellation;
there is no detached task per candidate.

## Live run and review

The exact invocation from the external laboratory root was:

```sh
node toolgate/tools/run-experiment.mjs --config=.local/binary-experiment/config.json --allow-paid
```

It exited 0 with 150 final answers, 147 strict matching queries, one additional
manually equivalent date query, two abstentions, and two MCP errors in additional
reads. All 1,426 Jev attempts and all 150 case costs have complete reported usage.
The four [live profile smokes](binary-live-smokes.json) are separate from the matrix.

[Final measurement verification](binary-final-measurement.json) confirms frozen
artifact/configuration hashes, all 120 SDK cases' actual selector profiles, raw
capture integrity and identical numerical analyses from private/public inputs.
[Review notes](../results/binary-review-notes.json) preserve the date discrepancy,
Q09 abstentions, Q24 array order, Q30 additional reads and the PostgreSQL idle-pool
configuration difference. No grader threshold, prompt or runtime setting changed
during measurement. Independent binary probabilities were not renormalized.

[Restoration checks](binary-restoration.json) confirm that the four-profile
supervisor stopped, the normal two-core laboratory returned, and authenticated
capabilities over verified TLS report Choice. The provider mode is direct.

## Failures during development and limits

Tests failed before implementation for Go/Rust binary selection, SDK telemetry and
host configuration. Rust initially hit a Send-bound error; explicit boxed,
request-owned futures resolved it. Two helper commands used an incorrect working
directory. One npx formatter resolved an unpinned version but matched no files;
the pinned workspace formatter was subsequently used. These failures did not
change target source files, manifests or observations. They are recorded rather
than presented as passing attempts.

No production deployment, publication, provider writes, new migrations, complete CT
suite, high-load campaign or other-agent compatibility certification was performed.
This single pass is descriptive. The two pool implementations have different idle
policies; language-ranking claims are unwarranted. Raw individual binary scores
are not published or retained by this instrumentation, so no_match does not reveal
whether every vote was negative or one positive failed the acceptance rule.
