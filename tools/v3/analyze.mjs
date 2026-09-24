/** Export allowlisted observations and recompute the complete V3 report. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { MODES, grade, openaiCost, jevUsage } from "./metrics.mjs";
import { verifyState } from "./state.mjs";
const root = resolve(import.meta.dirname, "../.."),
  arg = (k) =>
    process.argv.find((a) => a.startsWith(k + "="))?.slice(k.length + 1),
  source = arg("--private");
const dir = resolve(root, "results/v3"),
  obsPath = resolve(dir, "observations.json"),
  corpus = JSON.parse(readFileSync(resolve(root, "data/v3/corpus.en.json")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
let observations;
if (source) {
  const bytes = readFileSync(source),
    raw = JSON.parse(bytes);
  if (!raw.complete || raw.smoke || raw.records.length !== 120)
    throw Error("Only the complete 120-cell main matrix can be exported");
  const records = raw.records.map((r) => {
    const c = corpus.cases.find((c) => c.id === r.caseId);
    if (!c || !MODES.includes(r.mode)) throw Error("Unknown matrix cell");
    const g = grade(r, c, r.oracleIds);
    g.state = verifyState(c, r.baselineState, r.finalState, r.oracleIds);
    g.workflowSuccess =
      g.completeSequence &&
      g.groundedIds &&
      g.state.correct &&
      g.wrongMutationCalls === 0;
    g.endToEndSuccess = g.workflowSuccess && r.status === "completed";
    if (JSON.stringify(g) !== JSON.stringify(r.grade))
      throw Error("Grading drift");
    for (const call of r.modelCalls)
      if (openaiCost(call.usage) !== call.costUSD) throw Error("Cost drift");
    if (JSON.stringify(jevUsage(r.remote)) !== JSON.stringify(r.jev))
      throw Error("Jev usage drift");
    const events = r.businessTrace
      .flatMap((c) => [
        [c.startedMs, 1],
        [c.endedMs, -1],
      ])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0,
      peak = 0;
    for (const [, delta] of events) {
      active += delta;
      peak = Math.max(peak, active);
    }
    return {
      caseId: r.caseId,
      mode: r.mode,
      effect: c.effect,
      status: r.status,
      error: r.error ?? null,
      taskMs: r.answerCompleteMs,
      hostPrepareMs: r.hostPrepareMs ?? null,
      mcpBootstrapMs: r.mcpBootstrapMs,
      grade: g,
      modelCalls: r.modelCalls.map((m) => ({
        durationMs: m.durationMs,
        httpStatus: m.httpStatus,
        model: m.model,
        status: m.status,
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
        durationMs: b.durationMs,
        isError: b.isError,
      })),
      nativeMaxConcurrent: peak,
      preparations: r.preparations.map((p) => ({
        status: p.status,
        candidateCount: p.candidate_count,
        selected: p.operations.map((o) => o.selected_tool.tool_id),
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
            ].map((k) => [k, h[k] ?? null]),
          ),
        ),
      })),
      resources: r.resources,
      jev: r.jev,
    };
  });
  if (new Set(records.map((r) => r.caseId + ":" + r.mode)).size !== 120)
    throw Error("Duplicate cells");
  observations = {
    version: 3,
    complete: true,
    model: raw.model,
    effort: raw.effort,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    rawSha256: sha(bytes),
    fingerprints: raw.fingerprints,
    catalogSize: 143,
    requirements: 30,
    conditions: 4,
    limits: raw.limits,
    transport: raw.transport,
    records,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(obsPath, JSON.stringify(observations, null, 2) + "\n");
} else observations = JSON.parse(readFileSync(obsPath));
const sum = (a, f) => a.reduce((n, x) => n + f(x), 0),
  pct = (a, p) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y),
      i = (s.length - 1) * p;
    return (
      s[Math.floor(i)] +
      (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i))
    );
  };
const stats = (a) => ({
  n: a.length,
  p50: pct(a, 0.5),
  p95: pct(a, 0.95),
  p99: pct(a, 0.99),
  max: a.length ? Math.max(...a) : null,
});
function wilson(n, total) {
  const z = 1.959963984540054,
    p = n / total,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return [c - h, c + h];
}
function summarize(rows) {
  const models = rows.flatMap((r) => r.modelCalls),
    remote = rows.flatMap((r) => r.remote),
    hops = remote.flatMap((r) => r.hops),
    business = rows.flatMap((r) => r.businessCalls),
    gates = rows.filter((r) => r.mode !== "direct"),
    mutations = rows.filter((r) => r.effect === "write"),
    count = (k) => rows.filter((r) => r.grade[k] === true).length;
  const knownModel = models.every((m) => m.costUSD !== null),
    knownJev = rows.every((r) => r.jev.complete),
    modelSubtotal = sum(models, (m) => m.costUSD ?? 0),
    jevSubtotal = sum(hops, (h) => ((h.jevInputTokens ?? 0) * 0.042) / 1e6);
  return {
    n: rows.length,
    serialTimedTaskThroughputCasesPerSecond:
      rows.length / (sum(rows, (r) => r.taskMs) / 1000),
    timedOutCases: rows.filter((r) =>
      /TIMEOUT|DEADLINE|aborted/i.test(r.error ?? ""),
    ).length,
    workflowSuccess: count("workflowSuccess"),
    workflowWilson95: wilson(count("workflowSuccess"), rows.length),
    endToEndSuccess: count("endToEndSuccess"),
    completeSequence: count("completeSequence"),
    groundedIds: count("groundedIds"),
    expectedSteps: sum(rows, (r) => r.grade.expectedSteps),
    matchedSteps: sum(rows, (r) => r.grade.matchedSteps),
    idArgumentCount: sum(rows, (r) => r.grade.idArgumentCount),
    groundedIdCount: sum(rows, (r) => r.grade.groundedIdCount),
    stateCorrect: rows.filter((r) => r.grade.state.correct).length,
    mutations: mutations.length,
    mutationsCorrect: mutations.filter((r) => r.grade.state.correct).length,
    completedAnswers: rows.filter((r) => r.status === "completed").length,
    answerFactsComplete: count("answerFactsComplete"),
    wrongMutationCalls: sum(rows, (r) => r.grade.wrongMutationCalls),
    extraBusinessCalls: sum(rows, (r) => r.grade.extraBusinessCalls),
    initialCompleteCoverage: gates.length
      ? gates.filter((r) => r.grade.initialCompleteCoverage).length
      : null,
    meanInitialPrecision: gates.length
      ? sum(gates, (r) => r.grade.initialPrecision) / gates.length
      : null,
    meanInitialStepCoverage: gates.length
      ? sum(gates, (r) => r.grade.initialStepCoverage) / gates.length
      : null,
    preparations: sum(rows, (r) => r.preparations.length),
    casesWithFurtherPreparation: gates.filter((r) => r.preparations.length > 1)
      .length,
    abstentions: sum(
      rows,
      (r) => r.preparations.filter((p) => p.status === "no_match").length,
    ),
    refinements: sum(
      rows,
      (r) =>
        r.preparations.filter((p) => p.status === "needs_refinement").length,
    ),
    mcpErrors: sum(rows, (r) => r.mcpCalls.filter((m) => m.isError).length),
    handlerErrors: business.filter((b) => b.isError).length,
    latencyMs: stats(rows.map((r) => r.taskMs)),
    completedAnswerLatencyMs: stats(
      rows.filter((r) => r.status === "completed").map((r) => r.taskMs),
    ),
    successfulWorkflowLatencyMs: stats(
      rows.filter((r) => r.grade.workflowSuccess).map((r) => r.taskMs),
    ),
    hostPrepareMs: stats(
      rows.flatMap((r) => (r.hostPrepareMs === null ? [] : [r.hostPrepareMs])),
    ),
    modelCallMs: stats(models.map((m) => m.durationMs)),
    mcpCallMs: stats(rows.flatMap((r) => r.mcpCalls.map((m) => m.durationMs))),
    sdkRemoteMs: stats(remote.map((m) => m.durationMs)),
    selectorWallMs: stats(
      hops
        .filter((h) => h.jevCalls > 0 && h.selectorMs !== null)
        .map((h) => h.selectorMs),
    ),
    handlerMs: stats(business.map((b) => b.durationMs)),
    modelCalls: models.length,
    modelUsageComplete: models.every((m) => m.usage !== null),
    modelCallsWithoutUsage: models.filter((m) => m.usage === null).length,
    modelInputTokens: sum(models, (m) => m.usage?.input_tokens ?? 0),
    modelCachedInputTokens: sum(
      models,
      (m) => m.usage?.input_tokens_details?.cached_tokens ?? 0,
    ),
    modelCacheWriteTokens: sum(
      models,
      (m) => m.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    ),
    modelOutputTokens: sum(models, (m) => m.usage?.output_tokens ?? 0),
    modelReasoningTokens: sum(
      models,
      (m) => m.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    ),
    mcpCalls: sum(rows, (r) => r.mcpCalls.length),
    sdkRequests: sum(remote, (m) => m.attempts),
    businessCalls: business.length,
    jevCalls: sum(rows, (r) => r.jev.calls),
    jevInputTokens: knownJev ? sum(rows, (r) => r.jev.inputTokens) : null,
    jevOutputTokens: knownJev ? sum(rows, (r) => r.jev.outputTokens) : null,
    jevUsageComplete: knownJev,
    jevHopsWithoutCompleteUsage: hops.filter(
      (h) => h.jevCalls === null || h.jevUsageCalls !== h.jevCalls,
    ).length,
    jevMaxConcurrent: Math.max(0, ...hops.map((h) => h.jevMaxConcurrent ?? 0)),
    nativeMaxConcurrent: Math.max(0, ...rows.map((r) => r.nativeMaxConcurrent)),
    knownOpenaiCostUSD: modelSubtotal,
    knownJevCostUSD: jevSubtotal,
    totalCostUSD: knownModel && knownJev ? modelSubtotal + jevSubtotal : null,
    resources: Object.fromEntries(
      [...new Set(rows.flatMap((r) => Object.keys(r.resources)))].map((k) => [
        k,
        {
          cpuMs: stats(
            rows.map((r) => r.resources[k]?.cpuMs).filter(Number.isFinite),
          ),
          peakRssKiB: stats(
            rows.map((r) => r.resources[k]?.peakRssKiB).filter(Number.isFinite),
          ),
        },
      ]),
    ),
  };
}
const byMode = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    summarize(observations.records.filter((r) => r.mode === mode)),
  ]),
);
const strata = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    Object.fromEntries(
      ["read", "write"].map((effect) => [
        effect,
        summarize(
          observations.records.filter(
            (r) => r.mode === mode && r.effect === effect,
          ),
        ),
      ]),
    ),
  ]),
);
const comparisons = MODES.slice(1).map((mode) => {
  const pairs = corpus.cases.map((c) => [
    observations.records.find((r) => r.caseId === c.id && r.mode === "direct"),
    observations.records.find((r) => r.caseId === c.id && r.mode === mode),
  ]);
  return {
    mode,
    pairedLatencyDifferenceMs: stats(
      pairs.map(([a, b]) => b.taskMs - a.taskMs),
    ),
    bothSucceeded: pairs.filter(
      ([a, b]) => a.grade.workflowSuccess && b.grade.workflowSuccess,
    ).length,
    directOnly: pairs.filter(
      ([a, b]) => a.grade.workflowSuccess && !b.grade.workflowSuccess,
    ).length,
    gateOnly: pairs.filter(
      ([a, b]) => !a.grade.workflowSuccess && b.grade.workflowSuccess,
    ).length,
    neither: pairs.filter(
      ([a, b]) => !a.grade.workflowSuccess && !b.grade.workflowSuccess,
    ).length,
  };
});
const review = JSON.parse(readFileSync(resolve(dir, "review-notes.json")));
if (review.rawSha256 !== observations.rawSha256)
  throw Error("Review capture mismatch");
const summary = {
  model: observations.model,
  requirements: 30,
  catalogSize: 143,
  matrixThroughputCasesPerSecond:
    observations.records.length /
    ((Date.parse(observations.completedAt) -
      Date.parse(observations.startedAt)) /
      1000),
  matrixWallSeconds:
    (Date.parse(observations.completedAt) -
      Date.parse(observations.startedAt)) /
    1000,
  byMode,
  strata,
  comparisons,
  secondaryReview: { status: review.status, byMode: review.byMode },
};
const label = {
    direct: "Direct MCP",
    "design-1": "Design 1: agent first",
    "design-2": "Design 2: host first, joint",
    "design-3": "Design 3: host first, parallel",
  },
  seconds = (x) => (x / 1000).toFixed(2),
  money = (x) => (x === null ? "unknown" : "$" + x.toFixed(6)),
  percent = (x) => (x === null ? "n/a" : (100 * x).toFixed(1) + "%");
const lines = [
  "# V3 results: dependent multi-tool workflows",
  "",
  `GPT-6 Luna/high, Jev 1.13.0, Go. 143 tools, 30 requirements per condition, 15 reads and 15 mutations.`,
  `Run: ${observations.startedAt} to ${observations.completedAt}.`,
  "",
  "## Workflow execution",
  "",
  "| Condition | Reference workflow succeeded | Final answers | Correct mutation state | Median task time | p95 | Estimated USD per 30 |",
  "|---|---:|---:|---:|---:|---:|---:|",
];
for (const m of MODES) {
  const s = byMode[m];
  lines.push(
    `| ${label[m]} | ${s.workflowSuccess}/30 | ${s.completedAnswers}/30 | ${s.mutationsCorrect}/15 | ${seconds(s.latencyMs.p50)} s | ${seconds(s.latencyMs.p95)} s | ${money(s.totalCostUSD)} |`,
  );
}
lines.push(
  "",
  "Workflow success requires all reference steps, IDs grounded in prior successful outputs, expected state and no non-reference mutation invocation. It does not certify the wording of the final answer. All cases, including failures, contribute to task times. Completed-answer and successful-workflow times are also reported separately.",
  "",
  "## Initial selection and recovery",
  "",
  "| Condition | Initial complete step coverage | Mean reference precision | Mean initial step coverage | Cases with further preparation | Total preparations |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const m of MODES.slice(1)) {
  const s = byMode[m];
  lines.push(
    `| ${label[m]} | ${s.initialCompleteCoverage}/30 | ${percent(s.meanInitialPrecision)} | ${percent(s.meanInitialStepCoverage)} | ${s.casesWithFurtherPreparation}/30 | ${s.preparations} |`,
  );
}
lines.push(
  "",
  "Direct MCP has no separate preparation stage. These are macro averages; empty initial sets contribute zero. Coverage counts required steps whose tool type or declared discovery alternative is selected, including repeated uses. All recovery requests stay in accounting.",
  "",
  "## Calls and errors",
  "",
  "| Condition | OpenAI calls | Jev calls | MCP calls | Business calls | MCP errors | Handler errors | Non-reference mutation invocations |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
);
for (const m of MODES) {
  const s = byMode[m];
  lines.push(
    `| ${label[m]} | ${s.modelCalls} | ${s.jevCalls} | ${s.mcpCalls} | ${s.businessCalls} | ${s.mcpErrors} | ${s.handlerErrors} | ${s.wrongMutationCalls} |`,
  );
}
lines.push(
  "",
  "## Paired comparison to direct MCP",
  "",
  "| Condition | Median paired time difference | Direct only succeeded | Gate only succeeded | Both succeeded |",
  "|---|---:|---:|---:|---:|",
);
for (const p of comparisons)
  lines.push(
    `| ${label[p.mode]} | ${seconds(p.pairedLatencyDifferenceMs.p50)} s | ${p.directOnly} | ${p.gateOnly} | ${p.bothSucceeded} |`,
  );
lines.push(
  "",
  "## Secondary interpretation audit",
  "",
  "The frozen reference missed a valid alternative in V3-13/design-1: list_generated_reports -> get_folder -> get_folder_report. It also failed to require member names in V3-08: designs 1 and 3 returned IDs and roles without resolving names, while direct MCP and design 2 resolved them. These are different limits of a path-based oracle.",
  "",
  `A separate post-run review accepts verified alternatives and requires member names. Its completed-request counts are ${MODES.map((mode) => label[mode] + " " + review.byMode[mode].reviewedCompletion + "/30").join(", ")}. This review was performed by Codex, is not blinded independent adjudication, and does not replace the original scores. See [review evidence and fixture limitations](review-notes.json).`,
  "",
  "Two MCP errors were recovered: V3-03/design-3 reused an issued operation for another argument set (OPERATION_ALREADY_ISSUED); V3-12/design-1 supplied an unknown operation ID (OPERATION_NOT_FOUND). Neither error invoked a business handler. All 60 mutation states were correct, and no non-reference mutation handler was invoked.",
  "",
  "## Limits",
  "",
  "One authored corpus, one local serial matrix, shared caching and live APIs. This is not a production-safety, refund, load or Go-versus-Rust study. The reference oracle cannot enumerate every valid alternative workflow. Literal answer facts are diagnostic only. Wilson intervals and p99 in the summary are descriptive and do not include corpus-selection bias or repeated-run variability.",
  "",
  "Jev sees at most 64 authorized lexical candidates. Joint mode batches independent inclusion questions in one request; parallel mode submits separate requests with concurrency at most 22. Each preparation returns at most eight tools. The larger budget and changed multi-label selection make V2-to-V3 causal latency claims inappropriate.",
  "",
  "Costs include reported cache partitions and all attempts; estimates are not invoices. Unknown usage is never filled with zero. No failed cell was replaced.",
  "",
  "[Protocol](../../docs/V3-WORKFLOWS.md) · [30 requirements](../../data/v3/corpus.en.json) · [Observations](observations.json) · [Numerical summary](summary.json)",
  "",
);
const summaryText = JSON.stringify(summary, null, 2) + "\n",
  reportText = lines.join("\n");
if (process.argv.includes("--check")) {
  if (
    readFileSync(resolve(dir, "summary.json"), "utf8") !== summaryText ||
    readFileSync(resolve(dir, "report.md"), "utf8") !== reportText
  )
    throw Error("V3 report drift");
  console.log("V3 observations and report match");
} else {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "summary.json"), summaryText);
  writeFileSync(resolve(dir, "report.md"), reportText);
  console.log(JSON.stringify(byMode, null, 2));
}
