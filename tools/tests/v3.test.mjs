import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeCalls } from "../v3/calls.mjs";
import { grade } from "../v3/metrics.mjs";
import { verifyState } from "../v3/state.mjs";

test("folder membership can be joined after unfiltered discovery, but must be evidenced", () => {
  const corpus = JSON.parse(
    readFileSync(new URL("../../data/v3/corpus.en.json", import.meta.url)),
  );
  const c = corpus.cases[1],
    ids = { folder: "a".repeat(24), woku: "b".repeat(24) };
  const trace = [
    {
      tool: "list_wokus",
      arguments: { search: "Mercury Reception" },
      result: { id: ids.woku, folderId: ids.folder },
      startedMs: 0,
      endedMs: 1,
    },
    {
      tool: "list_folders",
      arguments: {},
      result: { id: ids.folder, name: "Service Desk" },
      startedMs: 0,
      endedMs: 1,
    },
    {
      tool: "get_woku",
      arguments: { wokuId: ids.woku },
      result: { id: ids.woku, folderId: ids.folder },
      startedMs: 2,
      endedMs: 3,
    },
  ];
  assert.equal(
    grade({ businessTrace: trace, mode: "direct" }, c, ids).completeSequence,
    true,
  );
  trace[1].result = { id: "c".repeat(24), name: "Other folder" };
  assert.equal(
    grade({ businessTrace: trace, mode: "direct" }, c, ids).completeSequence,
    false,
  );
});
test("corpus has 30 real multi-tool cases, no disclosed object IDs, acyclic dependencies", () => {
  const corpus = JSON.parse(
    readFileSync(new URL("../../data/v3/corpus.en.json", import.meta.url)),
  );
  assert.equal(corpus.cases.length, 30);
  assert.equal(corpus.cases.filter((c) => c.effect === "read").length, 15);
  for (const c of corpus.cases) {
    assert.ok(new Set(c.steps.map((s) => s.tool)).size >= 2);
    assert.ok(!/[0-9a-f]{24}/.test(c.question));
    const prior = new Set();
    for (const s of c.steps) {
      for (const d of s.dependsOn) assert.ok(prior.has(d));
      prior.add(s.id);
    }
    assert.ok(c.steps.some((s) => s.dependsOn.length));
  }
});
test("read concurrency is bounded, writes act as barriers and output order stays stable", async () => {
  let active = 0,
    peak = 0;
  const events = [];
  const result = await executeCalls(
    ["r1", "r2", "w1", "r3", "w2"].map((name) => ({ name })),
    (c) => c.name.startsWith("r"),
    async (c) => {
      if (c.name.startsWith("w")) assert.equal(active, 0);
      active++;
      peak = Math.max(peak, active);
      events.push("start" + c.name);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      events.push("end" + c.name);
      return c.name;
    },
    2,
  );
  assert.equal(peak, 2);
  assert.deepEqual(result, ["r1", "r2", "w1", "r3", "w2"]);
  assert.ok(events.indexOf("endw1") < events.indexOf("startr3"));
});
test("complete tool names with ungrounded or premature IDs fail the dependency oracle", () => {
  const id = "a".repeat(24),
    c = {
      steps: [
        {
          id: "find",
          tool: "list",
          arguments: {},
          dependsOn: [],
          alternatives: [],
        },
        {
          id: "get",
          tool: "get",
          arguments: { id: "@target" },
          dependsOn: ["find"],
          alternatives: [],
        },
      ],
      answerFacts: [],
    };
  const trace = [
    { tool: "list", arguments: {}, result: { id }, startedMs: 0, endedMs: 10 },
    { tool: "get", arguments: { id }, result: {}, startedMs: 5, endedMs: 15 },
  ];
  let g = grade({ businessTrace: trace, mode: "direct" }, c, { target: id });
  assert.equal(g.completeSequence, false);
  assert.equal(g.groundedIds, false);
  trace[1].startedMs = 11;
  g = grade({ businessTrace: trace, mode: "direct" }, c, { target: id });
  assert.equal(g.completeSequence, true);
  assert.equal(g.groundedIds, true);
  trace[0].isError = true;
  assert.equal(
    grade({ businessTrace: trace, mode: "direct" }, c, { target: id })
      .groundedIds,
    false,
  );
});
test("persisted oracle rejects unrelated edits and duplicate creations", () => {
  const before = {
      Thing: [
        { _id: "a", name: "old" },
        { _id: "b", name: "keep" },
      ],
    },
    c = { state: { model: "Thing", id: "@target", fields: { name: "new" } } };
  assert.equal(
    verifyState(
      c,
      before,
      {
        Thing: [
          { _id: "a", name: "new" },
          { _id: "b", name: "keep" },
        ],
      },
      { target: "a" },
    ).correct,
    true,
  );
  assert.equal(
    verifyState(
      c,
      before,
      {
        Thing: [
          { _id: "a", name: "new" },
          { _id: "b", name: "changed" },
        ],
      },
      { target: "a" },
    ).correct,
    false,
  );
  const create = { state: { model: "Thing", create: { name: "new" } } };
  assert.equal(
    verifyState(
      create,
      before,
      {
        Thing: [
          ...before.Thing,
          { _id: "c", name: "new" },
          { _id: "d", name: "new" },
        ],
      },
      {},
    ).correct,
    false,
  );
});
