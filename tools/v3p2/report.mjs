import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { MODES } from "./schedule.mjs";
import { evaluate } from "./evaluate.mjs";
import { finalEvaluate } from "./final-evaluation.mjs";
import { exposure, summarize, comparisons } from "./analysis.mjs";
import { openaiCost, jevUsage } from "../v2/metrics.mjs";
const root = resolve(import.meta.dirname, "../.."),
  out = resolve(root, "results/v3p2"),
  arg = (k) =>
    process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1),
  privateFile = arg("--private");
const corpus = JSON.parse(
    readFileSync(resolve(root, "data/v3p2/evaluation.en.json")),
  ),
  sha = (b) => createHash("sha256").update(b).digest("hex");
let data;
if (privateFile) {
  const bytes = readFileSync(privateFile),
    manifest = JSON.parse(bytes),
    base = dirname(resolve(privateFile));
  if (!manifest.complete || manifest.smoke || manifest.records.length !== 750)
    throw Error("A complete 750-cell main run is required");
  const records = manifest.records.map((item) => {
    const bytes = readFileSync(resolve(base, item.file));
    if (sha(bytes) !== item.sha256) throw Error("Cell capture drift");
    const r = JSON.parse(bytes),
      c = corpus.cases.find((c) => c.id === r.caseId);
    if (!c || !MODES.includes(r.mode) || r.repeat < 1 || r.repeat > 5)
      throw Error("Invalid cell");
    if (JSON.stringify(evaluate(r, c, r.oracleIds)) !== JSON.stringify(r.grade))
      throw Error("Grade drift");
    if (JSON.stringify(jevUsage(r.remote)) !== JSON.stringify(r.jev))
      throw Error("Jev accounting drift");
    for (const m of r.modelCalls)
      if (openaiCost(m.usage) !== m.costUSD)
        throw Error("Agent accounting drift");
    const exposed = exposure(r, c);
    if (exposed.usedWithoutExposure.length)
      throw Error("Undiscovered handler used");
    if (
      r.mode !== "direct" &&
      exposed.perPreparation.some((p) => p.count > Number(r.mode.split("-")[1]))
    )
      throw Error("Exposure cap violated");
    return {
      caseId: r.caseId,
      repeat: r.repeat,
      position: r.position,
      mode: r.mode,
      effect: c.effect,
      status: r.status,
      error: r.error ?? null,
      taskMs: r.answerCompleteMs,
      hostPrepareMs: r.hostPrepareMs ?? null,
      mcpBootstrapMs: r.mcpBootstrapMs,
      onlineGrade: r.grade,
      grade: finalEvaluate(r, c, r.oracleIds),
      cellSha256: item.sha256,
      exposure: exposed,
      modelCalls: r.modelCalls.map((m) => ({
        durationMs: m.durationMs,
        httpStatus: m.httpStatus,
        status: m.status,
        model: m.model,
        usage: m.usage,
        costUSD: m.costUSD,
        errorCode: m.error?.code ?? null,
      })),
      mcpCalls: r.mcpCalls.map((m) => ({
        name: m.name,
        hostInitiated: m.hostInitiated ?? false,
        durationMs: m.durationMs,
        isError: m.result?.isError === true,
      })),
      businessCalls: r.businessCalls.map((b) => ({
        tool: b.tool,
        effect: b.effect,
        isError: b.isError,
        durationMs: b.durationMs,
      })),
      remote: r.remote.map((m) => ({
        path: m.path,
        durationMs: m.durationMs,
        attempts: m.attempts,
        status: m.status,
        hops: m.hops.map((h) =>
          Object.fromEntries(
            [
              "status",
              "coreTiming",
              "jevCalls",
              "jevMs",
              "selectorMs",
              "jevMaxConcurrent",
              "selectorProfile",
              "jevUsageCalls",
              "jevInputTokens",
              "jevOutputTokens",
              "toolStages",
            ].map((k) => [k, h[k] ?? null]),
          ),
        ),
      })),
      resources: r.resources,
      jev: r.jev,
    };
  });
  if (
    new Set(records.map((r) => [r.caseId, r.repeat, r.mode].join())).size !==
    750
  )
    throw Error("Duplicate cell");
  data = {
    version: "3.2",
    complete: true,
    model: manifest.model,
    effort: manifest.effort,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    sessions: manifest.sessions,
    manifestSha256: sha(bytes),
    fingerprints: manifest.fingerprints,
    limits: manifest.limits,
    conditions: MODES,
    requirements: 30,
    repetitions: 5,
    catalogSize: 143,
    records,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(
    resolve(out, "observations.json"),
    JSON.stringify(data, null, 2) + "\n",
  );
} else data = JSON.parse(readFileSync(resolve(out, "observations.json")));
const byMode = Object.fromEntries(
  MODES.map((m) => [m, summarize(data.records.filter((r) => r.mode === m))]),
);
const paired = comparisons(data.records),
  strata = Object.fromEntries(
    MODES.map((m) => [
      m,
      Object.fromEntries(
        ["read", "write"].map((effect) => [
          effect,
          summarize(
            data.records.filter((r) => r.mode === m && r.effect === effect),
          ),
        ]),
      ),
    ]),
  );
const summary = {
  requirements: 30,
  repetitions: 5,
  executions: 750,
  byMode,
  strata,
  paired,
  wallSeconds:
    (Date.parse(data.completedAt) - Date.parse(data.startedAt)) / 1000,
};
const s = (x) => (x / 1000).toFixed(2),
  money = (x) => (x === null ? "unknown" : "$" + x.toFixed(6)),
  totalMoney = (r) =>
    r.totalCostUSD === null
      ? "unknown; known >= $" +
        (r.agent.knownCostUSD + r.jev.knownCostUSD).toFixed(6)
      : money(r.totalCostUSD);
const lines = [
  "# V3 part 2: exposure size and successive discovery",
  "",
  `Run: ${data.startedAt} to ${data.completedAt}. Five fresh conditions, 30 unchanged V3 cases, five repetitions each (750 executions).`,
  "",
  "## Primary outcomes",
  "",
  "| Condition | Complete executions | Scenarios correct 5/5 | Mutation state | Median task time | p95 | Total estimated API USD |",
  "|---|---:|---:|---:|---:|---:|---:|",
];
for (const mode of MODES) {
  const r = byMode[mode];
  lines.push(
    `| ${mode} | ${r.successes}/150 | ${r.scenariosAllFive}/30 | ${r.correctMutationStates}/75 | ${s(r.latencyMs.p50)} s | ${s(r.latencyMs.p95)} s | ${totalMoney(r)} |`,
  );
}
lines.push(
  "",
  "All executions remain in latency and cost totals, including failures and extra preparations. Completion uses the corrected frozen goal-evidence/answer/state oracle, not initial reference coverage. The numerical summary separates successful and failed latency and includes the per-scenario 0-to-5 success counts. These are token-price estimates, not invoices.",
  "",
  "## Agent and selector accounting",
  "",
  "| Condition | Agent calls | Agent input / output tokens | Agent estimated USD | Jev calls | Jev input tokens | Jev estimated USD |",
  "|---|---:|---:|---:|---:|---:|---:|",
);
for (const mode of MODES) {
  const r = byMode[mode];
  lines.push(
    `| ${mode} | ${r.agent.calls} | ${r.agent.inputTokens} / ${r.agent.outputTokens} | ${money(r.agent.totalCostUSD)} | ${r.jev.calls} | ${r.jev.inputTokens} | ${money(r.jev.totalCostUSD)} |`,
  );
}
lines.push(
  "",
  "Cache partitions and usage completeness are retained in the summary. Two Jev attempts did not report usage: V3-04/repetition 2/Joint-8 returned 504, and V3-27/repetition 5/Joint-5 returned 503. Their attempts and recovery remain counted. Joint-5 and Joint-8 total costs are unknown; reported consumption is a lower bound, not a zero-filled estimate.",
  "",
  "## Actual exposure and successive queries",
  "",
  "| Condition | Preparations | Additional preparations | Cases with additional queries | Mean tools per preparation | Mean distinct exposed per execution | Mean distinct used per execution |",
  "|---|---:|---:|---:|---:|---:|---:|",
);
for (const mode of MODES) {
  const r = byMode[mode];
  lines.push(
    `| ${mode} | ${r.preparationsRequested} | ${r.additionalPreparations} | ${r.casesWithAdditionalPreparations}/150 | ${r.meanExposedPerPreparation?.toFixed(2) ?? "n/a"} | ${r.meanDistinctExposed.toFixed(2)} | ${r.meanDistinctUsed.toFixed(2)} |`,
  );
}
lines.push(
  "",
  "A cap is an upper bound, not a target. Sets are not filled, rotated or filtered for novelty. Old operations remain available under the unchanged V3 rule: same-argument reuse replays; a different argument set after execution needs another preparation. With cap 1, successive discovery is expected and is not itself a failure.",
  "",
  "## Paired time differences",
  "",
  "Negative means the condition took less time than the contemporaneous control. Each pair shares scenario and repetition. The second aggregate gives equal weight to each scenario after taking its five-repetition median difference.",
  "",
  "| Condition | Control | Median of 150 paired differences | Median of 30 scenario medians | Scenarios with lower median time |",
  "|---|---|---:|---:|---:|",
);
for (const p of paired)
  lines.push(
    `| ${p.mode} | ${p.control} | ${s(p.pairedDifferencesMs.p50)} s | ${s(p.scenarioMedianDifferencesMs.p50)} s | ${p.fasterScenarios}/30 |`,
  );
lines.push(
  "",
  "The summary publishes all five differences for every scenario, not just aggregates. Direct and joint-8 are rerun controls; no historical time is substituted.",
  "",
  "## Reference-tool loss diagnostics",
  "",
  "These are counts of scenario/repetition/reference-tool entries that were never exposed during that execution. Narrow follow-up queries naturally omit already used tools. A reference tool can be absent while a valid alternative path still completes the goal. Unknown or failed stages are not counted as negative inclusion decisions.",
  "",
  "| Condition | Preselection | Inclusion | Final cut | Delivery/error or unobserved | Exposed at least once |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const mode of MODES.slice(1)) {
  const l = byMode[mode].cumulativeLoss;
  lines.push(
    `| ${mode} | ${l.preselection ?? 0} | ${l.inclusion ?? 0} | ${l.final_cut ?? 0} | ${(l.delivery_error ?? 0) + (l.unobserved ?? 0) + (l.inclusion_unobserved ?? 0) + (l.exposure_unobserved ?? 0)} | ${l.exposed ?? 0} |`,
  );
}
lines.push(
  "",
  "Per-preparation retrieved/included/exposed tool identities, first-discovery losses and cumulative losses are retained in observations and the numerical summary. Traces are evaluator metadata and were not included in model input.",
  "",
  "## Evaluator implementation audit",
  "",
  "The semantic outcome requirements were fixed before measurement, but the online recognizer had false negatives. The final audit recognizes equivalent empty-history wording, affirmative raised confirmations, formatted phone numbers and an explicit zero-event total from an alternative endpoint. It also removes a draft-status word requirement that was not requested. These corrections apply uniformly across conditions and repetitions. No question, model call, response, time, cost or persisted state was changed; no execution was replaced.",
  "",
  "Both onlineGrade and the final grade are retained. The original online total was 725/750; the requirement-based audited total is 742/750. The [clarification record](../../verification/v3p2/evaluator-clarification.json) documents each rule, and [review notes](review-notes.json) list changed verdicts and remaining failures. The recognizer corrections are a disclosed deviation from the initial operational freeze. Final success counts are audited outcomes, not wholly preregistered automatic scores or blinded independent human adjudication.",
  "",
  "## Scope and interpretation",
  "",
  "Only final exposure differs among the four joint arms. V3 inclusion instructions, thresholds, alphabetical order, top-64 retrieval, model/prompt, per-case budgets and availability policy are unchanged. The explicit cap truncates after inclusion; omitted-cap legacy V3 behavior is preserved. No new parallelism, service split, Systemgate or voice test is added.",
  "",
  "Five repetitions of one authored corpus measure within-scenario variability, not performance on five independent datasets. Small median differences do not establish a general winner. Compare full completion, 5/5 scenario reliability and total spending before considering conditional successful-task speed. The fixture remains the V3 fixture, including its documented sparse/inconsistent analytics fields.",
  "",
  "[Protocol and frozen criteria](../../docs/V3-PART2.md) · [Observations](observations.json) · [Full numerical summary](summary.json)",
  "",
);
const outputs = {
  "summary.json": JSON.stringify(summary, null, 2) + "\n",
  "report.md": lines.join("\n"),
};
for (const [name, text] of Object.entries(outputs)) {
  const path = resolve(out, name);
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== text)
      throw Error("Report drift: " + name);
  } else writeFileSync(path, text);
}
console.log(
  process.argv.includes("--check")
    ? "V3 part 2 report matches observations"
    : JSON.stringify(
        Object.fromEntries(
          MODES.map((m) => [
            m,
            {
              success: byMode[m].successes,
              allFive: byMode[m].scenariosAllFive,
              median: byMode[m].latencyMs.p50,
              cost: byMode[m].totalCostUSD,
            },
          ]),
        ),
      ),
);
