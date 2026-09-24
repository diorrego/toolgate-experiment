import { resolveIds, subset } from "./state.mjs";
export { MODES, schedule, openaiCost, jevUsage } from "../v2/metrics.mjs";
export function grade(record, oracle, ids) {
  const trace = record.businessTrace ?? [],
    matched = new Map();
  for (const step of oracle.steps) {
    const args = resolveIds(step.arguments, ids);
    const found = trace.findIndex(
      (call, index) =>
        !call.isError &&
        (step.resultIncludes ?? []).every((value) =>
          JSON.stringify(call.result).includes(resolveIds(value, ids)),
        ) &&
        [step.tool, ...step.alternatives].includes(call.tool) &&
        // Equivalent discovery search is accepted only when downstream IDs are actually grounded.
        (call.tool !== step.tool || subset(call.arguments, args)) &&
        step.dependsOn.every(
          (dep) =>
            matched.has(dep) &&
            matched.get(dep) < index &&
            trace[matched.get(dep)].endedMs <= call.startedMs,
        ),
    );
    if (found >= 0) matched.set(step.id, found);
  }
  const grounded = [];
  for (let i = 0; i < trace.length; i++) {
    const call = trace[i];
    if (call.isError) continue;
    const idValues =
      JSON.stringify(call.arguments).match(/\b[0-9a-f]{24}\b/g) ?? [];
    const past = trace
      .slice(0, i)
      .filter((c) => !c.isError && c.endedMs <= call.startedMs)
      .map((c) => JSON.stringify(c.result))
      .join("\n");
    grounded.push(...idValues.map((id) => past.includes(id)));
  }
  const expected = new Set(oracle.steps.map((s) => s.tool));
  const acceptable = new Set(
    oracle.steps.flatMap((s) => [s.tool, ...s.alternatives]),
  );
  const selected =
    record.preparations?.[0]?.operations?.map((o) => o.selected_tool.tool_id) ??
    [];
  const hits = selected.filter((t) => acceptable.has(t)).length;
  const requiredCovered = oracle.steps.filter((s) =>
    [s.tool, ...s.alternatives].some((t) => selected.includes(t)),
  ).length;
  const allowedWrites = oracle.steps.filter((s) => s.id === "write");
  const mutations = (record.businessCalls ?? []).filter(
    (c) => c.effect !== "read",
  );
  const wrongMutationCalls = mutations.filter(
    (c) =>
      !allowedWrites.some(
        (s) =>
          s.tool === c.tool &&
          subset(c.arguments, resolveIds(s.arguments, ids)),
      ),
  ).length;
  const facts = (oracle.answerFacts ?? []).map((f) => ({
    fact: f,
    present: (record.answer ?? "").toLowerCase().includes(f.toLowerCase()),
  }));
  return {
    expectedDistinctTools: expected.size,
    expectedSteps: oracle.steps.length,
    matchedSteps: matched.size,
    steps: Object.fromEntries(
      oracle.steps.map((s) => [s.id, matched.has(s.id)]),
    ),
    completeSequence: matched.size === oracle.steps.length,
    groundedIds: grounded.every(Boolean),
    groundedIdCount: grounded.filter(Boolean).length,
    idArgumentCount: grounded.length,
    initialSelectedCount: selected.length,
    initialPrecision:
      record.mode === "direct"
        ? null
        : selected.length
          ? hits / selected.length
          : 0,
    initialStepCoverage:
      record.mode === "direct" ? null : requiredCovered / oracle.steps.length,
    initialCompleteCoverage:
      record.mode === "direct" ? null : requiredCovered === oracle.steps.length,
    extraBusinessCalls: trace.filter(
      (c) => !acceptable.has(c.tool) && c.tool !== "woku_guide",
    ).length,
    wrongMutationCalls,
    mutationInvocations: mutations.length,
    answerFacts: facts,
    answerFactsComplete: facts.every((f) => f.present),
    preparations: record.preparations?.length ?? 0,
  };
}
