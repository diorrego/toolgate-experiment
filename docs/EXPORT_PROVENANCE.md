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

The current source adds the explicitly enabled binary-parallel selector and
cancellation-safe telemetry. [The current manifest](source-manifest.json) identifies
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
