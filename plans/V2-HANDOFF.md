# V2 accuracy handoff

The 240-case experiment is complete. The agent was GPT-6 Luna/high through the
Responses API, with a real MCP HTTP client, the SDK inside Woku, local native
handlers, Go over verified HTTPS and Jev 1.13.0. All 143 active tools were registered.
The 60 English requirements contain 30 reads and 30 mutations over synthetic data.

First-reference selections: direct 43/60, design 1 60/60, design 2 59/60, design 3
59/60. Direct discovery reads explain its lower strict first-reference score;
eventual expected-handler success is 60/60, 60/60, 59/60 and 58/60 respectively.
All 120 mutation cases matched persisted-state oracles. One rejected malformed-ID
mutation invocation was corrected without a duplicate effect. No non-target
mutation call was observed. Design 1 reached its eight-turn limit in one read case,
so there are 239 final answers. No failed cell was replaced.

Median task times: 10.48, 9.53, 4.41 and 5.75 seconds. Estimated total API costs for
60 cases per condition: $0.071341, $0.048590, $0.034459 and $0.104033. Estimates include
all model/Jev consumption and cache partitions; they are not invoices.

Go, Rust, SDK, external tarball, actual HTTP/PostgreSQL mutation integration,
native Woku oracles, MCP entry validation, host tests and offline reports passed.
The runtime changes are finite schema compatibility and opt-in provider-approved
mutations with the existing decision and durable execution ledger. A 42-case
candidate run stopped for a protocol-validation correction and remains separately
published, together with its failures and costs. Smokes are also excluded.

Measured semantic hash:
920d202a45799fbeabc89d0810f6c5d5bf2a3c8b77e397b36ee35e8406c8cf0b.
Publication hash after documentation-only scope/pattern clarification:
431b6fc5be13e9b6bea0bebb17bf0d834312bf30862e52ca4b02f18434a48f96.
Wire version 0.1.0 and migrations are unchanged. Original root mirrors and provider
source changes from before this task remain untouched.

See the README V2 section, docs/V2-ACCURACY.md, results/v2/report.md and
verification/v2/VERIFICATION.md. Repeated trials, held-out ambiguous/no-match
requirements, different authorization scopes and production deployment remain
outside this experiment. Do not resume the completed run or overwrite its cases.

The owned V2 provider, both Go profiles, TLS supervisor, Redis, PostgreSQL and
MongoDB are stopped. Their ports were verified free. Data and private captures
remain available; unrelated services were not touched.
