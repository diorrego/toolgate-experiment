# API contract 0.1.0

The authoritative wire format is openapi.yaml and its generated JSON Schema.
HTTPS JSON is the SDK-to-core transport. Runtime requests carry a separate service
Bearer credential and X-Toolgate-Contract: 0.1. Mutating POST requests require an
Idempotency-Key. Request IDs are correlations, not idempotency keys or permissions.
Reject duplicate keys, unknown DTO fields, unsafe numbers, excessive depth/bytes
and remote schema references. Arguments are complete replacements, never patches.

## Catalogs

PUT /v1/catalogs/{catalog_id}/versions/{version} requires catalog:write. Version
is SHA-256 of RFC 8785 canonical metadata, with tools ordered by tool_id. The same
version/content is idempotent; content cannot be changed in place. A hash mismatch
is HASH_MISMATCH. Catalog reads and all lookups are integration-scoped.

## Prepare and resolve

POST /v1/operations authenticates and validates, filters the allowed tool list,
retrieves candidates, calls Jev within its budget, validates known arguments and
persists a revision-1 operation. Empty known_arguments is valid. Missing locale
uses the existing API default es, and context_summary defaults to an empty string;
these defaults never insert tool arguments. An empty allowlist returns no_match
without Jev. Unknown allowed IDs are rejected without revealing other catalogs.

Resolve accepts only needs_choice and a candidate fixed by the original operation.
It checks actor, catalog, authorization revision and expected operation revision,
replaces arguments, and increments revision once. It does not invoke Jev. A selected
tool in ready/needs_arguments cannot be replaced using resolve.

## Execution decisions

POST .../{operation_id}/execution-decisions accepts ready/needs_arguments. It checks
identity, authorization revision, ownership, expiry and expected revision. Invalid
arguments return needs_arguments and issues, with one revision increment and no
decision. Valid input atomically issues a decision and increments revision. Bind
selected tool, catalog, schema and complete arguments through digests and ownership.
The execution key is stable per operation, but is not a bearer capability.

Decision validity is at most 60 seconds and never exceeds operation expiry. Do not
issue with less than one second remaining. The SDK must revalidate authorization,
approval where required, bindings and local ownership before dispatch or replay.
The core never invokes a handler or holds business API credentials.

An idempotent replay returns the existing result without increasing revision. An
already issued operation with a new idempotency key and the same actor/digests can
return its existing decision even with the original pre-issuance revision, after
expiry and authorization checks. Different arguments return OPERATION_ALREADY_ISSUED.
Never renew decision validity or execute a second time because the response was lost.

## Inspect, cancel and receipts

Inspect is read-only and revalidates ownership/context. Cancel is allowed only
before dispatch for ready, needs_arguments or needs_choice, increments revision,
and never claims business rollback. Issued operations return CANNOT_CANCEL_ISSUED.
Receipts are optional metadata, not business results, and are outside the critical
path. Contradictory terminal receipts return RECEIPT_CONFLICT. Receipts can be
accepted for 24 hours after a real decision, with fresh credential and ownership
checks; this never authorizes a new execution.

## Isolation, idempotency and failures

Every operation is bound to tenant/project/integration/principal/workspace/catalog
and catalog version. Credential binding supplies the first three values. The
provider supplies actor context. Authorization-revision changes require a fresh
preparation; removal of a selected tool blocks dispatch. Ownership mismatches are
hidden as OPERATION_NOT_FOUND. Replays must not bypass revocation checks.

Reserve method/path/key in the full authenticated scope using a request HMAC,
lease and fencing token. Do not persist clear-text original arguments/intents in
idempotency storage. Concurrent duplicate work returns REQUEST_IN_PROGRESS rather
than starting another inference. Only the valid fence can publish completion.
A timeout does not prove that a decision or business effect did not happen.

The exact HTTP/error enumeration is in OpenAPI. Authentication and malformed input
errors are not cached. Retryable failures retain stable request keys and bounded
budgets. Unexpected INTERNAL_ERROR is not automatically retryable. Validation
issues contain paths/codes, never argument values or stack traces.
