import assert from "node:assert/strict";
import test from "node:test";
import { parseWireJson } from "../src/json.ts";

await test("wire parser preserves JSON values and escapes without coercion", () => {
  const value = {
    a: [false, 0, null, 'quote" and slash\\', -1.5e-3],
    nested: { value: true },
  };
  assert.deepEqual(parseWireJson(JSON.stringify(value)), value);
});

await test("wire parser rejects duplicate keys before JSON.parse could erase them", () => {
  for (const text of [
    '{"a":1,"\\u0061":2}',
    '{"nested":{"x":null,"x":false}}',
    "1e999",
    "9007199254740992",
    '{"constructor":0}',
    "[1,]",
    '{"a":1,}',
    "true false",
    "01",
  ]) {
    assert.throws(() => parseWireJson(text));
  }
});
