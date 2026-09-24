# V2: selection accuracy with the complete Woku catalog

This version compares four architectures over the same 60 English requirements,
using `gpt-6-luna` through the OpenAI Responses API with reasoning effort `high`.
The API host is a small Node.js program; Codex does not act as the evaluated agent.
Only the Go core is measured. Rust remains a schema and SDK conformance consumer.

## Catalog and tasks

The active Woku MCP has 143 tools: 73 reads and 70 mutations, exported from all
27 active registrars through actual MCP tools/list. Hidden improvement-cycle
registrations are not active and are excluded. The complete catalog includes
all tools, even those with no target requirement in the 60-case sample.

The corpus has 30 reads and 30 mutations, targeting 59 distinct tools. It deliberately includes neighboring
operations: NPS numeric statistics versus narrative reports, form definitions
versus answers, action-plan events versus conversations, flow versions versus
runs, renaming versus settings, activation versus deletion, and CSAT versus CES.
It is an authored exploratory corpus, not a held-out random sample of real traffic.
All IDs, companies, people, records and email addresses are synthetic.

The Woku application and its genuine registered business handlers run against a
new local MongoDB database. The provider restores the fixture before every case.
The reopen requirement starts from a closed woku; all four conditions receive that
same case-specific precondition. Before paid measurement, all 60 reference tool
calls succeeded and all 30 mutation state oracles matched persisted records.
No outbound delivery requirement is in the corpus; delivery tools remain catalog
distractors. There are no production business credentials in this provider.

## Four conditions

| Condition | Agent surface and preparation |
|---|---|
| Direct MCP | All 143 tools and complete schemas; the API model selects a native tool. |
| Design 1 | Three Toolgate entry points; the API model calls prepare_action, then executes. |
| Design 2 | The host first prepares the verbatim requirement with empty known arguments; the API model receives that result and the three entry points. |
| Design 3 | Same host-first flow, with independent binary Jev requests over retrieved candidates. |

The SDK runs inside the Woku provider process. The agent host only calls the
provider's authenticated loopback MCP Streamable HTTP endpoint. Business handlers
run locally in Woku. The SDK reaches an independent Go process over verified HTTPS;
Go reaches Jev over HTTPS. Both remote preparation and the execution decision are
retained, with the durable local PostgreSQL execution ledger and provider approval.

The larger catalog exposes an existing retrieval stage: lexical-v1 retains up to
64 authorized candidates. Choice starts with up to 32 and may expand once to 64.
Binary evaluates the retrieved candidates with at most 22 simultaneous requests.
**143 catalog tools does not mean 143 Jev options or 143 binary requests per case.**
Neither the retrieval rule nor the confidence thresholds are tuned on these cases.

## Outcomes fixed before the final run

The primary outcome is the first task-tool proposal matching the reference tool.
The optional `woku_guide` discovery call is recorded separately; it is not a wrong
business action. The unfiltered first selection is also retained, so the discovery
step cannot disappear from latency, tokens or call counts. Toolgate ambiguities
are resolved by the agent only among returned candidates; automatic selection,
ambiguity, candidate coverage and abstention are separate fields.

Additional outcomes include eventual correct tool use, exact complete arguments,
successful expected handler, persisted mutation state, extra wrong tool calls,
wrong mutation attempts, MCP/core errors, timeouts and a completed final answer.
Exact arguments are intentionally strict: equivalent defaults or extra valid
fields can fail that score without implying the wrong tool. The state oracle does
not use the agent's prose to decide whether a mutation happened.

Latency starts when the requirement is submitted, before any host-first selection,
and ends after the full final API response or recorded failure/turn-limit termination.
Completed-answer latency is also summarized separately. MCP initialization and catalog upload
are measured separately. Capture every model attempt, MCP request, SDK-core hop,
Jev request count, selector wall time, overlapping Jev time and local handler time.
Do not sum nested or overlapping spans into end-to-end latency. Record tokens,
cache reads/writes, estimated API cost, local CPU and sampled peak RSS. Remote
OpenAI/Jev CPU and memory are not observable.

## Measurement protocol

Each requirement runs once per condition, serially, in a rotating condition order:
240 cases, with each condition occupying each order position 15 times. Every case
has a fresh model conversation. Schemas, corpus, binaries, SDK tarball, provider,
runner and configuration are fingerprinted before running. Artifact drift stops
continuation. Completed and failed cases are never replaced. Smokes and development
attempts are separate files. API calls have no automatic transport retries; SDK
retries retain the existing bounded idempotent policy and are counted.

The main run caps each case at eight API turns and 120 seconds, with explicit
whole-run request/cost limits. Missing usage remains unknown rather than zero.
An uncertain business execution stops the run and is never silently repeated.
The matrix is not a throughput/load test. Small-N tail percentiles are descriptive;
this single local run cannot establish universal superiority or language effects.

