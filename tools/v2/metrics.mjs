import { isDeepStrictEqual } from "node:util";
export const MODES = ["direct", "design-1", "design-2", "design-3"];
export function schedule(cases) {
  return cases.flatMap((c, i) =>
    Array.from({ length: 4 }, (_, j) => ({
      caseId: c.id,
      mode: MODES[(i + j) % 4],
    })),
  );
}
export function grade(record, oracle) {
  const calls = record.businessCalls ?? [];
  const first = Object.hasOwn(record, "firstSelection")
    ? record.firstSelection
    : (calls[0]?.tool ?? null);
  const expected = calls.filter((c) => c.tool === oracle.tool);
  const taskProposal =
    record.selectionProposals?.find((t) => t !== "woku_guide") ??
    calls.find((c) => c.tool !== "woku_guide")?.tool ??
    null;
  return {
    firstTaskToolCorrect: taskProposal === oracle.tool,
    firstToolCorrect: first === oracle.tool,
    eventualToolCorrect: expected.length > 0,
    exactArguments: expected.some((c) =>
      isDeepStrictEqual(c.arguments, oracle.arguments),
    ),
    successfulExpectedHandler: expected.some((c) => !c.isError),
    wrongToolCalls: calls.filter(
      (c) => c.tool !== oracle.tool && c.tool !== "woku_guide",
    ).length,
    wrongMutationCalls: calls.filter(
      (c) => c.tool !== oracle.tool && c.effect !== "read",
    ).length,
    abstained: record.preparations?.[0]?.status === "no_match",
    ambiguous: record.preparations?.[0]?.status === "needs_choice",
    correctInCandidates:
      record.preparations?.[0]?.candidates?.some(
        (c) => c.tool_id === oracle.tool,
      ) ?? false,
  };
}
export function openaiCost(usage) {
  if (
    !usage ||
    !Number.isFinite(usage.input_tokens) ||
    !Number.isFinite(usage.output_tokens)
  )
    return null;
  const cached = usage.input_tokens_details?.cached_tokens;
  const writes = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (
    !Number.isFinite(cached) ||
    cached < 0 ||
    writes < 0 ||
    cached + writes > usage.input_tokens
  )
    return null;
  const long = usage.input_tokens > 272000;
  return (
    (((usage.input_tokens - cached - writes) * 0.1 +
      cached * 0.01 +
      writes * 0.125) *
      (long ? 2 : 1)) /
      1e6 +
    (usage.output_tokens * 0.5 * (long ? 1.5 : 1)) / 1e6
  );
}
export function jevUsage(metrics) {
  const hops = metrics.flatMap((m) => m.hops ?? []);
  const active = hops.filter((h) => h.jevCalls !== 0);
  const complete = active.every(
    (h) =>
      Number.isInteger(h.jevCalls) &&
      h.jevUsageCalls === h.jevCalls &&
      Number.isFinite(h.jevInputTokens) &&
      Number.isFinite(h.jevOutputTokens),
  );
  return {
    calls: hops.reduce((n, h) => n + (h.jevCalls ?? 0), 0),
    complete,
    inputTokens: complete
      ? hops.reduce((n, h) => n + (h.jevInputTokens ?? 0), 0)
      : null,
    outputTokens: complete
      ? hops.reduce((n, h) => n + (h.jevOutputTokens ?? 0), 0)
      : null,
    cost: complete
      ? hops.reduce((n, h) => n + ((h.jevInputTokens ?? 0) * 0.042) / 1e6, 0)
      : null,
  };
}
