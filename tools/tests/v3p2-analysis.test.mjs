import test from "node:test";
import assert from "node:assert/strict";
import { lossAt, quantile, comparisons } from "../v3p2/analysis.mjs";
import {
  EMPTY_HISTORY_PATTERN,
  PHONE_PATTERN,
  finalEvaluate,
  raisedConfirmation,
} from "../v3p2/final-evaluation.mjs";
import { readFileSync } from "node:fs";
const cases = JSON.parse(
  readFileSync(new URL("../../data/v3p2/evaluation.en.json", import.meta.url)),
).cases;
const reply = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});
test("zero total is complete history evidence; a partial or foreign total is not", () => {
  const id = "a".repeat(24),
    oracle = cases[14];
  const detail = {
    id,
    title: "Callback Recovery",
    tasks: [
      { text: "Check callback queue" },
      { text: "Call waiting customers" },
    ],
    events: [],
    totalEvents: 0,
  };
  const record = {
    status: "completed",
    answer:
      "Check callback queue; Call waiting customers. No recorded history events.",
    baselineState: {},
    finalState: {},
    businessCalls: [],
    businessTrace: [
      {
        tool: "list_action_plans",
        arguments: {},
        startedMs: 0,
        endedMs: 1,
        result: reply({ plans: [{ id, title: "Callback Recovery" }] }),
      },
      {
        tool: "get_action_plan",
        arguments: { planId: id },
        startedMs: 2,
        endedMs: 3,
        result: reply(detail),
      },
    ],
  };
  assert.equal(finalEvaluate(record, oracle, { plan: id }).success, true);
  record.businessTrace[1].result = reply({ ...detail, totalEvents: 1 });
  assert.equal(finalEvaluate(record, oracle, { plan: id }).success, false);
  record.businessTrace[1].result = reply({ ...detail, id: "b".repeat(24) });
  assert.equal(finalEvaluate(record, oracle, { plan: id }).success, false);
});
test("member names, roles and total suffice without an unrequested draft breakdown", () => {
  const group = "a".repeat(24),
    user = "b".repeat(24),
    oracle = cases[7];
  const record = {
    status: "completed",
    answer: "Callback Team: Synthetic Operator, admin. 2 plans.",
    baselineState: {},
    finalState: {},
    businessCalls: [],
    businessTrace: [
      {
        tool: "list_action_plan_groups",
        arguments: {},
        startedMs: 0,
        endedMs: 1,
        result: reply({ groups: [{ id: group, name: "Callback Team" }] }),
      },
      {
        tool: "get_action_plan_group",
        arguments: { groupId: group },
        startedMs: 2,
        endedMs: 3,
        result: reply({
          id: group,
          name: "Callback Team",
          members: [{ userId: user, role: "admin" }],
          stats: { countTotal: 2 },
        }),
      },
      {
        tool: "list_company_members",
        arguments: {},
        startedMs: 4,
        endedMs: 5,
        result: reply({ members: [{ id: user, name: "Synthetic Operator" }] }),
      },
    ],
  };
  assert.equal(finalEvaluate(record, oracle, { group, user }).success, true);
  record.answer = "Callback Team: a user ID, admin. 2 plans.";
  assert.equal(finalEvaluate(record, oracle, { group, user }).success, false);
});
test("stage losses distinguish rejection, clipping, later exposure and unknown attempts", () => {
  const event = { remoteStart: 0, remoteEnd: 1, exposed: [] },
    remote = [
      {
        hops: [
          {
            toolStages: { retrieved: ["a", "b"], included: ["b"], exposed: [] },
          },
        ],
      },
    ];
  assert.equal(lossAt("c", [event], remote), "preselection");
  assert.equal(lossAt("a", [event], remote), "inclusion");
  assert.equal(lossAt("b", [event], remote), "final_cut");
  assert.equal(
    lossAt("b", [event, { ...event, exposed: ["b"] }], remote),
    "exposed",
  );
  remote[0].hops[0].toolStages.included = null;
  assert.equal(lossAt("b", [event], remote), "inclusion_unobserved");
  remote[0].hops[0].toolStages = null;
  assert.equal(lossAt("b", [event], remote), "unobserved");
});
test("linear quantiles and pairs match scenario and repetition, not row position", () => {
  assert.equal(quantile([40, 10, 30, 20], 0.5), 25);
  const rows = [];
  for (const mode of ["direct", "joint-1", "joint-3", "joint-5", "joint-8"])
    for (let repeat = 1; repeat <= 5; repeat++)
      rows.push({
        caseId: "s",
        mode,
        repeat,
        taskMs: 100 * repeat + (mode === "direct" ? 10 : 0),
        grade: { success: true },
      });
  const p = comparisons(rows.reverse()).find(
    (p) => p.control === "direct" && p.mode === "joint-1",
  );
  assert.equal(p.pairedDifferencesMs.p50, -10);
  assert.equal(p.perScenario[0].pairs.length, 5);
});
test("phrase clarification accepts equivalent meaning without accepting wrong values or negation", () => {
  for (const text of [
    "no recorded history events",
    "zero timeline entries",
    "history is empty",
  ])
    assert.match(text, new RegExp(EMPTY_HISTORY_PATTERN, "i"));
  for (const text of [
    "2 history events",
    "I do not know whether history events exist",
    "no recent events; older history unavailable",
  ])
    assert.doesNotMatch(text, new RegExp(EMPTY_HISTORY_PATTERN, "i"));
  assert.match("+1 555-010-3030", new RegExp(PHONE_PATTERN));
  assert.doesNotMatch("+1 555-010-3031", new RegExp(PHONE_PATTERN));
  assert.equal(raisedConfirmation("Raised the severity to high."), true);
  assert.equal(raisedConfirmation("The severity was not raised."), false);
});
