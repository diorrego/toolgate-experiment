# ADR 0005: bounded multi-tool preparation

Accepted for the operator-authorized V3 experiment, 2026-09-24. Owner: Codex.

The user explicitly extends selection from one tool to a workflow tool set. Add
POST /v1/workflows, returning zero to eight independent ordinary OperationViews.
This is selection, not a business workflow engine. The agent reads each schema,
discovers IDs using authorized handlers, and schedules each invocation. Preparing
never executes a handler or fills business arguments. Existing execution decisions,
identity binding, expiry, revision, authorization, approvals and ledgers apply to
each child. An operation still selects one tool and one immutable execution.

All children and the idempotent preparation response commit in one transaction
AFTER inference. No partial bundle on selector failure, no SQL held across Jev.
The request's authenticated allowed list filters retrieval before any inference.
Responses have a 262144-byte limit; at most eight schemas are disclosed. Reusing a
tool with different arguments requires a fresh preparation; uncertain effects must
never be retried through a replacement. Empty selection explicitly abstains;
over eight positives explicitly asks for a narrower workflow.

Both profiles use lexical-v1 top-64 retrieval, matching minimized metadata and
the same yes/no Choice inclusion question. Joint mode sends all named questions
in one request; binary mode sends one request per candidate, at most 22 concurrent.
Include prerequisites for identity lookup as well as final requested actions.
Read inclusion threshold is .70; other effects .85. No cross-tool margin is used:
several tools can be required together. Validate complete distributions, answer
key coverage and exact model; an invalid answer invalidates the entire bundle.
Existing 2200ms selector and 3000ms core budgets remain. Record this algorithm as
workflow-joint-v1/workflow-binary-v1 in experiment metadata; the underlying legacy
deployment profile remains choice/binary-parallel-v1. Legacy API behavior is fixed.

No automatic execution DAG is inferred by Toolgate. Dependency correctness and
final business outcome are distinct from tool-set selection quality. The corpus
and execution oracle remain private from the evaluated model; only the user
question and genuine MCP outputs enter its context. Host-first gets the verbatim
question, while agent-first may reformulate. Further agent-requested preparation
is allowed equally and is reported as recovery, never removed from latency/cost.

This additive experimental API retains wire 0.1 compatibility for old callers.
New callers must use the updated three consumers together. Update the semantic
manifest and generated schemas with an explicit migration record. No SQL migration
or default single-tool algorithm change is required.

API references checked: https://docs.typesafe.ai/api and
https://developers.openai.com/api/docs/guides/function-calling .
