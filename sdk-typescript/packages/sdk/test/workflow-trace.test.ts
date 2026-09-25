import test from "node:test";
import assert from "node:assert/strict";
import { decodeWorkflowTrace } from "../src/remote.ts";
await test("workflow telemetry distinguishes incomplete from empty, rejects invalid indices", () => {
  const base = {
    catalog_version: "a".repeat(64),
    retrieved: [2, 1, 0],
    included: [0, 2],
    exposed: [0],
  };
  assert.deepEqual(decodeWorkflowTrace(JSON.stringify(base)), base);
  assert.deepEqual(
    decodeWorkflowTrace(
      JSON.stringify({ ...base, included: null, exposed: null }),
    )?.included,
    null,
  );
  assert.deepEqual(
    decodeWorkflowTrace(JSON.stringify({ ...base, included: [], exposed: [] }))
      ?.included,
    [],
  );
  for (const bad of [
    { ...base, exposed: [1] },
    { ...base, included: [8] },
    { ...base, retrieved: [0, 0] },
    { ...base, exposed: [-1] },
    { ...base, unknown: true },
  ])
    assert.equal(decodeWorkflowTrace(JSON.stringify(bad)), null);
});
