# Architecture

```text
User -> agent/host -> provider MCP -> TypeScript SDK -> Go OR Rust core -> Jev
                                      |
                               authorized local handler
```

The provider authenticates its user and constructs actor, workspace, authorization
revision and allowed tool IDs. Its separate service credential identifies the
Toolgate tenant/project/integration. Never forward provider OAuth to the core or
Jev. Tool descriptions and intentions are untrusted data, not policy.

At explicit deployment bootstrap, publish immutable metadata with an administrative
credential. Runtime credentials can read the catalog and use operation endpoints.
Do not publish on each request or expose an administrative key to an agent.

Normal execution has two phases: prepare selects and persists an operation, then
an execution decision validates complete arguments and binds their digest before
provider-local dispatch. The SDK preserves a durable snapshot and execution ledger,
revalidates local authorization and only calls its explicitly registered handler.
Jev receives minimized intent/context and authorized metadata, never handlers,
business results, provider access tokens or implementations.

Go/Rust database and network calls propagate deadlines. Reserve idempotency in a
short transaction, release it before inference, and finalize with fencing. No lock
or transaction may span a Jev request or human approval. No automatic core failover
is allowed during an operation. Catalog/schema caches must preserve scope.

The experimental host-first path moves prepare before the first model turn. It
still traverses the provider MCP, SDK and remote core, and does not execute during
prepare. Ambiguous choices can be resolved by the agent without another inference.
Additional lookups to invent missing IDs are forbidden.

Go and Rust run behind verified TLS termination in the measured laboratory. Their
cores and durable provider ledger use separate PostgreSQL databases. Providers
must supply their own authenticated MCP and handlers; this repository has no Woku
server and does not grant access to Woku data.
