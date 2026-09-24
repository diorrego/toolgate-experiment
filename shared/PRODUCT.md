# Product scope and experimental implementation

Toolgate is an independent remote tool-selection and execution-decision service.
A single TypeScript SDK connects a provider backend to either a Go core or a Rust
core. The two cores never form a serial pipeline. The provider keeps its MCP
endpoint, authentication, business handlers and business results.

The objective is to reduce agent context and, where that compensates for extra
round trips, total task latency and API-equivalent cost. Neither a language winner
nor a performance improvement is assumed. One operation selects one tool. Missing
values, ambiguity and abstention remain visible; no component invents identifiers,
permissions or business arguments. The agent receives the selected input schema.

The SDK defaults to read-only registration. The V2 experimental scope also supports
explicitly enabled write, destructive and unknown-effect operations, with provider
authorization, provider-owned approval, remote decisions and the durable local
ledger. Only text MCP results are supported. This is not a production release or a
claim of universal MCP support; see ADR 0004 for the opt-in boundaries.

Required boundaries include immutable versioned metadata, tenant and integration
isolation, authenticated provider actor context, authorization before candidate
selection, deterministic validation, operation revisions, remote execution
decisions, provider-local dispatch, durable deduplication, resource authorization
before dispatch and replay, and metadata-only core receipts.

Host-first preparation is a separate experimental orchestration: a host calls the
same authenticated provider MCP before model inference, passes the operation as
untrusted context, and lets the model supply arguments and request execution. It
does not change the public tools or remove either SDK-to-core round trip.
