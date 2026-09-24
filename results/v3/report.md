# V3 results: dependent multi-tool workflows

GPT-6 Luna/high, Jev 1.13.0, Go. 143 tools, 30 requirements per condition, 15 reads and 15 mutations.
Run: 2026-09-24T18:50:41.504Z to 2026-09-24T19:21:18.409Z.

## Workflow execution

| Condition | Reference workflow succeeded | Final answers | Correct mutation state | Median task time | p95 | Estimated USD per 30 |
|---|---:|---:|---:|---:|---:|---:|
| Direct MCP | 30/30 | 30/30 | 15/15 | 16.32 s | 23.41 s | $0.049039 |
| Design 1: agent first | 29/30 | 30/30 | 15/15 | 13.96 s | 26.96 s | $0.060035 |
| Design 2: host first, joint | 30/30 | 30/30 | 15/15 | 11.88 s | 21.65 s | $0.060107 |
| Design 3: host first, parallel | 30/30 | 30/30 | 15/15 | 11.29 s | 22.21 s | $0.101133 |

Workflow success requires all reference steps, IDs grounded in prior successful outputs, expected state and no non-reference mutation invocation. It does not certify the wording of the final answer. All cases, including failures, contribute to task times. Completed-answer and successful-workflow times are also reported separately.

## Initial selection and recovery

| Condition | Initial complete step coverage | Mean reference precision | Mean initial step coverage | Cases with further preparation | Total preparations |
|---|---:|---:|---:|---:|---:|
| Design 1: agent first | 21/30 | 66.4% | 85.0% | 12/30 | 50 |
| Design 2: host first, joint | 17/30 | 64.0% | 78.6% | 14/30 | 48 |
| Design 3: host first, parallel | 17/30 | 63.4% | 78.6% | 14/30 | 50 |

Direct MCP has no separate preparation stage. These are macro averages; empty initial sets contribute zero. Coverage counts required steps whose tool type or declared discovery alternative is selected, including repeated uses. All recovery requests stay in accounting.

## Calls and errors

| Condition | OpenAI calls | Jev calls | MCP calls | Business calls | MCP errors | Handler errors | Non-reference mutation invocations |
|---|---:|---:|---:|---:|---:|---:|---:|
| Direct MCP | 139 | 0 | 118 | 118 | 0 | 0 | 0 |
| Design 1: agent first | 156 | 50 | 149 | 98 | 1 | 0 | 0 |
| Design 2: host first, joint | 126 | 48 | 143 | 95 | 0 | 0 | 0 |
| Design 3: host first, parallel | 128 | 3200 | 144 | 93 | 1 | 0 | 0 |

## Paired comparison to direct MCP

| Condition | Median paired time difference | Direct only succeeded | Gate only succeeded | Both succeeded |
|---|---:|---:|---:|---:|
| Design 1: agent first | -1.82 s | 1 | 0 | 29 |
| Design 2: host first, joint | -4.39 s | 0 | 0 | 30 |
| Design 3: host first, parallel | -4.18 s | 0 | 0 | 30 |

## Secondary interpretation audit

The frozen reference missed a valid alternative in V3-13/design-1: list_generated_reports -> get_folder -> get_folder_report. It also failed to require member names in V3-08: designs 1 and 3 returned IDs and roles without resolving names, while direct MCP and design 2 resolved them. These are different limits of a path-based oracle.

A separate post-run review accepts verified alternatives and requires member names. Its completed-request counts are Direct MCP 30/30, Design 1: agent first 29/30, Design 2: host first, joint 30/30, Design 3: host first, parallel 29/30. This review was performed by Codex, is not blinded independent adjudication, and does not replace the original scores. See [review evidence and fixture limitations](review-notes.json).

Two MCP errors were recovered: V3-03/design-3 reused an issued operation for another argument set (OPERATION_ALREADY_ISSUED); V3-12/design-1 supplied an unknown operation ID (OPERATION_NOT_FOUND). Neither error invoked a business handler. All 60 mutation states were correct, and no non-reference mutation handler was invoked.

## Limits

One authored corpus, one local serial matrix, shared caching and live APIs. This is not a production-safety, refund, load or Go-versus-Rust study. The reference oracle cannot enumerate every valid alternative workflow. Literal answer facts are diagnostic only. Wilson intervals and p99 in the summary are descriptive and do not include corpus-selection bias or repeated-run variability.

Jev sees at most 64 authorized lexical candidates. Joint mode batches independent inclusion questions in one request; parallel mode submits separate requests with concurrency at most 22. Each preparation returns at most eight tools. The larger budget and changed multi-label selection make V2-to-V3 causal latency claims inappropriate.

Costs include reported cache partitions and all attempts; estimates are not invoices. Unknown usage is never filled with zero. No failed cell was replaced.

[Protocol](../../docs/V3-WORKFLOWS.md) · [30 requirements](../../data/v3/corpus.en.json) · [Observations](observations.json) · [Numerical summary](summary.json)
