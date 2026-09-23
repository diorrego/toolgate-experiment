import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry } from "../src/provider.ts";

await test("registry rejects writes in the explicit read-only experiment and unsupported schemas", () => {
  const definition = {
    tool_id: "read.value",
    name: "read.value",
    title: "Read value",
    description: "Read a synthetic value",
    aliases: [],
    tags: [],
    effect: "read" as const,
    open_world: false,
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    schema_profile: "tg-jsonschema-1" as const,
  };
  const handler = () =>
    Promise.resolve({ content: [{ type: "text", text: "synthetic" }] });
  const registry = new ToolRegistry([{ metadata: definition, handler }]);
  assert.equal(registry.catalog().tools.length, 1);
  assert.throws(
    () =>
      new ToolRegistry([
        { metadata: { ...definition, effect: "write" }, handler },
      ]),
  );
  assert.throws(
    () =>
      new ToolRegistry([
        {
          metadata: {
            ...definition,
            input_schema: { type: "string", pattern: ".*" },
          },
          handler,
        },
      ]),
  );
});

await test("request-bound handlers reuse the immutable catalogue without widening their allowlist", () => {
  const metadata = {
    tool_id: "read.value",
    name: "read.value",
    title: "Read",
    description: "Read a value",
    aliases: [],
    tags: [],
    effect: "read" as const,
    open_world: false,
    input_schema: { type: "object", properties: {} },
    schema_profile: "tg-jsonschema-1" as const,
  };
  const handler = () =>
    Promise.resolve({ content: [{ type: "text", text: "fixture" }] });
  const template = new ToolRegistry([{ metadata, handler }]);
  const bound = new ToolRegistry([{ metadata, handler }], template);
  assert.equal(bound.version, template.version);
  assert.throws(
    () =>
      new ToolRegistry(
        [{ metadata: { ...metadata, title: "changed" }, handler }],
        template,
      ),
  );
  const restricted = new ToolRegistry([], template);
  assert.deepEqual(restricted.ids(), []);
  assert.equal(restricted.version, template.version);
  assert.throws(() => restricted.get("read.value"));
});
