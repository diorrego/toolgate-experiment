# Persistence

Both alternative cores use PostgreSQL with equivalent schemas and isolated test
databases. The provider's durable SDK store is separate and retains business results
locally. Core tables cover tenants, projects, integrations, service-key verifiers,
immutable catalogs, operations, scoped idempotency leases/fences, receipts and
quotas. See migrations/001_core.sql for executable columns, constraints and RLS.

Keys and foreign keys preserve tenant/project/integration scope. A globally unique
operation ID is not an access check. Timestamps are UTC. Do not persist clear-text
request bodies in idempotency records or business results in core receipts.
Credential lookup uses a narrow privileged function before authenticated scoping.

Preparation reserves idempotency/quota in a short transaction, performs inference
outside the transaction and finalizes with fencing. Decision issuance uses atomic
revision checks and persistence. Duplicate requests must compare ownership and
request HMAC, not interpret any uniqueness violation as success.

Use RLS in addition to explicit filters. Runtime roles are non-superuser and cannot
bypass RLS. Set scope with SET LOCAL or set_config(..., true) inside each transaction;
never leave identity on a pooled connection. Validate with the real runtime role.

Migrations are numbered and append-only, applied explicitly by an operator. HTTP
startup must not perform production DDL. Use disposable local databases in tests.
The benchmark uses PostgreSQL 17.11-alpine, core pools up to 16 with 4 idle, and a
separate SDK ledger. Tombstones/idempotency retention is 24 hours; expiration never
re-authorizes an effect. Batched purge, encrypted backups and recovery drills are
operational requirements, not capabilities proven by these small tests.
