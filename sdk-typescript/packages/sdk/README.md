# Toolgate TypeScript SDK

One SDK connects a provider backend to either remote core over verified HTTPS.
Selection stays remote. Registered business handlers execute locally after remote
validation, current provider authorization and a durable ledger claim.

This experimental version supports MCP text results. Registration defaults to
read-only; V2 can explicitly enable mutations with `allowMutations: true` and
`executeWrite`. Every mutation also requires a provider-owned `approve` callback
for the exact actor, tool and arguments before dispatch and replay. Missing
approval is denied. This package is private and has not been published
to npm. Run `node tools/pack-sdk.mjs` from the repository root to create and verify
an actual package tarball. Integrate that tarball into your own backend using its
public exports: RemoteClient, ToolRegistry, ToolgateProvider and PostgresStore.

See the repository's docs/PROVIDER_INTEGRATION.md for authenticated MCP integration,
metadata publication, operation handling and telemetry. Do not expose service
credentials to browsers or agents. Preserve complete arguments, revision and actor
bindings; never retry a handler whose effect is uncertain.
