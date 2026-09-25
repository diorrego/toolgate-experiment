# V3 part 2 completed handoff

The 750-cell experiment, audit and documentation are complete. LOCAL COMMIT ONLY:
the user explicitly prohibited a push. Do not update remote repository metadata.

Base: 8c9ad7e. Semantic manifest:
27ce350b50f7082ea8d2720ee79b99a7cca881d060c8094423a37a085b95e080.
Optional trusted exposure_limit 1/3/5/8 is implemented in both cores and the SDK.
Only a single joint Go core was measured. Preselection, inclusion questions,
thresholds, alphabetical order, Luna prompt/budgets and V3 reuse remain unchanged.
Diagnostics never enter model context. There is no padding, novelty filtering or
forced preparation. Old source mirrors and Woku source remain untouched.

Same 30 questions, five repetitions in each of five conditions: direct, Joint-1,
Joint-3, Joint-5, Joint-8. The definitive private manifest is
runs/run-2026-09-24T21-08-41-196Z.json in the enclosing workspace's .local/v3p2.
It completed at 2026-09-25T00:18:01.137Z. Never resume or overwrite this run.
All 750 immutable cell hashes and measured fingerprints were verified.

Final success counts: 150/148/147/148/149 out of 150. All-five scenario counts:
30/28/27/28/29. Median task times: 13.66/20.62/12.30/9.88/9.78 seconds. All 375
mutation states matched; no improper mutation was invoked. One Joint-1 case hit
the turn budget; the other failures are missing names or wrong saved-report lookup.
There were 3,838 agent calls, 1,534 Jev attempts and 749 final answers.

The 725 original online successes remain unchanged in onlineGrade. Uniform
recognizer corrections under the same fixed user requirements produce 742 final
successes. See evaluator-clarification.json and review-notes.json for the exact
rules and cases. This is not blinded independent human adjudication. Do not hide
the distinction between online and audited results.

Agent usage is complete. Two Jev attempts lack usage, so Joint-5 and Joint-8 total
costs are unknown; publish known lower bounds, never zeros. Whole-matrix known
reported cost is $1.774735323. The 15-cell smoke (13 goal successes) is separate.
Direct and Joint-8 controls are fresh. No failed execution was replaced.

All applicable gates and numerical audits passed; see verification/v3p2. All owned
services/ports are stopped, with databases and private captures retained. Do not
print the private config, control token, seed, shared lab credentials or API keys.

Recompute the public report with node tools/v3p2/report.mjs --check and the
independent audit with python3 tools/v3p2/audit.py. Native handlers are not vendored;
full live reproduction requires the compatible provider. V3 original results and
files under tools/v3, data/v3 and verification/v3 remain unchanged.


Operational-freeze deviation: the recognizer required corrections during/after
inspection of measured outputs. Final success counts are audited outcomes, not
wholly preregistered automatic scores. Both original and corrected verdicts remain
available; selection, execution, timing and consumption were not changed.
