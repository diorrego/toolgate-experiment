import test from "node:test";
import assert from "node:assert/strict";
import { schedule, grade, openaiCost, jevUsage } from "../v2/metrics.mjs";
await test("four conditions contain each case exactly once with balanced positions", () => {
  const rows = schedule(
    Array.from({ length: 60 }, (_, i) => ({ id: String(i) })),
  );
  assert.equal(rows.length, 240);
  assert.equal(new Set(rows.map((r) => r.caseId + ":" + r.mode)).size, 240);
  for (let p = 0; p < 4; p++)
    assert.equal(
      rows.filter((r, i) => i % 4 === p && r.mode === "direct").length,
      15,
    );
});
await test("a repaired call does not erase a wrong first selection or an extra write", () => {
  const r = grade(
    {
      businessCalls: [
        { tool: "delete", arguments: {}, effect: "destructive", isError: true },
        { tool: "read", arguments: { n: 1 }, effect: "read", isError: false },
      ],
    },
    { tool: "read", arguments: { n: 1 } },
  );
  assert.equal(r.firstToolCorrect, false);
  assert.equal(r.eventualToolCorrect, true);
  assert.equal(r.wrongMutationCalls, 1);
  assert.equal(r.successfulExpectedHandler, true);
});
await test("missing usage is unknown, cache writes have their own price", () => {
  assert.equal(openaiCost(null), null);
  assert.equal(openaiCost({ input_tokens: 100, output_tokens: 1 }), null);
  assert.ok(
    Math.abs(
      openaiCost({
        input_tokens: 100,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
      }) -
        (0.1 * 50 + 0.01 * 20 + 0.125 * 30 + 0.5 * 10) / 1e6,
    ) < 1e-15,
  );
  assert.equal(
    jevUsage([
      { hops: [{ jevCalls: 2, jevUsageCalls: 1, jevInputTokens: 500 }] },
    ]).cost,
    null,
  );
});

await test("guide discovery is separate from first task-tool selection", () => {
  const r = grade(
    {
      firstSelection: "woku_guide",
      selectionProposals: ["woku_guide", "read"],
      businessCalls: [
        { tool: "woku_guide", effect: "read" },
        { tool: "read", arguments: {}, isError: false, effect: "read" },
      ],
    },
    { tool: "read", arguments: {} },
  );
  assert.equal(r.firstToolCorrect, false);
  assert.equal(r.firstTaskToolCorrect, true);
  assert.equal(r.wrongToolCalls, 0);
});

await test("failed API transport is retained with unknown usage and is not retried", async () => {
  const { responseAttempt } = await import("../v2/openai.mjs");
  const attempts = [];
  let n = 0;
  await assert.rejects(
    responseAttempt({
      key: "synthetic",
      body: { model: "gpt-6-luna" },
      attempts,
      fetcher: async () => {
        n++;
        throw Error("network");
      },
    }),
  );
  assert.equal(n, 1);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].costUSD, null);
  assert.equal(attempts[0].usage, null);
  assert.ok(attempts[0].durationMs >= 0);
});
await test("state oracle checks explicit false rather than truthiness", async () => {
  const { verifyState } = await import("../v2/state.mjs");
  assert.equal(
    verifyState(
      {
        effect: "write",
        tool: "update_woku_settings",
        arguments: { wokuId: "synthetic", closed: false },
      },
      { Woku: [{ _id: "synthetic", closed: false }] },
    ),
    true,
  );
  assert.equal(
    verifyState(
      {
        effect: "write",
        tool: "update_woku_settings",
        arguments: { wokuId: "synthetic", closed: false },
      },
      { Woku: [{ _id: "synthetic", closed: true }] },
    ),
    false,
  );
});
