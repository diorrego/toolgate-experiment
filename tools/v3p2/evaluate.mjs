import { grade as legacyGrade } from "../v3/metrics.mjs";
import { verifyState, resolveIds } from "../v3/state.mjs";
export function textOf(result) {
  return (result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
function unpack(result) {
  try {
    return JSON.parse(textOf(result));
  } catch {
    return result;
  }
}
function objects(value, out = []) {
  if (value && typeof value === "object") {
    out.push(value);
    for (const child of Object.values(value)) objects(child, out);
  }
  return out;
}
export function evaluate(record, oracle, ids) {
  const trace = record.businessTrace ?? [],
    ok = trace.filter((c) => !c.isError),
    data = ok.map((c) => unpack(c.result)),
    nodes = data.flatMap((d) => objects(d));
  const entityChecks = oracle.entities.map(({ ref, label }) => ({
    ref,
    found: nodes.some(
      (o) =>
        Object.entries(o).some(
          ([k, v]) =>
            [
              "id",
              "_id",
              "userId",
              "clientId",
              "entityId",
              "folderId",
              "wokuId",
              "planId",
              "groupId",
              "dataFlowId",
              "trackerId",
              "flowId",
              "npsToolId",
            ].includes(k) &&
            typeof v === "string" &&
            (v === ids[ref] || v.endsWith(":" + ids[ref])),
        ) && JSON.stringify(o).toLowerCase().includes(label.toLowerCase()),
    ),
  }));
  const answer = (record.answer ?? "")
    .replace(/[*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const answerChecks = oracle.answerPatterns.map((pattern) => ({
    pattern,
    pass: new RegExp(pattern, "i").test(answer),
  }));
  const legacy = legacyGrade(record, oracle, ids),
    state = verifyState(oracle, record.baselineState, record.finalState, ids);
  const writes = (record.businessCalls ?? []).filter(
      (c) => c.effect !== "read",
    ),
    expectedWrite = oracle.steps.find((s) => s.id === "write");
  const improperMutations = writes.filter(
    (c) =>
      !expectedWrite ||
      c.tool !== expectedWrite.tool ||
      Object.entries(resolveIds(expectedWrite.arguments, ids)).some(
        ([k, v]) =>
          /Id$|Ids$/.test(k) &&
          JSON.stringify(c.arguments[k]) !== JSON.stringify(v),
      ),
  ).length;
  const evidence = JSON.stringify(data),
    evidenceFacts = oracle.answerFacts.every((f) =>
      evidence.toLowerCase().includes(f.toLowerCase()),
    );
  let relations = true;
  if (oracle.id === "V3-03")
    relations = nodes.some(
      (o) =>
        o.id === ids.flow &&
        JSON.stringify(o.wokusIds) === JSON.stringify([ids.woku, ids.woku2]),
    );
  if (oracle.id === "V3-08")
    relations = nodes.some(
      (o) =>
        o.id === ids.group &&
        o.members?.some((m) => m.userId === ids.user && m.role === "admin") &&
        o.stats?.countTotal === 2,
    );
  if (["V3-01", "V3-10", "V3-11", "V3-12"].includes(oracle.id)) {
    const ref = {
      "V3-01": "woku",
      "V3-10": "nps",
      "V3-11": "form",
      "V3-12": "flow",
    }[oracle.id];
    const value = {
      "V3-01": "Central",
      "V3-10": "Delivery-North",
      "V3-11": "Callback-East",
      "V3-12": "Journey-West",
    }[oracle.id];
    relations = nodes.some(
      (o) =>
        o.entityId === ids[ref] &&
        o.values?.some((v) => v.trackerId === ids.tracker && v.value === value),
    );
    if (oracle.id === "V3-01")
      relations &&= nodes.some(
        (o) =>
          o.entityId === ids.woku &&
          o.values?.some(
            (v) => v.trackerId === ids.tracker2 && v.value === "RC-410",
          ),
      );
  }
  if (oracle.id === "V3-02")
    relations = nodes.some(
      (o) =>
        o.id === ids.woku &&
        o.folderId === ids.folder &&
        o.defaultLocale === "en" &&
        o.settings?.onlyOneReviewPerClient === true,
    );
  if (oracle.id === "V3-15")
    relations = ok.some(
      (c) =>
        c.tool === "get_action_plan_events" && c.arguments.planId === ids.plan,
    );
  const affirmativeMutation =
    oracle.effect === "read" ||
    /(?:\b(?:done|updated|changed|moved|closed|renamed|disabled|deactivated|assigned|removed|paused|added|appended|reordered)\b|\bnow\b|\bhas been\b)/i.test(
      answer,
    );
  const completeAnswer =
    Boolean(answer) && answerChecks.every((c) => c.pass) && affirmativeMutation;
  return {
    success:
      record.status === "completed" &&
      completeAnswer &&
      entityChecks.every((c) => c.found) &&
      evidenceFacts &&
      relations &&
      legacy.groundedIds &&
      state.correct &&
      improperMutations === 0,
    completeAnswer,
    entityChecks,
    answerChecks,
    evidenceFacts,
    relations,
    groundedIds: legacy.groundedIds,
    idArgumentCount: legacy.idArgumentCount,
    groundedIdCount: legacy.groundedIdCount,
    state,
    improperMutations,
    mutationInvocations: writes.length,
    referencePathMatched: legacy.completeSequence,
  };
}
