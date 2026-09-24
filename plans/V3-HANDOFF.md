# V3 handoff

V3 implementation, verification and the 120-cell matrix are complete. Local
commit only: the operator explicitly prohibited a remote push for this version.
Keep that restriction until the operator authorizes publication.

The Go and Rust cores expose additive POST /v1/workflows; the single SDK exposes
prepareWorkflow. Up to eight independently bound operations are returned. Luna
discovers IDs and controls execution. Every invocation retains its remote decision,
provider-local handler, current authorization/approval and durable execution ledger.
Joint mode batches inclusion questions; parallel mode submits them separately with
22 in flight. Neither profile is a local SDK selector or a workflow executor.

Baseline b3b42c3; semantic manifest
ecb438ea4b0f3ac8294be2187a90adb963fbd6e74828f7173c1f0e47e15cc8f2.
See docs/v3-contract-migration.json and shared/adr/0005-v3-workflow-preparation.md.
Old source mirrors and Woku source remain untouched.

The corpus has 30 requests, 15 reads and 15 mutations, 75 reference calls and 39
distinct reference tools from the 143-tool catalog. IDs are remapped per case and
kept out of model context until discovered. All native oracles passed before the
final live matrix. GPT-6 Luna/high made 549 calls; Jev 1.13.0 made 3,298. Complete
main usage gives a $0.270314074 estimate, not an invoice. All 120 cases answered;
all 60 mutation states matched, with no non-reference mutation invocation.

Reference success: direct 30, design 1 29, design 2 30, design 3 30 out of 30.
Do not interpret that as complete-answer accuracy. Design 1 used a valid alternate
folder-report path; designs 1 and 3 returned member IDs/roles without names in one
case. The separate post-run interpretation is 30, 29, 30, 29. Original grades are
retained. Initial complete reference coverage was 21, 17, 17 across gate designs.
Median task times were 16.32, 13.96, 11.88, 11.29 seconds respectively. One local
run does not establish a universal winner or production/refund safety.

The 31-cell development matrix and both eight-cell smokes remain separate. The
development run has incomplete usage; its total cost is unknown. See results/v3,
verification/v3 and docs/V3-WORKFLOWS.md for evidence, scope and fixture limitations.
Go/Rust/SDK gates, real HTTP/PostgreSQL parity, durable mutation behavior, external
tarball use, host regressions, native oracles and offline arithmetic audits passed.

All owned experiment services are stopped; test data and private captures are
retained. Next useful research is a held-out, goal-based corpus with explicit
alternative paths, named-entity completeness and coherent analytics fixtures.
That is future work, not unfinished work in this measured version. Do not resume
the completed matrix or overwrite its observations. Do not push this local commit.
