# V2 verification

All paths below are relative to the experimental repository root. Live usage and
measurements are separate from deterministic gates. The provider application and
private logs remain outside this public package.

## Deterministic and integration checks

| Command | Scope | Result |
|---|---|---|
| `make -C backend-go check` | Format, vet, unit, race, staticcheck, vulnerability audit, build and contract | Exit 0 |
| `make -C backend-rust check` | Format, release Clippy/tests/build, cargo audit/deny and contract | Exit 0 with existing local audit tools on PATH |
| `npm run check` in `sdk-typescript` | Format, lint, types, unit, external tarball and generated contract | Exit 0 |
| `node tools/pack-sdk.mjs` | Actual SDK tarball installed into isolated consumer | Exit 0 |
| `python3 tools/core-conformance.py go --sdk` with mutation test opt-in | Real HTTP/PostgreSQL, restricted roles, durable SDK mutations | Exit 0 |
| `python3 tools/core-conformance.py rust --sdk` with mutation test opt-in | Same suite and SDK against Rust | Exit 0 |
| `make unit` | Existing analysis/host checks and V2 metrics regressions | Exit 0 |
| `make report-check` before V2 report integration | Both historical 150-case reports | Exit 0, exact recomputation |

Each core HTTP suite passed 29 checks. The SDK suite retains its eleven baseline
checks and adds explicit mutation checks: default approval denial, read-path effect
rejection, approval before dispatch, approval before replay, and no second handler
invocation after an uncertain write. PostgreSQL claims, process restart, concurrent
execution and actor isolation remain exercised with actual restricted-role storage.

The finite Woku schema fixture compares six supported patterns against ECMAScript
outcomes, including Unicode whitespace, non-ASCII digits, line endings and invalid
values, in Go, Rust and TypeScript. Draft-07 reference validation siblings are
rejected, preserving a common semantic subset. The active Woku catalog has no such
validation siblings. No pattern is stripped from model-visible tool schemas.

Native Woku preparation checks ran all 60 reference tool calls against the isolated
MongoDB fixture. All handlers succeeded and all 30 mutation state assertions passed.
MCP integration checks verified authentication, exactly 143 direct tools, exactly
three gate tools, unchanged business schemas, and malformed gate arguments rejected
before any core request or business dispatch.

## Live checks and exclusions

The full-catalog OpenAI compatibility probe succeeded with `gpt-6-luna`. Final live
smokes cover one read and one mutation in all four conditions, using real Jev,
verified SDK-to-core HTTPS, actual MCP HTTP and local Woku business handlers.
[Live smoke evidence](live-smokes.json) identifies that capture and its fingerprints.
Smokes are not main-matrix observations.

Development failures included missing fixture paths, lint/type narrowing issues,
missing local cargo tools on PATH, a strict floating-point assertion, and incomplete
business seed prerequisites. They were corrected and relevant checks rerun.
The first development smoke exposed an isError accounting bug. A subsequent
42-case candidate matrix was stopped at a case boundary to add missing MCP
entry-point argument validation. That capture, including errors and consumption,
is retained separately. No rows from it are spliced into the definitive matrix.

These gates establish the tested experimental flows. They do not certify full
production support, arbitrary JSON Schema compatibility, outbound delivery,
production authorization policy, high-load behavior or every Woku tool's handler.
The 84 tools without a distinct target case remain selection distractors; catalog
registration does not imply their business behavior was tested.

## Final audit and shutdown

The definitive capture contains 240 unique cells, 239 final answers and complete
reported usage for 732 model calls and 3,926 Jev calls. An independent Python audit
using Decimal prices and statistics.median agrees with the JavaScript report.
All 120 mutation cases ended with the requested persisted fields and exact final
arguments. There were 121 mutation handler invocations: one invalid ID was rejected
before creation and then corrected, with no duplicate flow.

`make report-check` now checks both historical matrices and V2. All three recompute
exactly. The four updated README diagrams rendered successfully in a real browser.
The public-file checker, exact credential scan and Git whitespace check passed.
Owned V2 services were stopped and all eight listening ports were verified free;
no data or captured results were deleted. See [shutdown evidence](shutdown.json).
