import { MODES } from "./schedule.mjs";
export const sum = (xs, f = (x) => x) => xs.reduce((n, x) => n + f(x), 0);
export function quantile(xs, p) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y),
    i = (a.length - 1) * p;
  return (
    a[Math.floor(i)] +
    (a[Math.ceil(i)] - a[Math.floor(i)]) * (i - Math.floor(i))
  );
}
export const stats = (xs) => ({
  n: xs.length,
  p50: quantile(xs, 0.5),
  p95: quantile(xs, 0.95),
  max: xs.length ? Math.max(...xs) : null,
});
export function lossAt(tool, events, remote) {
  if (events.some((e) => e.exposed.includes(tool))) return "exposed";
  const traces = events.flatMap((e) =>
    remote
      .slice(e.remoteStart, e.remoteEnd)
      .flatMap((m) => m.hops.map((h) => h.toolStages)),
  );
  if (!traces.length || traces.some((t) => !t)) return "unobserved";
  if (traces.every((t) => !t.retrieved.includes(tool))) return "preselection";
  const eligible = traces.filter((t) => t.retrieved.includes(tool));
  if (eligible.some((t) => t.included === null)) return "inclusion_unobserved";
  if (eligible.every((t) => !t.included.includes(tool))) return "inclusion";
  const positives = eligible.filter((t) => t.included.includes(tool));
  if (positives.some((t) => t.exposed === null)) return "exposure_unobserved";
  return positives.some((t) => t.exposed.includes(tool))
    ? "delivery_error"
    : "final_cut";
}
export function exposure(record, oracle) {
  const events = record.preparationEvents ?? [],
    exposed =
      record.mode === "direct" ? null : events.flatMap((e) => e.exposed),
    used = [...new Set(record.businessCalls.map((c) => c.tool))];
  return {
    preparationsRequested: record.mcpCalls.filter(
      (c) => c.name === "prepare_workflow",
    ).length,
    additionalPreparations:
      record.mode === "direct"
        ? 0
        : Math.max(
            0,
            record.mcpCalls.filter((c) => c.name === "prepare_workflow")
              .length - 1,
          ),
    perPreparation: events.map((e) => ({
      status: e.status,
      error: e.error,
      tools: e.exposed,
      count: e.exposed.length,
    })),
    exposureOccurrences: exposed?.length ?? 143,
    distinctExposed: exposed ? new Set(exposed).size : 143,
    distinctUsed: used.length,
    usedTools: used,
    exposedButUnused: exposed
      ? [...new Set(exposed)].filter((t) => !used.includes(t)).length
      : 143 - used.length,
    usedWithoutExposure: exposed
      ? used.filter((t) => !exposed.includes(t))
      : [],
    firstLoss: exposed
      ? Object.fromEntries(
          oracle.referenceTools.map((t) => [
            t,
            lossAt(t, events.slice(0, 1), record.remote),
          ]),
        )
      : null,
    cumulativeLoss: exposed
      ? Object.fromEntries(
          oracle.referenceTools.map((t) => [
            t,
            lossAt(t, events, record.remote),
          ]),
        )
      : null,
  };
}
export function summarize(rows, expectedRepeats = 5) {
  const calls = rows.flatMap((r) => r.modelCalls),
    hops = rows.flatMap((r) => r.remote.flatMap((m) => m.hops));
  const completeAgent = calls.every((c) => c.costUSD !== null),
    completeJev = rows.every((r) => r.jev.complete);
  const agentCost = sum(calls, (c) => c.costUSD ?? 0),
    jevCost = sum(hops, (h) => ((h.jevInputTokens ?? 0) * 0.042) / 1e6),
    success = rows.filter((r) => r.grade.success);
  const scenarios = [...new Set(rows.map((r) => r.caseId))].map((id) => {
    const r = rows.filter((r) => r.caseId === id);
    return {
      caseId: id,
      attempts: r.length,
      successes: r.filter((r) => r.grade.success).length,
      allFive: r.length === expectedRepeats && r.every((r) => r.grade.success),
      latencyMs: stats(r.map((r) => r.taskMs)),
    };
  });
  const loss = (kind) => {
    const counts = {};
    for (const r of rows)
      for (const label of Object.values(r.exposure[kind] ?? {}))
        counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  };
  const mutations = rows.filter((r) => r.effect !== "read");
  const prepSizes = rows.flatMap((r) =>
    r.exposure.perPreparation.map((p) => p.count),
  );
  return {
    executions: rows.length,
    onlineSuccesses: rows.filter((r) => r.onlineGrade?.success).length,
    parserClarifications: rows.filter(
      (r) => r.onlineGrade && r.onlineGrade.success !== r.grade.success,
    ).length,
    successes: success.length,
    successRate: rows.length ? success.length / rows.length : null,
    scenariosAllFive: scenarios.filter((s) => s.allFive).length,
    scenarioSuccessDistribution: Array.from(
      { length: 6 },
      (_, n) => scenarios.filter((s) => s.successes === n).length,
    ),
    scenarios,
    finalAnswers: rows.filter((r) => r.status === "completed").length,
    correctMutationStates: mutations.filter((r) => r.grade.state.correct)
      .length,
    mutationCases: mutations.length,
    improperMutationInvocations: sum(rows, (r) => r.grade.improperMutations),
    latencyMs: stats(rows.map((r) => r.taskMs)),
    successfulLatencyMs: stats(success.map((r) => r.taskMs)),
    failedLatencyMs: stats(
      rows.filter((r) => !r.grade.success).map((r) => r.taskMs),
    ),
    agent: {
      calls: calls.length,
      inputTokens: sum(calls, (c) => c.usage?.input_tokens ?? 0),
      cachedTokens: sum(
        calls,
        (c) => c.usage?.input_tokens_details?.cached_tokens ?? 0,
      ),
      cacheWriteTokens: sum(
        calls,
        (c) => c.usage?.input_tokens_details?.cache_write_tokens ?? 0,
      ),
      outputTokens: sum(calls, (c) => c.usage?.output_tokens ?? 0),
      usageComplete: completeAgent,
      knownCostUSD: agentCost,
      totalCostUSD: completeAgent ? agentCost : null,
    },
    jev: {
      calls: sum(rows, (r) => r.jev.calls),
      inputTokens: sum(hops, (h) => h.jevInputTokens ?? 0),
      outputTokens: sum(hops, (h) => h.jevOutputTokens ?? 0),
      usageComplete: completeJev,
      knownCostUSD: jevCost,
      totalCostUSD: completeJev ? jevCost : null,
    },
    totalCostUSD: completeAgent && completeJev ? agentCost + jevCost : null,
    costPerSuccessfulExecutionUSD:
      completeAgent && completeJev && success.length
        ? (agentCost + jevCost) / success.length
        : null,
    preparationsRequested: sum(rows, (r) => r.exposure.preparationsRequested),
    additionalPreparations: sum(rows, (r) => r.exposure.additionalPreparations),
    casesWithAdditionalPreparations: rows.filter(
      (r) => r.exposure.additionalPreparations > 0,
    ).length,
    exposedPerPreparation: stats(prepSizes),
    meanExposedPerPreparation: prepSizes.length
      ? sum(prepSizes) / prepSizes.length
      : null,
    meanDistinctExposed: rows.length
      ? sum(rows, (r) => r.exposure.distinctExposed) / rows.length
      : null,
    meanDistinctUsed: rows.length
      ? sum(rows, (r) => r.exposure.distinctUsed) / rows.length
      : null,
    unusedExposureOccurrences: sum(rows, (r) => r.exposure.exposedButUnused),
    firstLoss: loss("firstLoss"),
    cumulativeLoss: loss("cumulativeLoss"),
    mcpCalls: sum(rows, (r) => r.mcpCalls.length),
    mcpErrors: sum(rows, (r) => r.mcpCalls.filter((c) => c.isError).length),
    businessCalls: sum(rows, (r) => r.businessCalls.length),
    remoteAttempts: sum(rows, (r) => sum(r.remote, (m) => m.attempts)),
    resources: Object.fromEntries(
      [...new Set(rows.flatMap((r) => Object.keys(r.resources)))].map((key) => [
        key,
        {
          cpuMs: stats(
            rows.map((r) => r.resources[key]?.cpuMs).filter(Number.isFinite),
          ),
          peakRssKiB: stats(
            rows
              .map((r) => r.resources[key]?.peakRssKiB)
              .filter(Number.isFinite),
          ),
        },
      ]),
    ),
  };
}
export function comparisons(rows) {
  const result = [];
  for (const control of ["direct", "joint-8"])
    for (const mode of MODES.filter((m) => m !== control)) {
      const scenarios = [...new Set(rows.map((r) => r.caseId))].map(
        (caseId) => {
          const pairs = rows
            .filter((r) => r.caseId === caseId && r.mode === mode)
            .map((r) => {
              const c = rows.find(
                (c) =>
                  c.caseId === caseId &&
                  c.repeat === r.repeat &&
                  c.mode === control,
              );
              if (!c) throw Error("Missing paired control");
              return {
                repeat: r.repeat,
                differenceMs: r.taskMs - c.taskMs,
                conditionSuccess: r.grade.success,
                controlSuccess: c.grade.success,
              };
            });
          return {
            caseId,
            pairs,
            medianDifferenceMs: quantile(
              pairs.map((p) => p.differenceMs),
              0.5,
            ),
          };
        },
      );
      result.push({
        control,
        mode,
        perScenario: scenarios,
        pairedDifferencesMs: stats(
          scenarios.flatMap((s) => s.pairs.map((p) => p.differenceMs)),
        ),
        scenarioMedianDifferencesMs: stats(
          scenarios.map((s) => s.medianDifferenceMs),
        ),
        fasterScenarios: scenarios.filter((s) => s.medianDifferenceMs < 0)
          .length,
      });
    }
  return result;
}
