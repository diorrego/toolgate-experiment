# Parallel binary suitability experiment

The user-requested alternative asks Jev separately whether each authorized tool
can satisfy the question. With the measured catalog this is exactly 22 independent
API requests launched concurrently. Each request contains one tool and `none`,
using the same English Choice instructions, metadata and pinned Jev version as the
single-request control. This deliberately tests separate HTTP requests rather than
TypeSafe's recommended multi-question batching.

All selection stays in the remote core. The TypeScript SDK does not run Jev.
Workers/futures are bounded; the process permits at most 22 concurrent Jev calls.
All results must arrive and validate before automatic selection. There are no
transport retries, first-response wins or partial-result fallbacks. A failure or
2200 ms batch timeout fails preparation. Tokens from completed attempts and counts
from cancelled attempts remain visible; missing usage is not zero.

A positive is the tool winning its own two-option Choice. Sort positive scores
without renormalizing them across tools. The existing effect threshold and margin
must beat the next positive and the leading tool's own negative probability.
Otherwise return up to five positives for explicit resolution, or abstain when
there are fewer than two insufficient candidates. Resolving and issuing a remote
execution decision do not repeat the 22 calls. Provider authentication, authorization,
operation bindings and the durable local handler ledger are preserved.

Independent binary scores are not calibrated global probabilities. Multiple tools
may fit part of the question, so ambiguity and false positives are measured outcomes.
A faster individual request need not make the complete batch or answer faster.
The old `jevMs` is a sum of overlapping request durations; `selectorMs` measures
batch wall time. Neither is added again to the final-answer timer.

## Run the five-condition comparison

First follow REPRODUCTION.md to build and test, initialize a disposable database,
create TLS material, install the SDK in your provider, and authenticate its MCP.
The provider still needs only the three deployment modes direct/go/rust. The local
TLS proxy selects which fixed-profile core receives a new question's requests.

1. Keep the normal core supervisor stopped before binding the same test ports.
   Do not stop unrelated services or switch routing during an active operation.
2. Copy examples/parallel-core-lab.example.json to a private `*.local.json` file
   and set the state, credential-file, TLS, artifact and output paths. Initialize
   its trusted selectorModeFile to `{"mode":"choice"}`.
3. Start `node tools/parallel-core-lab.mjs --config=YOUR_PRIVATE_LAB_CONFIG --live`.
   It owns four cores: choice Go/Rust on 9081/9082 and binary Go/Rust on 9083/9084.
   Verified TLS remains on 9441/9442. Same-language replicas share the experiment's
   database; operations remain scoped and no cross-language failover is used.
4. Copy examples/binary-experiment.example.json to a private config. Bind your
   English corpus, MCP authentication, provider mode switch, trace stream and the
   SDK artifacts actually loaded by your provider. The selectorModeFile must be
   the same trusted file used by the supervisor.
5. Run deterministic checks before live calls:

   ```sh
   make check
   make integration
   ```

   Integration includes the baseline and the 22-request binary HTTP/PostgreSQL
   suites for both cores. It uses a synthetic selector and no paid model calls.

6. With explicit authorization for paid calls, smoke both binary modes and then run:

   ```sh
   node tools/agent-benchmark.mjs go-binary-first --case=Q01 --config=YOUR_PRIVATE_CONFIG --allow-paid
   node tools/agent-benchmark.mjs rust-binary-first --case=Q01 --config=YOUR_PRIVATE_CONFIG --allow-paid
   node tools/run-experiment.mjs --config=YOUR_PRIVATE_CONFIG --allow-paid
   ```

The matrix is direct, Go/Rust single Choice with host preparation, and Go/Rust
parallel binary calls with host preparation. Thirty questions per condition, fresh
agent contexts, rotated serial order and unchanged English prompts. Expected initial
selector traffic is 60 single-choice calls plus 1320 binary calls. Smokes and extra
preparations are separate and counted. Core response telemetry verifies the actual
profile for measured selections; mismatch stops the experiment. The driver restores
both direct provider mode and choice routing when done.

The four resident core processes share the desktop and configured CPU affinity.
Only one question executes at a time; additional idle processes and shared database
pools are recorded limitations. No builds run during measurement. A comparison to
an earlier run is historical context, not a substitute for these fresh controls.
