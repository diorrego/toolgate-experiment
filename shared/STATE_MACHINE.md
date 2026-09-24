# Operation and local execution state

Preparation produces no_match, needs_choice, needs_arguments or ready. Internal
selection is not a public operation state. Resolution fixes one original candidate.
A valid execution decision transitions ready/needs_arguments to decision_issued.
Preparing, resolving and issuing decisions never execute business handlers.

Initial revision is 1. Accepted resolve/cancel/decision requests increment revision
once, including decision validation that still returns needs_arguments. Replays,
inspection, receipts and rejected guard checks do not increment it. Local SDK
validation does not mutate remote revision. ready/needs_arguments/needs_choice may
be cancelled. no_match is terminal; an issued operation cannot be cancelled as if
its effect had been rolled back. Expiry is checked before state transitions, after
ownership checks.

The durable provider ledger is scoped by integration, principal, workspace and
execution key. It records prepared, claimed, dispatching, succeeded,
failed_before_dispatch, failed_after_dispatch or unknown. Claim uses transactional
compare-and-set/fencing. Persist dispatching before entering a handler. Only a
local ledger may retain the business result for authorized replay.

After a possible effect, timeout, process death, invalid result or a lost response
can mean unknown. Do not retry the handler automatically or create a replacement
operation to conceal uncertainty. Distributed exactly-once execution is not
promised. Cancellation of a wait does not prove cancellation of the effect.

ready means structurally valid, not approved. Decision-issued means bound for a
possible dispatch, not executed. Local authorization and any required approval must
remain valid for the exact identity, tool, arguments, effect and expiry. A model
argument cannot grant approval. Read execution must reject write/unknown effects.
The SDK supports text MCP results. Mutation registration is an explicit trusted
opt-in. executeWrite requires a provider approval callback, with checks before
dispatch and replay; executeRead rejects every non-read effect.


## V3 experimental workflow preparation

See [ADR 0005](adr/0005-v3-workflow-preparation.md) for the explicitly authorized
additive `/v1/workflows` API. It returns up to eight independent single-tool
operations. The agent orders their execution; all existing per-operation identity,
validation, decision, approval and durable dispatch rules still apply.
Legacy single-tool preparation and historical experiments retain their semantics.
