> Historical V1 instructions follow. See [V2 accuracy](V2-ACCURACY.md) for single-tool evaluation and [V3 workflows](V3-WORKFLOWS.md) for the latest local multi-tool experiment.

# Reproduce the experiment

## What is and is not included

The independent Go and Rust cores, one TypeScript SDK, wire contract, migrations,
synthetic correctness tests, host harness, English workload template, price profile
and sanitized measurements are included. Supply your own backend with an
authenticated MCP, a compatible read-only catalog and authorized data. No Woku
server, Woku account, business dataset, OAuth token or model API key is included.
For a different backend, replace the corpus and expected tool/filter oracle.

Linux is required for the supplied process-affinity/resource scripts. The observed
host used x86_64. Install the versions listed in README and the manifests: Go 1.27.1,
Rust 1.94.0, Node 24.18.0, npm 11.16.0, Python 3.12, Docker, OpenSSL and GNU make. Codex
CLI 0.155.1 and authenticated model access are required only for live agent runs.

## 1. Install dependencies and run deterministic checks

From this repository root:

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r tools/requirements.txt
cd sdk-typescript
npm ci --ignore-scripts
cd ..
cargo install --locked --version 0.22.2 cargo-audit
cargo install --locked --version 0.20.2 cargo-deny
make check
```

Go/Rust dependencies are pinned by go.mod/go.sum and Cargo.lock. Rust's toolchain
is pinned by rust-toolchain.toml. Build Rust in release mode. The SDK check includes
format/lint/types/tests/generation and a real tarball consumer outside the workspace.
The audit tools must be on PATH. Check targets do not silently skip unavailable
tools or turn an unexecuted suite into a passing result.

For PostgreSQL and network conformance without paid Jev or a provider server:

```sh
python3 tools/lab-db.py init
make integration
```

Initialization creates only a dedicated `toolgate-repro-pg` container and fresh
Go/Rust/SDK test databases, with non-superuser runtime roles and row-level security.
The default host port is 55439. Set TOOLGATE_LAB_PORT/TOOLGATE_LAB_CONTAINER before
initialization to avoid a collision. Never reuse a production database. Existing
private state is retained without repeating migrations or seeds. Keep the container
running for integration checks. Stop it explicitly when finished; no cleanup command
drops unrelated databases or volumes. Core tests use a local synthetic HTTP selector,
not an in-memory shortcut or live Jev key. Durable SDK tests use the installed
public tarball, multiple processes and restart/replay checks.

If a previous test container is stopped, `lab-db.py init` retains its configuration
and does not restart it. Run `docker start toolgate-repro-pg` (or your configured
container name), wait for it to become healthy, and rerun `make integration`.
Do not recreate credentials, repeat migrations or delete the database to fix this.

## 2. Start the remote cores for a live experiment

```sh
cp .env.example .env
# Set TYPESAFE_AI_API_KEY locally. Never commit it or paste it into a command log.
node tools/init-tls.mjs
node tools/local-cores.mjs --live
```

This starts independent cores on 9081/9082 and local verified-TLS termination on
9441/9442. Both receive the same two-CPU affinity and time budgets. PostgreSQL pools
have a maximum of 16; Go configures 4 minimum idle connections, while Rust creates
connections on demand without a matching minimum. Treat this as an additional
cross-language comparison limitation, not an isolated language effect.
The laboratory connection budget is 1000 ms including DNS/TCP/TLS, Jev 2200 ms,
core 3000 ms and SDK 3500 ms. This is an explicit measured-profile override of the
300 ms proposed default in shared/limits.yaml, not a silent relaxation for one core.

The script owns and shuts down only its child processes. It writes PID files in
.local. Use Ctrl-C for graceful shutdown. It does not run schema migrations or
start a provider. The self-signed certificate lasts seven days. Trust it in the
provider process with NODE_EXTRA_CA_CERTS pointing to .local/tls/cert.pem; never
set NODE_TLS_REJECT_UNAUTHORIZED=0. Configure real HTTPS and secrets management for
non-loopback deployments.

## 3. Integrate and authenticate your provider

Follow PROVIDER_INTEGRATION.md. Install the SDK tarball in your own backend, keep
its MCP/OAuth endpoint, publish immutable metadata with an administrative key, and
register the direct or three-tool surface according to trusted deployment mode.
Configure SDK traces and an isolated durable provider ledger. Authentication and
resource authorization must remain real in all three provider modes.

Register/login your MCP server in your local Codex configuration using the normal
provider OAuth flow. Do not fabricate JWTs or extract tokens from a database. Set
up model access separately. Nothing in this repository grants those permissions.

## 4. Bind and inspect the English corpus

Copy data/woku-corpus.en.json for the measured domain, or author 30 equivalent cases
for your backend. Each case has id, question, expected tool and complete expected
arguments. Expected values are an offline grading oracle; the host sends only the
question and the model never receives this oracle. Argument defaults and ignored
fields must be documented provider semantics, not ways to excuse wrong filters.

Create a private JSON binding file using identifiers already known through normal
authorized discovery, for example `{"woku_id":"YOUR_AUTHORIZED_RECORD_ID"}`.
Then run:

```sh
node tools/bind-corpus.mjs data/woku-corpus.en.json .local/bindings.json .local/corpus.json
cp examples/experiment.example.json examples/experiment.local.json
```

Edit your private experiment config and keep it out of Git. All configured paths
resolve relative to that config file. Set MCP server name/URL, modeFile or trusted
modeCommand, trace path, PID files, actual artifact paths and environment metadata.
Add every unrelated configured MCP server to disableServers. For a packaged provider
SDK, artifact paths must identify the copy actually loaded by your backend, not just
a workspace build. Keep privateDir outside any published results folder.

## 5. Validate once, then freeze and run

```sh
node tools/agent-benchmark.mjs go-first --case=Q01 --config=examples/experiment.local.json --allow-paid
node tools/agent-benchmark.mjs rust-first --case=Q01 --config=examples/experiment.local.json --allow-paid
node tools/run-experiment.mjs --config=examples/experiment.local.json --allow-paid
```

These commands make real model/provider calls. A smoke is separate from the 150-case
matrix and must be accounted for separately. The matrix runs direct, Go, Rust,
Go-first and Rust-first in a cyclic order, 30 identical questions per condition,
with a fresh ephemeral context per case and fixed gpt-6-astra/high. It disables
shell, web, apps and additional agents in the subject process. Do not build, tune
prompts or run heavy suites during the measurement.

The timer starts before host preparation when present, or immediately before the
ordinary turn submission. It ends on the complete final answer. MCP initialization
precedes question submission. Per-stage timings are nested and must not be summed
again. The host collects tokens, cached input, Jev usage, errors and local resources.
Unknown usage stays unknown. There is no automatic retry of failed corpus cases.

The driver saves every record. To resume an interrupted run, supply the same config,
--allow-paid and `--resume=RUN_ID`. Artifact/config/corpus drift is rejected. Do not
resume a finished run or overwrite it with a changed corpus. The driver restores
direct provider mode after finishing or interruption. An MCP authentication
challenge or runner initialization failure stops the matrix after preserving the
failed record. Renew access through normal provider login before another run.
The direct catalog must exactly match the unique expected tool names in the corpus;
SDK modes must expose exactly prepare_action, execute_read_action and
execute_write_action. An empty surface is rejected before model inference.

## 6. Review, sanitize and recompute

```sh
python3 tools/report.py --input PATH_TO_PRIVATE_RUN --output-dir .local/report --private-html .local/answers.html
python3 tools/export-results.py --input PATH_TO_PRIVATE_RUN --public-corpus data/woku-corpus.en.json --output results/english-observations.json
python3 tools/report.py --input results/english-observations.json --output-dir results/english
```

The public export removes bound questions, arguments, answers, trace identifiers
and paths. Review it before publication. Numerical summaries can be recomputed;
independent correctness regrading requires private responses. Keep additional
human review notes in a deliberately sanitized JSON file bound to the runId and
pass it with `--review`. Do not normalize away differing array order or exclude
failed cases to make a comparison look better.

## 7. Prepare the source archive

```sh
python3 tools/package-source.py
```

The archive is written to `.local/toolgate-source.tar.gz`. It contains only the
checked source/public-results tree. Private state, local configs, dependencies,
build outputs and captures are excluded. Existing archives are never overwritten;
choose a new `--output` path for a later package. Review the public files before
uploading. Creating an archive does not publish it or declare a license.
## V3 workflow reproduction

The latest local experiment is [V3](V3-WORKFLOWS.md): 30 requirements in each of
four conditions, with native multi-tool workflows. Start with its protocol,
`examples/v3-experiment.example.json`, `tools/v3/run.mjs` and the V3 verification
directory. V1/V2 instructions below remain historical. V3 is committed locally
only; remote publication requires a new instruction from the operator.

Offline recomputation uses `make report-check`. Live repetition requires access
to the compatible native Woku handlers, which are not vendored in this repository.
The fixture and public provider adapter do not replace those handlers. A synthetic
protocol test alone cannot reproduce or certify native business accuracy.


## V3 part 2 exposure experiment

The latest local study is [V3 part 2](V3-PART2.md): 30 unchanged scenarios, five
conditions and five repetitions (750 fresh executions). Use
`examples/v3p2-experiment.example.json`, `tools/v3p2/run.mjs`, the single joint
`tools/v3p2/core-lab.mjs` supervisor and the matching provider adapter. Start with
the excluded smoke. The provider must support the existing V3 control interface.
All live conditions require the compatible native handlers; they are not bundled.

`make report-check` verifies every historical report and part 2. Use
`python3 tools/v3p2/audit.py` for the independent decimal and paired-results audit.
Read the evaluator-clarification record: the operational recognizer required
post-freeze corrections, and both original and audited scores are preserved.
Publication remains unauthorized: this version is a local commit only.
