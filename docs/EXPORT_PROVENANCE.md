# Source and experiment provenance

This repository contains independent Go/Rust cores, one TypeScript SDK, portable
English experiment tools and sanitized observations. The provider server, admin
application, customer data, credentials, installed dependencies, binaries and
private response captures are excluded from source archives.

The first English matrix used the implementation identified by
[source-manifest.initial.json](source-manifest.initial.json). Those digests are
historical, not a claim that all current runtime files are unchanged. Its original
source archive has SHA-256
574ef6ee360d6fd395e133f4a54983327966f8788548a7578e9cd3f722be32e2 and is retained as a
separate delivery artifact. The original observations and review notes remain
unchanged; their own file/configuration/binary hashes identify that measurement.

The V1 binary-experiment snapshot added the explicitly enabled binary selector and
cancellation-safe telemetry. [The V1 binary manifest](source-manifest.json) identifies
runtime/wire files and lists differences from the initial snapshot. Default Choice
behavior has baseline conformance regression tests. The binary experiment uses
fresh Choice controls compiled from the same current source as binary profiles.

The API remains 0.1.0 and wire schemas/migrations are unchanged. The selection
policy addendum is defined in [ADR 0003](../shared/adr/0003-binary-parallel-experiment.md).
[The manifest migration record](binary-contract-migration.json) preserves old and
new documentation fingerprints. Both language implementations and the single SDK
are checked together; no language-specific permissive contract is introduced.

No license is declared. Dependency licenses remain those of their upstream
packages. Preparing source files or archives does not upload or publish them.

## V2 accuracy experiment

[The V2 source manifest](source-manifest.v2.json) identifies the expanded schema
profile and opt-in provider mutation executor. [ADR 0004](../shared/adr/0004-v2-catalog-and-mutations.md)
and [its migration record](v2-contract-migration.json) document the semantic change.
Wire DTOs and SQL migrations remain unchanged. The older manifests, observations
and result reports remain historical evidence and are not overwritten.

The complete active Woku catalog was collected using its real registrars and MCP
tools/list without invoking business dependencies. The only publication edit to
metadata replaces U+2014 punctuation with a semicolon and space. Schemas are retained
exactly. The V2 fixture uses synthetic records and true Woku handlers in an isolated
MongoDB database, with the single SDK installed from its real package tarball.
The proprietary provider, fixture launcher, credentials, business snapshots and
agent answers remain outside this public package.

After V2 measurement, two documentation-only clarifications aligned PRODUCT's
executable-scope paragraph with ADR 0004 and explicitly enumerated the existing
six accepted patterns. They changed the publication manifest, not runtime source,
wire schemas, catalog, thresholds or measured binaries. The exact measured lock
is preserved in verification/v2/measured-contract-lock.json. The V2 manifest and
migration record distinguish measured and publication hashes.