## Reproduction

Use the existing Go build and SDK tarball workflow. `tools/v2/core-lab.mjs` owns two
fixed-profile Go processes and verified local TLS endpoints. `tools/v2/provider.mjs`
is the provider-side adapter; inject real registered local handlers and an isolated
fixture database. `tools/v2/run.mjs --live --config=private-config.json` runs the API
host; add `--smoke` for the separate read/write smoke set. It reads OPENAI_API_KEY
from the configured private environment file and never places it in a model prompt.

The proprietary Woku application and private fixture launcher are not part of this
public source package. The public catalog, corpus, runner, adapter, shared schema
fixtures and numerical results support inspection and reanalysis. Re-executing
actual Woku business handlers requires access to that provider and the fixture
setup described here. A synthetic replacement provider would be a different run.

All 60 requirements have an intended matching tool. This corpus does not measure
rejection quality for unsupported requests or missing permissions. Extra preparatory
reads can be useful; the strict first-task-tool metric and the non-target-call
counter do not by themselves prove an unsafe action. Wrong mutation attempts are
reported separately.

Pricing is fixed by [the September 24 snapshot](../tools/api-pricing-v2-2026-09-24.json),
using [OpenAI Standard API prices](https://developers.openai.com/api/docs/pricing)
and [Jev token prices](https://docs.typesafe.ai/models). The OpenAI model and function
calling behavior were checked against the official model page and a live full-
catalog compatibility request before measurement.

[The synthetic fixture snapshot](../data/v2/fixture.json) records the baseline
business records and the reopen-case override. Restore values through the provider's
own model schemas and encryption service; the Client email is plaintext in this
synthetic export and must be encrypted before storage. Generated IDs and timestamps
of newly created records are not exact-match output oracles. The checks in
`tools/v2/state.mjs` assert the requested persisted business fields instead.

V1 and V2 use different agent models, catalogs and business datasets. Cross-version
latency or cost differences cannot be attributed to Toolgate design alone. Compare
the four contemporaneous V2 conditions for this experiment's question.

The API host maps MCP tools/list descriptors to Responses API function definitions
and sends each model-requested call through the real MCP client. It does not use
OpenAI hosted MCP, native tool search or the Codex app server. The local provider
uses an operator-generated test bearer token bound to a synthetic owner context;
this experiment does not retest Woku's production OAuth flow. A requirement can
involve several API calls before its final answer; 240 cases is not 240 API calls.

Function definitions carry each MCP tool's name, description and complete input
schema. MCP annotations remain provider metadata; the Responses function interface
does not receive them as separate annotation fields. Runtime authorization and
validation do not depend on the model inferring those annotations.

The [review notes](../results/v2/review-notes.json) explain selector failures, the
operation-ID copy error, the turn-limit case and the corrected native argument
error. The [excluded-run ledger](../verification/v2/excluded-runs.json) preserves
development/smoke consumption separately from the main matrix.

### Provider and private configuration interface

Copy and adapt the [API-host configuration](../examples/v2-experiment.example.json)
and [core-supervisor configuration](../examples/v2-core-lab.example.json). All file
paths resolve relative to the configuration file. Replace provider paths and the
synthetic control token; do not commit the resulting private configuration.
The existing `tools/lab-db.py init` and `tools/pack-sdk.mjs` provision a dedicated
core/ledger fixture and an actual SDK consumer. The Woku business database is a
separate disposable MongoDB fixture. Its provider process must trust the local
TLS certificate through `NODE_EXTRA_CA_CERTS` before importing the SDK.

Resolve `sdkConsumer` and `mcpConsumer` to absolute package.json paths before
passing the configuration to `createV2Provider`.

The provider wrapper owns a `createV2Provider` adapter and these operator-authenticated
HTTP routes. Only `/mcp` is used for model-requested tools; the remaining routes
are experiment controls and must not be registered as tools.

| Route | Required behavior |
|---|---|
| `/health` | Return `{ready:true, tools:143, bootstrap:[...]}` after both SDK connections bootstrap. |
| `/reset` | Restore the isolated fixture for `caseId`, then call `adapter.reset(mode)`. Preserve the V2-60 closed-woku precondition. |
| `/mcp` | Pass authenticated requests and parsed JSON to `adapter.mcp(request, response, body)`. |
| `/record` | Return `adapter.snapshot()` after the agent finishes. |
| `/trace` | Return native handler timing/error records for this case. |
| `/state` | Return persisted model records keyed as in fixture.json, including decrypted synthetic Client email for the state oracle. |

On shutdown, close the adapter and provider resources. The private Woku wrapper
instantiated the genuine Nest application and registered handlers from its active
MCP registrar list. It did not replace handlers with mock business results.
