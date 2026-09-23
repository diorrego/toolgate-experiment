# Bring your own backend with MCP

No provider server is bundled. The observed experiments used an authorized Woku
development backend, which is deliberately excluded. A new operator needs a backend
with a real authenticated MCP endpoint, read-only tools, authorized data, and the
ability to register the Toolgate SDK inside that backend. Merely pointing a host
at an arbitrary MCP URL does not install this integration.

## 1. Preserve the provider boundary

Keep the existing MCP URL, OAuth middleware and business authorization. The
provider, not a model argument, resolves principal_ref, workspace_ref,
authorization_revision and allowed_tool_ids. Recheck current membership, tool and
resource permissions before dispatch and replay. Never forward provider OAuth to
Toolgate. Select a test tenant and read-only workload explicitly.

## 2. Install the actual SDK

Run `node tools/pack-sdk.mjs` at this repository's root. Install the resulting
`.local/artifacts/toolgate-sdk-0.1.0.tgz` in your backend with npm and commit its own
lockfile as appropriate. Use package exports, not imports from a sibling src tree.
See sdk-typescript/packages/sdk/README.md for the supported experimental scope.

Import `RemoteClient`, `ToolRegistry`, `ToolgateProvider`, and `PostgresStore` from
`@toolgate/sdk`. Build the registry explicitly from your existing metadata and local
handler functions. There is no introspection of private MCP SDK registry fields.
Input schemas must satisfy shared/JSON_SCHEMA_PROFILE.md. Do not silently strip
unsupported schema constraints to make an integration pass.

```js
const registry = new ToolRegistry(localReadTools);
const client = new RemoteClient(
  { baseUrl: coreHttpsUrl, apiKey: runtimeServiceKey, contractVersion: '0.1' },
  { onRequest: metric => appendSanitizedTrace({ kind: 'sdk_remote', ...metric }) }
);
const store = new PostgresStore(integrationId, providerLedgerConnectionString);
const provider = new ToolgateProvider({
  catalogId, registry, client, store,
  authorize: revalidateAuthenticatedResourceAccess
});
```

`localReadTools` contains `{metadata, handler}` entries. Tool metadata includes
name/tool_id/title/description/aliases/tags, effect `read`, open_world, input_schema
and schema_profile `tg-jsonschema-1`. The handler remains local and returns supported
MCP text content. The durable store migration is sdk-typescript/sql/001_ledger.sql.
Database credentials and callbacks are supplied by trusted backend configuration.
`runtimeServiceKey` is an asynchronous getter returning the service credential.
The authorization callback receives `(actor, toolId, arguments)` and returns a
Promise<boolean> after checking current policy.
The authorization callback must implement real policy, not return true as a stub.

At explicit operator bootstrap, publish the registry once with a separate client
using a catalog:write credential through `provider.bootstrap(adminClient)`. Close
that client afterward. Runtime credentials must not publish catalogs on requests.
For an already published catalog, verify `client.getCapabilities()` and
`client.getCatalog(catalogId, registry.version)` before accepting sessions. Close owned
clients/stores on backend shutdown. Do not expose bootstrap through model tools.

## 3. Register the three public tools

Use the exact definitions in shared/mcp-tools.json, including oneOf/not constraints
and read/write annotations. Validate input with a runtime validator configured for
the public schemas. The catalog profile is narrower than these entry-point schemas.
The older MCP adapter used in the measured environment supports 2025-11-25; test
the protocol and SDK version of your own provider instead of assuming compatibility.

examples/provider-adapter.mjs maps those public names to the SDK's methods. Supply
an authenticated actor, the actual provider instance, a validator for the shared
schemas, and an explicit intent-minimization callback. Return operation metadata
as MCP JSON text; return business text content without changing its meaning. Writes
are denied in this experiment. Do not invent IDs or run hidden discovery during
prepare. Map EXECUTION_UNKNOWN explicitly so the model does not retry an uncertain
effect. No output data should go to the core or Jev.

## 4. Configure equivalent conditions

The provider needs an operator-only deployment switch with three values:

- `direct`: expose the original read-only catalog and authorized handlers.
- `go`: expose the three public tools and connect the same SDK to the Go core.
- `rust`: expose the same three tools and connect that SDK to the Rust core.

The host-first conditions use the same go/rust provider deployments. The host calls
prepare before model inference and supplies the validated operation as untrusted
context. They do not introduce a fourth MCP tool or bypass execution decisions.

The harness can atomically write `provider.modeFile`, which your backend reads when
creating a new MCP session, as in the measured lab. Alternatively configure
`provider.modeCommand` as a trusted argv array containing `{backend}`. That command
runs outside model control and must switch only deployment configuration. Never
accept this mode in tool arguments. Switch between finished questions, never during
an active operation. Keep endpoint, authentication, catalog and data equivalent.

## 5. Capture telemetry and authenticate the host

Write SDK `onRequest` events as newline-delimited JSON to `provider.traceFile`.
Use a backend-owned stream and restricted permissions. Events include duration,
attempts and each hop's Jev calls, measured-usage calls, input/output token counts
and duration. Preserve failed attempts. Do not log arguments, results, auth headers
or raw Jev payloads. The harness runs serially; dedicate the trace stream to this
experiment to avoid including unrelated traffic.

Set up and log into your MCP in Codex using the provider's normal OAuth flow.
The experiment supplies its configured URL per process and uses that existing
access. It does not extract tokens from a database or create fake identities.
Register/login the chosen `provider.serverName` in your own local Codex setup.
List unrelated configured MCP server names under `disableServers`: the harness
disables them for its subprocess and refuses a turn if other tools remain exposed.
No global permissions are weakened. The model has no shell, web, apps or subagents.

## 6. Choose the corpus

`data/woku-corpus.en.json` contains the actual English workload template and expected
tool/filter oracle used for the fresh Woku run. Woku-specific names are examples,
not generic tool requirements. Supply your own 30 questions, expected tool names,
arguments and documented defaults for a different backend. Bind real identifiers
with tools/bind-corpus.mjs before running. Never feed the oracle to the selector or
agent. A changed language, catalog or workload defines a new experiment.

The original Woku database and its responses are private. Public results permit
numerical reanalysis, but independent regrading and exact dataset replay require
the original authorized data. New backends reproduce the protocol, not those data.
