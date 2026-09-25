# ADR 0006: optional final workflow exposure cap

Accepted for the user-authorized V3 part 2 experiment. Add optional exposure_limit
1, 3, 5 or 8 to WorkflowRequest. Only trusted provider configuration supplies it;
the MCP schema and model prompt stay unchanged. Omission retains V3 behavior.

For an explicit limit, retrieve and classify exactly as V3, sort all included
tools by tool_id, and keep the first at most N. Never pad, rotate, exclude previously
seen tools, rank by probability or issue automatic discovery. A valid empty set
abstains. Invalid/incomplete selector output still fails the whole preparation.
Create independent ordinary operations for the exposed tools and retain all
existing execution decisions, approval, bindings and durable ledger rules.

Optional X-Toolgate-Workflow-Trace metadata records catalog version and indices
into the immutable catalog's sorted tools: retrieved, included and exposed. Null
means the stage was not completed; an empty list means completed with no results.
The header uses small integer indices to stay bounded even for long tool IDs.
Trace data is provider/evaluator telemetry, never MCP content or model input. It
does not authorize execution. Failed attempts retain the last completed stage.

Both cores and the SDK implement the same additive request and diagnostic shape.
Wire version remains 0.1.0; the semantic manifest and generated consumers change.
No SQL migration, inclusion prompt, threshold, preselection order or handler change.
No model-call or matrix parallelism is added. Existing V3 fixtures/results remain
immutable; all five conditions receive fresh measurements.
