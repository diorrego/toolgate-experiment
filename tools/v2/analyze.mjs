/** Export only allowlisted measurements and deterministically recompute the V2 report. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { MODES, grade, openaiCost, jevUsage } from "./metrics.mjs";
import { verifyState } from "./state.mjs";
const root = resolve(import.meta.dirname, "../..");
const arg = (key) =>
  process.argv.find((a) => a.startsWith(key + "="))?.slice(key.length + 1);
const privateFile = arg("--private"),
  publicFile =
    arg("--observations") ?? resolve(root, "results/v2/observations.json");
const out = arg("--out") ?? resolve(root, "results/v2");
const corpus = JSON.parse(
  readFileSync(resolve(root, "data/v2/corpus.en.json"), "utf8"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const cleanHop = (h) =>
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
  );
let observations;
if (privateFile) {
  const bytes = readFileSync(privateFile),
    raw = JSON.parse(bytes);
  if (
    ((!raw.complete || raw.records.length !== 240) &&
      !process.argv.includes("--interrupted")) ||
    raw.smoke
  )
    throw Error("Only a complete 240-case main run may be exported");
  const records = raw.records.map((r) => {
    const c = corpus.cases.find((c) => c.id === r.caseId);
    if (!c || !MODES.includes(r.mode)) throw Error("Unknown case or condition");
    const expectedGrade = {
      ...grade(r, c),
      persistedMutationCorrect: verifyState(
        c,
        r.finalState,
        corpus.syntheticIds,
      ),
    };
    if (JSON.stringify(expectedGrade) !== JSON.stringify(r.grade))
      throw Error("Raw grading mismatch");
    for (const m of r.modelCalls)
      if (openaiCost(m.usage) !== m.costUSD) throw Error("API price mismatch");
    if (JSON.stringify(jevUsage(r.remote)) !== JSON.stringify(r.jev))
      throw Error("Jev usage mismatch");
    return {
      caseId: r.caseId,
      mode: r.mode,
      effect: c.effect,
      toolset: c.toolset,
      expectedTool: c.tool,
      status: r.status,
      error: r.error ?? null,
      answerCompleteMs: r.answerCompleteMs,
      hostPrepareMs: r.hostPrepareMs ?? null,
      mcpBootstrapMs: r.mcpBootstrapMs,
      grade: r.grade,
      firstSelection: r.firstSelection,
      selectionProposals: r.selectionProposals,
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
      businessCalls: r.businessCalls.map((c) => ({
        tool: c.tool,
        effect: c.effect,
        durationMs: c.durationMs,
        isError: c.isError,
      })),
      preparations: r.preparations.map((p) => ({
        status: p.status,
        selectedTool: p.selected_tool?.tool_id ?? null,
        candidates: p.candidates?.map((c) => c.tool_id) ?? [],
        reason: p.reason ?? null,
      })),
      remote: r.remote.map((m) => ({
        method: m.method,
        path: m.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "{operation_id}"),
        durationMs: m.durationMs,
        attempts: m.attempts,
        status: m.status,
        hops: m.hops.map(cleanHop),
      })),
      resources: r.resources,
      jev: r.jev,
    };
  });
  if (
    new Set(records.map((r) => r.caseId + ":" + r.mode)).size !== records.length
  )
    throw Error("Duplicate matrix cell");
  observations = {
    version: 2,
    complete: raw.complete,
    interrupted: !raw.complete,
    model: raw.model,
    effort: raw.effort,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    rawSha256: hash(bytes),
    fingerprints: raw.fingerprints,
    catalogSize: 143,
    requirements: 60,
    conditions: 4,
    transport: raw.transport,
    limits: raw.limits,
    records,
  };
  mkdirSync(dirname(publicFile), { recursive: true });
  writeFileSync(publicFile, JSON.stringify(observations, null, 2) + "\n");
  if (process.argv.includes("--interrupted")) {
    console.log(
      "Interrupted capture exported separately: " + records.length + " cases",
    );
    process.exit(0);
  }
} else observations = JSON.parse(readFileSync(publicFile, "utf8"));
const pct = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y),
    i = (s.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const stats = (a) => ({
  n: a.length,
  p50: pct(a, 0.5),
  p95: pct(a, 0.95),
  p99: pct(a, 0.99),
  max: a.length ? Math.max(...a) : null,
});
const wilson = (n, total) => {
  if (!total) return null;
  const z = 1.959963984540054,
    p = n / total,
    d = 1 + (z * z) / total,
    center = (p + (z * z) / (2 * total)) / d,
    half =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [center - half, center + half];
};
const sum = (items, fn) => items.reduce((n, x) => n + fn(x), 0);
function summarize(rows) {
  const calls = rows.flatMap((r) => r.modelCalls),
    hops = rows.flatMap((r) => r.remote.flatMap((m) => m.hops)),
    selection = hops.filter((h) => h.jevCalls > 0),
    mutations = rows.filter((r) => r.effect !== "read");
  const bool = (k) => sum(rows, (r) => (r.grade[k] === true ? 1 : 0)),
    selected = rows.filter((r) =>
      r.selectionProposals.some((t) => t !== "woku_guide"),
    ).length;
  const knownOpenai = calls.every((c) => c.costUSD !== null),
    knownJev = rows.every((r) => r.jev.complete);
  const openaiSubtotal = sum(calls, (c) => c.costUSD ?? 0),
    jevSubtotal = sum(rows, (r) => r.jev.cost ?? 0);
  return {
    n: rows.length,
    firstTaskCorrect: bool("firstTaskToolCorrect"),
    selectionAccuracy: bool("firstTaskToolCorrect") / rows.length,
    selectionAccuracyWilson95: wilson(
      bool("firstTaskToolCorrect"),
      rows.length,
    ),
    selectedCases: selected,
    conditionalSelectionPrecision: selected
      ? bool("firstTaskToolCorrect") / selected
      : null,
    unfilteredFirstCorrect: bool("firstToolCorrect"),
    eventualCorrect: bool("eventualToolCorrect"),
    exactArguments: bool("exactArguments"),
    successfulExpectedHandler: bool("successfulExpectedHandler"),
    mutations: mutations.length,
    persistedMutations: sum(mutations, (r) =>
      r.grade.persistedMutationCorrect ? 1 : 0,
    ),
    completedAnswers: rows.filter((r) => r.status === "completed").length,
    abstentions: bool("abstained"),
    ambiguous: bool("ambiguous"),
    correctToolInAmbiguity: bool("correctInCandidates"),
    wrongToolCalls: sum(rows, (r) => r.grade.wrongToolCalls),
    wrongMutationCalls: sum(rows, (r) => r.grade.wrongMutationCalls),
    mcpErrors: sum(rows, (r) => r.mcpCalls.filter((c) => c.isError).length),
    latencyMs: stats(rows.map((r) => r.answerCompleteMs)),
    completedAnswerLatencyMs: stats(
      rows
        .filter((r) => r.status === "completed")
        .map((r) => r.answerCompleteMs),
    ),
    successfulHandlerLatencyMs: stats(
      rows
        .filter((r) => r.grade.successfulExpectedHandler)
        .map((r) => r.answerCompleteMs),
    ),
    hostPrepareMs: stats(
      rows.flatMap((r) => (r.hostPrepareMs === null ? [] : [r.hostPrepareMs])),
    ),
    modelCallMs: stats(calls.map((c) => c.durationMs)),
    mcpCallMs: stats(rows.flatMap((r) => r.mcpCalls.map((c) => c.durationMs))),
    sdkRemoteMs: stats(rows.flatMap((r) => r.remote.map((c) => c.durationMs))),
    selectorWallMs: stats(
      selection.flatMap((h) => (h.selectorMs === null ? [] : [h.selectorMs])),
    ),
    handlerMs: stats(
      rows.flatMap((r) => r.businessCalls.map((c) => c.durationMs)),
    ),
    modelCalls: calls.length,
    modelInputTokens: sum(calls, (c) => c.usage?.input_tokens ?? 0),
    modelCachedInputTokens: sum(
      calls,
      (c) => c.usage?.input_tokens_details?.cached_tokens ?? 0,
    ),
    modelCacheWriteTokens: sum(
      calls,
      (c) => c.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    ),
    modelOutputTokens: sum(calls, (c) => c.usage?.output_tokens ?? 0),
    modelReasoningTokens: sum(
      calls,
      (c) => c.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    ),
    modelUsageComplete: calls.every((c) => c.usage !== null),
    mcpCalls: sum(rows, (r) => r.mcpCalls.length),
    sdkRequests: sum(rows, (r) => sum(r.remote, (m) => m.attempts)),
    jevCalls: sum(rows, (r) => r.jev.calls),
    jevInputTokens: knownJev ? sum(rows, (r) => r.jev.inputTokens) : null,
    jevUsageComplete: knownJev,
    jevMaxConcurrent: Math.max(
      0,
      ...selection.map((h) => h.jevMaxConcurrent ?? 0),
    ),
    knownOpenaiCostUSD: openaiSubtotal,
    knownJevCostUSD: jevSubtotal,
    totalCostUSD: knownOpenai && knownJev ? openaiSubtotal + jevSubtotal : null,
    resources: Object.fromEntries(
      [...new Set(rows.flatMap((r) => Object.keys(r.resources)))].map((k) => [
        k,
        {
          cpuMs: stats(
            rows
              .flatMap((r) =>
                r.resources[k]?.cpuMs === null ? [] : [r.resources[k]?.cpuMs],
              )
              .filter(Number.isFinite),
          ),
          peakRssKiB: stats(
            rows
              .flatMap((r) =>
                r.resources[k]?.peakRssKiB === null
                  ? []
                  : [r.resources[k]?.peakRssKiB],
              )
              .filter(Number.isFinite),
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
      ["read", "mutation"].map((stratum) => [
        stratum,
        summarize(
          observations.records.filter(
            (r) =>
              r.mode === mode && (r.effect === "read") === (stratum === "read"),
          ),
        ),
      ]),
    ),
  ]),
);
const comparisons = MODES.slice(1).map((mode) => {
  const pairs = corpus.cases.map((c) => [
    observations.records.find((r) => r.mode === "direct" && r.caseId === c.id),
    observations.records.find((r) => r.mode === mode && r.caseId === c.id),
  ]);
  return {
    mode,
    pairedLatencyDifferenceMs: stats(
      pairs.map(([a, b]) => b.answerCompleteMs - a.answerCompleteMs),
    ),
    bothCorrect: pairs.filter(
      ([a, b]) => a.grade.firstTaskToolCorrect && b.grade.firstTaskToolCorrect,
    ).length,
    directOnlyCorrect: pairs.filter(
      ([a, b]) => a.grade.firstTaskToolCorrect && !b.grade.firstTaskToolCorrect,
    ).length,
    toolgateOnlyCorrect: pairs.filter(
      ([a, b]) => !a.grade.firstTaskToolCorrect && b.grade.firstTaskToolCorrect,
    ).length,
    neitherCorrect: pairs.filter(
      ([a, b]) =>
        !a.grade.firstTaskToolCorrect && !b.grade.firstTaskToolCorrect,
    ).length,
  };
});
const summary = {
  model: observations.model,
  requirements: 60,
  catalogSize: 143,
  byMode,
  strata,
  comparisons,
};
const label = {
  direct: "Direct MCP",
  "design-1": "Design 1",
  "design-2": "Design 2",
  "design-3": "Design 3",
};
const seconds = (x) => (x / 1000).toFixed(2),
  money = (x) => (x === null ? "unknown" : "$" + x.toFixed(6));
const lines = [
  "# V2 results: selection accuracy with 143 tools",
  "",
  `Model: ${observations.model}/high via Responses API. 60 requirements per condition, 30 reads and 30 mutations.`,
  "",
  `Run: ${observations.startedAt} to ${observations.completedAt}.`,
  "",
  "## Primary and execution outcomes",
  "",
  "| Condition | First task tool | Eventual correct tool | Exact arguments | Expected handler succeeded | Persisted mutations |",
  "|---|---:|---:|---:|---:|---:|",
];
for (const mode of MODES) {
  const s = byMode[mode];
  lines.push(
    `| ${label[mode]} | ${s.firstTaskCorrect}/60 | ${s.eventualCorrect}/60 | ${s.exactArguments}/60 | ${s.successfulExpectedHandler}/60 | ${s.persistedMutations}/30 |`,
  );
}
lines.push(
  "",
  "The first task-tool metric excludes the optional woku_guide discovery step. All discovery calls remain in time, token and cost totals. No-match, missing execution and failed cases remain in the denominator.",
  "",
  "## Latency and estimated API cost",
  "",
  "| Condition | Median task time | p95 | API calls | Jev calls | Total estimated USD |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const mode of MODES) {
  const s = byMode[mode];
  lines.push(
    `| ${label[mode]} | ${seconds(s.latencyMs.p50)} s | ${seconds(s.latencyMs.p95)} s | ${s.modelCalls} | ${s.jevCalls} | ${money(s.totalCostUSD)} |`,
  );
}
lines.push(
  "",
  "These are token-based API estimates, not reconciled invoices. Cache reads and writes use their respective prices. Missing usage is unknown, not zero. All cases contribute to task time, including failures and turn-limit termination. Completed-answer latency is reported separately in the numerical summary.",
  "",
  "## Selector behavior and errors",
  "",
  "| Condition | First preparation abstentions | Ambiguities | Correct tool in ambiguity | MCP errors | Wrong mutation attempts |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const mode of MODES) {
  const s = byMode[mode];
  lines.push(
    `| ${label[mode]} | ${s.abstentions} | ${s.ambiguous} | ${s.correctToolInAmbiguity} | ${s.mcpErrors} | ${s.wrongMutationCalls} |`,
  );
}
lines.push(
  "",
  "## Paired comparison to direct MCP",
  "",
  "| Condition | Median paired latency difference | Direct only correct | Toolgate only correct | Both correct |",
  "|---|---:|---:|---:|---:|",
);
for (const p of comparisons)
  lines.push(
    `| ${label[p.mode]} | ${seconds(p.pairedLatencyDifferenceMs.p50)} s | ${p.directOnlyCorrect} | ${p.toolgateOnlyCorrect} | ${p.bothCorrect} |`,
  );
lines.push(
  "",
  "## Scope and limits",
  "",
  "This is one authored 60-case corpus, one serial local run and one Go configuration. It does not establish universal accuracy, a language winner, large-load performance, production safety or sending/refund execution. Toolgate retrieves at most 64 candidates from the full catalog; Choice initially evaluates at most 32, binary evaluates retrieved candidates with concurrency at most 22.",
  "",
  "The summary includes read/mutation strata, Wilson intervals, descriptive p99, per-hop timings, token categories, CPU and RSS. Small-sample tail estimates and confidence intervals do not account for corpus-selection bias or repeated-run variability.",
  "",
  "[Protocol](../../docs/V2-ACCURACY.md), [observations](observations.json), [full numerical summary](summary.json).",
  "",
);
mkdirSync(out, { recursive: true });
const summaryText = JSON.stringify(summary, null, 2) + "\n",
  reportText = lines.join("\n");
if (process.argv.includes("--check")) {
  if (
    readFileSync(resolve(out, "summary.json"), "utf8") !== summaryText ||
    readFileSync(resolve(out, "report.md"), "utf8") !== reportText
  )
    throw Error("V2 report drift");
  console.log("V2 observations and numerical report match");
} else {
  writeFileSync(resolve(out, "summary.json"), summaryText);
  writeFileSync(resolve(out, "report.md"), reportText);
  console.log(JSON.stringify(byMode, null, 2));
}
