# Shared lexical-v1 and Jev selection

Filter authorization before retrieval or inference. Normalize query text with
Unicode NFKD, remove combining diacritics, lowercase ASCII and split into ASCII
alphanumeric tokens. Reject more than 256 query tokens. With at most 32 allowed
tools, use all of them sorted by tool_id. Otherwise score matching query tokens
against name (10), aliases (5), title (3), tags (2) and description (1). Keep positive
scores, sort descending by score then ascending tool_id, and retain at most 64.

Select from at most 32 candidates plus none. Only insufficient confidence or
abstention with additional retrieved candidates permits one expansion to at most
64 plus none, inside the same deadline. There are no Jev transport retries. Do not
repeat inference during argument completion or candidate resolution.

Send minimized intent/context and authorized tool metadata. Map opaque candidate
keys back locally to catalog IDs. Choice does not produce arguments, credentials,
URLs or permissions. The measured profile pins jev-1.13.0.

Validate the closed distribution: known choice, all expected options, no unknown
options, finite probabilities in [0,1], sum within 1e-4 of one, and choice at a
maximum. Do not renormalize malformed probabilities. Confidence is not a proven
accuracy rate or an authorization decision.

Read acceptance requires top probability >=0.70 and margin >=0.15. Write,
destructive and unknown effects require >=0.85 and >=0.25. Include none when
computing the margin. A leading none with no expansion produces no_match. Otherwise
return 2 to 5 candidates as needs_choice if confidence is insufficient; a single
real candidate cannot create fictitious ambiguity. Thresholds are proposed
heuristics, not safety guarantees. The provider independently enforces permissions.

Deterministic tests use a local HTTP selector fixture. They do not demonstrate
semantic accuracy of the live model. Broader multilingual held-out corpora,
abstention calibration, larger catalogs and adversarial cases remain future work.

## Optional binary-parallel experiment

The default profile above remains unchanged. The explicitly enabled
`binary-parallel-v1` startup profile is specified by
[ADR 0003](adr/0003-binary-parallel-experiment.md). It evaluates individual
authorized candidates in independent requests, with a maximum of 22 concurrent
outbound requests, the same deadlines, and no partial-result selection. It is an
experimental alternative, not a new default or a permission granted by a model.
