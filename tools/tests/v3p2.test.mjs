import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schedule, MODES } from "../v3p2/schedule.mjs";
import { evaluate } from "../v3p2/evaluate.mjs";
const evaluation = JSON.parse(
  readFileSync(new URL("../../data/v3p2/evaluation.en.json", import.meta.url)),
);
test("750 unique paired cells; each condition occupies every position once per scenario", () => {
  const tasks = schedule(evaluation.cases);
  assert.equal(tasks.length, 750);
  assert.equal(
    new Set(tasks.map((t) => [t.caseId, t.repeat, t.mode].join())).size,
    750,
  );
  for (const c of evaluation.cases)
    for (const m of MODES)
      assert.deepEqual(
        tasks
          .filter((t) => t.caseId === c.id && t.mode === m)
          .map((t) => t.position)
          .sort(),
        [0, 1, 2, 3, 4],
      );
  const original = JSON.parse(
    readFileSync(new URL("../../data/v3/corpus.en.json", import.meta.url)),
  );
  assert.deepEqual(
    evaluation.cases.map((c) => c.question),
    original.cases.map((c) => c.question),
  );
});
test("agent instructions and model budgets stay byte-identical to V3", () => {
  const old = readFileSync(new URL("../v3/run.mjs", import.meta.url), "utf8"),
    next = readFileSync(new URL("../v3p2/run.mjs", import.meta.url), "utf8");
  const instruction = (s) => s.match(/const instructions = (`[^`]+`);/)[1];
  assert.equal(instruction(next), instruction(old));
  for (const fixed of [
    "maxTurns: 20",
    "caseTimeoutMs: 240000",
    "parallel_tool_calls: true",
    "max_output_tokens: 4096",
    'service_tier: "default"',
  ])
    assert.ok(next.includes(fixed));
});
test("completion fails for empty replies, ungrounded IDs and unintended state", () => {
  const c = evaluation.cases[0],
    r = {
      status: "completed",
      answer:
        "Support Region Central Service CRM Receipt Code RC-410 Order Desk",
      businessTrace: [],
      businessCalls: [],
      baselineState: {},
      finalState: {},
    };
  assert.equal(
    evaluate(r, c, {
      woku: "a".repeat(24),
      tracker: "b".repeat(24),
      tracker2: "c".repeat(24),
    }).success,
    false,
  );
  r.answer = "";
  assert.equal(
    evaluate(r, c, {
      woku: "a".repeat(24),
      tracker: "b".repeat(24),
      tracker2: "c".repeat(24),
    }).completeAnswer,
    false,
  );
});
test("goal evidence accepts report-first discovery and rejects an unsupported report", () => {
  const ids = { folder: "a".repeat(24) },
    c = evaluation.cases[12],
    result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
  const trace = [
    {
      tool: "list_generated_reports",
      arguments: {},
      startedMs: 0,
      endedMs: 1,
      result: result({ reports: [{ folderId: ids.folder }] }),
    },
    {
      tool: "get_folder",
      arguments: { folderId: ids.folder },
      startedMs: 2,
      endedMs: 3,
      result: result({ id: ids.folder, name: "Service Desk" }),
    },
    {
      tool: "get_folder_report",
      arguments: { folderId: ids.folder },
      startedMs: 4,
      endedMs: 5,
      result: result({
        folderId: ids.folder,
        summary: "Clear callback ownership",
      }),
    },
  ];
  const r = {
    status: "completed",
    answer: "Service Desk: clear callback ownership.",
    businessTrace: trace,
    businessCalls: [],
    baselineState: {},
    finalState: {},
  };
  assert.equal(evaluate(r, c, ids).success, true);
  trace[2].result = result({
    folderId: ids.folder,
    summary: "No saved report",
  });
  assert.equal(evaluate(r, c, ids).success, false);
});
