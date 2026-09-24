# ADR 0004: complete Woku catalog and provider-local mutations

Status: accepted for the operator-requested V2 laboratory, 2026-09-24.

V2 tests 143 active Woku tools, including mutation distractors and 30 mutation
requirements, against a disposable database. The wire contract already represents
read/write/destructive/unknown effects. This change implements the missing local
write path without altering remote decisions, identities, schemas or ledger states.

The SDK keeps read-only registration as the default. A trusted registration option
explicitly enables mutation metadata. executeWrite rejects read effects;
executeRead rejects all other effects. Every write requires a provider-supplied
approval callback for the exact actor/tool/arguments, independently of model input,
before dispatch and replay. Missing approval fails closed. Authorization, argument
bindings, durable claims, replay checks and uncertain-effect handling remain shared.

The schema profile additionally accepts the draft-07 declaration for its common
keyword subset and a finite six-expression Woku pattern vocabulary. The same
pattern strings are retained in metadata/digests and model-visible schemas. Go uses
bounded linear matchers; Rust normalizes ECMAScript character classes on a compile-
only copy; TypeScript uses ECMAScript directly. Shared fixtures include Unicode
whitespace, non-ASCII digits, line boundaries and invalid values. Unknown patterns
remain rejected. No general regex support, remote references or relaxed validation
is introduced. Pattern violations use the existing unsupported_value issue code.

Contract compatibility: wire version remains 0.1.0; semantic manifest changes.
Older consumers reject the new catalog rather than silently accepting it. Update
all three consumers together before using this catalog. Existing read-only callers
retain their behavior. Old results describe their historical source hashes.

Selection profiles and thresholds remain fixed: lexical top-64 retrieval,
Choice top-32 with at most one expansion, or one binary request per retrieved
candidate with concurrency 22. This experiment does not claim all 143 tools reach
Jev on every request. Full catalog exposure to the direct agent is preserved.
