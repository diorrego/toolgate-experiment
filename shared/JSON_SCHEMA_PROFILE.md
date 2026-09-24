# tg-jsonschema-1

Catalog tool schemas use a bounded subset of JSON Schema 2020-12, not universal
MCP schema support. Supported keywords: $schema, informational $id, $defs, local
acyclic $ref, type, properties, required, additionalProperties, enum, const,
minimum, maximum, exclusiveMinimum, exclusiveMaximum, minLength, maxLength,
minItems, maxItems, items, minProperties, maxProperties, allOf, anyOf and oneOf.
Allowed annotations are title, description, default, examples, deprecated,
readOnly, writeOnly and format. Format is an annotation, not a security validator.

Reject remote/file/recursive references, dynamic references/anchors, arbitrary patterns,
patternProperties, multipleOf, uniqueItems, contains, prefixItems, unevaluated*,
dependent*, if/then/else, not and unregistered extensions. This profile applies
to catalog tool schemas, not to OpenAPI or the three public MCP entry-point schemas.

Arguments must be JSON objects, at most 64 KiB canonical, depth 32, 256 properties
per object and 1,000 items per array. Numbers are finite IEEE754 with integers in
+/- (2^53-1). Use strings for exact large identifiers/decimals. Reject duplicate
keys and __proto__, prototype and constructor keys. Do not coerce values, insert
defaults, remove extra fields, or treat null, false, zero or empty string as absent.

Issues are deduplicated and sorted by instance_path, schema_path and code using
RFC 6901 pointers. At most 128 issues are returned, with truncation indicated.
missing_paths contains only unambiguous missing requirements. Do not union required
fields from unrelated anyOf/oneOf branches to invent a branch. allOf applies all
constraints. Return the selected schema with branch issues when ambiguity remains.

Compile and reuse validators by scoped catalog/schema digest; never resolve a
reference from a network or filesystem. Bound reference resolution to 64 hops/nodes
and reject cycles. TypeScript types alone are not validation. Ajv coercion,
useDefaults and removeAdditional are forbidden.

Use RFC 8785 canonicalization for runtime catalog/schema/argument digests, including
number rendering and UTF-16 key ordering. Plain sorted JSON is not a general JCS
implementation. Contract-file manifests use their separately documented encoding.

## V2 finite Woku compatibility

The common keyword subset also accepts the declaration
`http://json-schema.org/draft-07/schema#`. Catalog metadata is not rewritten.
Draft-07 `$ref` nodes may have annotation siblings only; validation siblings are
rejected to avoid differing draft semantics across validators.
The `pattern` keyword accepts only the six expressions specified and exercised
in fixtures/woku-patterns.json, with ECMAScript character and boundary semantics.
All other expressions remain unsupported. Pattern failures use unsupported_value.
See ADR 0004 for consumer compatibility and compile-only normalization.


The accepted pattern strings are exactly:

- `^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$`
- `\S`
- `^(?=.*[0-9])[+]?[0-9()\-\s.]+$`
- `^[a-f0-9]{24}$`
- `^[0-9a-fA-F]{24}$`
- `\D`
