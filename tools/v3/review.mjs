/** Explicit post-run interpretation checks; never changes frozen primary scores. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const file = process.argv.find((a) => a.startsWith("--private="))?.slice(10);
if (!file) throw Error("Private completed capture required");
const bytes = readFileSync(file),
  raw = JSON.parse(bytes),
  root = resolve(import.meta.dirname, "../..");
if (!raw.complete || raw.smoke || raw.records.length !== 120)
  throw Error("Complete definitive matrix required");
const payload = (c) =>
  JSON.parse(c.result.content.find((b) => b.type === "text").text);
const records = raw.records.map((r) => {
  let equivalentAlternative = false;
  if (r.caseId === "V3-13" && !r.grade.workflowSuccess) {
    const listing = r.businessTrace.find(
        (c) => c.tool === "list_generated_reports" && !c.isError,
      ),
      folder = r.businessTrace.find(
        (c) =>
          c.tool === "get_folder" &&
          !c.isError &&
          c.arguments.folderId === r.oracleIds.folder,
      ),
      report = r.businessTrace.find(
        (c) =>
          c.tool === "get_folder_report" &&
          !c.isError &&
          c.arguments.folderId === r.oracleIds.folder,
      );
    equivalentAlternative = Boolean(
      listing &&
      folder &&
      report &&
      listing.endedMs <= folder.startedMs &&
      folder.endedMs <= report.startedMs &&
      payload(listing).reports.some((p) => p.folderId === r.oracleIds.folder) &&
      payload(folder).id === r.oracleIds.folder &&
      payload(folder).name === "Service Desk" &&
      payload(report).folderId === r.oracleIds.folder &&
      payload(report).summary.summary ===
        "Service Desk feedback highlights clear callback ownership." &&
      r.answer?.includes("callback ownership") &&
      r.grade.groundedIds &&
      r.grade.state.correct &&
      r.grade.wrongMutationCalls === 0,
    );
  }
  let namedMemberComplete = null;
  if (r.caseId === "V3-08") {
    const name = "Synthetic Operator";
    namedMemberComplete = Boolean(
      r.answer?.includes(name) &&
      r.businessTrace.some(
        (c) =>
          !c.isError &&
          JSON.stringify(c.result).includes(name) &&
          JSON.stringify(c.result).includes(r.oracleIds.user),
      ),
    );
  }
  return {
    caseId: r.caseId,
    mode: r.mode,
    frozenReferenceSuccess: r.grade.workflowSuccess,
    verifiedAlternativeCompletion: equivalentAlternative,
    namedMemberComplete,
    reviewedCompletion:
      (r.grade.workflowSuccess || equivalentAlternative) &&
      namedMemberComplete !== false &&
      r.status === "completed",
  };
});
const byMode = Object.fromEntries(
  ["direct", "design-1", "design-2", "design-3"].map((mode) => [
    mode,
    {
      reviewedCompletion: records.filter(
        (r) => r.mode === mode && r.reviewedCompletion,
      ).length,
      verifiedAlternatives: records.filter(
        (r) => r.mode === mode && r.verifiedAlternativeCompletion,
      ).length,
      namedMemberOmissions: records.filter(
        (r) => r.mode === mode && r.namedMemberComplete === false,
      ).length,
    },
  ]),
);
const review = {
  version: 3,
  rawSha256: createHash("sha256").update(bytes).digest("hex"),
  status:
    "Secondary post-run analysis; not the frozen primary metric and not a blinded independent adjudication.",
  reviewer:
    "Codex, the experiment implementation assistant; source-backed checks are implemented in tools/v3/review.mjs.",
  readAnswerReview:
    "All 60 read answers were inspected against the fixture and native outputs. Two ID-only member answers omit names under a name-based reading of who. The other requested read facts were present. This is a limited authored dataset, not a general semantic grader.",
  notes: [
    {
      caseId: "V3-13",
      issue:
        "The frozen oracle requires list_folders. Design 1 instead uses list_generated_reports -> get_folder -> get_folder_report. All three refer to the same discovered folder, and the final summary matches its saved report. Preserve the reference miss and record a valid alternative completion.",
    },
    {
      caseId: "V3-08",
      issue:
        "The frozen reference requires group lookup/detail but not list_company_members. Design 1 and design 3 return the member ID and admin role, honestly stating the name is unavailable. Direct and design 2 resolve Synthetic Operator through the company directory. This secondary stricter name-completeness check exposes an omission that the primary reference metric misses.",
    },
  ],
  fixtureLimitations: [
    "The seeded data-flow run has recordsReviewed=12 but breakdown.recordsReviewed=0. All four agents report these saved values; this inconsistency was retained identically, not silently repaired after measurement.",
    "Seeded AI report summaries have frequency=3 while native review counts are zero and sourceReviewCount is absent. They are saved synthetic report facts, not reports generated from a coherent feedback dataset.",
    "The action-plan history is empty. Completion tests retrieval and truthful empty-result handling, not long-history synthesis.",
  ],
  byMode,
  records,
};
writeFileSync(
  resolve(root, "results/v3/review-notes.json"),
  JSON.stringify(review, null, 2) + "\n",
);
console.log(JSON.stringify(byMode, null, 2));
