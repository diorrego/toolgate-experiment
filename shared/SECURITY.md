# Security boundaries

Authenticate service credentials before domain access. Derive tenant/project/
integration from credentials and actor/workspace/allowlist from the provider's
existing authentication. Never accept these as model overrides. Filter authorized
candidates before Jev. Independently check resource access and approval locally
before dispatch and replay. An operation identifier is not a bearer capability.

Keep provider OAuth, database credentials, service keys and handler implementations
out of Jev/model payloads. Separate catalog administration from runtime scopes.
Store HMAC-SHA256 credential verifiers with an external pepper and compare safely.
Provision random 256-bit secrets, support revocation, and never log credentials.

Treat intentions, descriptions and selector responses as untrusted. Validate
closed choices and bounded JSON at runtime. Forbid injected URLs, remote schema
references, redirect-based credential forwarding and arbitrary handler dispatch.
Unknown effects use the write path. The SDK requires explicit mutation registration and a provider approval callback
for that path; absent approval fails closed.

Preserve tenant-scoped caches, operations, idempotency and ledger keys. PostgreSQL
runtime roles must have neither superuser nor BYPASSRLS. Use transaction-local scope
on pooled connections. Test with actual restricted roles and multiple identities.
No transaction or global lock may wait on Jev or a business handler.

Only minimized intent/context and authorized metadata may reach Jev. The integration
must explicitly enable external processing. Regex redaction is not a guarantee of
anonymization. Core logs and receipts contain allowlisted metadata, not arguments,
results, raw selector responses or user identifiers as high-cardinality labels.
Private benchmark captures require deliberate consent, restricted permissions and
exclusion from Git. Public measurements use numeric fields and opaque case labels.

Use verified TLS outside explicit loopback test fixtures. Do not disable auth,
approval, limits or TLS to improve a benchmark. Bound concurrency, payloads, timeouts
and retries. Uncertain business effects are not automatically retried. Backups,
retention, SBOM, broader adversarial tests and independent security review remain
release responsibilities; a successful laboratory run does not certify production.


## V3 experimental workflow preparation

See [ADR 0005](adr/0005-v3-workflow-preparation.md) for the explicitly authorized
additive `/v1/workflows` API. It returns up to eight independent single-tool
operations. The agent orders their execution; all existing per-operation identity,
validation, decision, approval and durable dispatch rules still apply.
Legacy single-tool preparation and historical experiments retain their semantics.
