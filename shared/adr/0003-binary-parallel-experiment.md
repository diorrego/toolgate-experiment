# ADR 0003: optional parallel binary selection experiment

Status: accepted for the user-authorized English laboratory experiment, 2026-09-23.
Owner: Codex, coordinating Go, Rust, SDK telemetry and publication package.

The default `choice` profile preserves lexical-v1 plus one multi-option Jev Choice.
The opt-in `binary-parallel-v1` profile submits one independent Choice per authorized
candidate, containing only that tool and `none`. It is configured at startup, never
from model arguments. All 22 tools in the measured catalog are evaluated; none is
silently removed to improve times. For larger retrieved sets the worker limit is
22 and the already bounded retrieval maximum is 64. No second expansion/retry.

Each binary response uses the existing strict closed-distribution validator. A
positive is a returned tool choice, with its tool probability as its suitability
score. Scores from separate calls are not assumed calibrated or normalized across
tools. Sort positives by score descending and tool ID ascending. Accept the top
tool only with existing effect threshold (0.70 read, 0.85 otherwise), existing
margin (0.15/0.25) against the next positive, and its own negative probability.
Otherwise return 2 to 5 positive candidates as needs_choice; one insufficient
positive or all negatives abstains. The SDK's existing resolve path fixes a
candidate without another inference. Any invalid, missing or timed-out response
fails the entire preparation; no partial-result winner is permitted.

Keep the 2200 ms selector budget, 3000 ms core budget and provider SDK deadline.
The batch is bounded to 22 concurrent outbound attempts per core process. All
futures/workers belong to the request and stop on cancellation. No SQL transaction
waits for inference. Preserve individual attempts/usage under cancellation. Report
batch wall time and concurrency separately; overlapping durations are not summed
into end-to-end latency. Missing usage is unknown, never zero.

The core API, operation states, idempotency, remote decision and durable local
dispatch do not change. Optional telemetry fields are additive. Both cores and
the single SDK require deterministic parity/integration checks before live runs.
Historical reports retain their hashes and captures. The new experiment has fresh
controls, artifacts and provenance. This opt-in P08 extension is not a new default
or a declaration of production readiness. Authentication, privacy and approval
invariants A01-A04 and the remaining P decisions are unchanged.

References: https://docs.typesafe.ai/primitives/choice and
https://docs.typesafe.ai/models (reviewed 2026-09-23).
