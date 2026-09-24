import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ToolRegistry } from "../src/provider.ts";
import type { ToolDescriptor } from "../src/wire.generated.ts";
const metadata: ToolDescriptor = {
  tool_id: "write.value",
  name: "write.value",
  title: "Write value",
  description: "Write a synthetic value",
  aliases: [],
  tags: [],
  effect: "write",
  open_world: false,
  schema_profile: "tg-jsonschema-1",
  input_schema: { type: "object", properties: {} },
};
const handler = () =>
  Promise.resolve({ content: [{ type: "text", text: "fixture" }] });
await test("mutation registration requires trusted opt-in and preserves it in bound registries", () => {
  assert.throws(() => new ToolRegistry([{ metadata, handler }]));
  const registry = new ToolRegistry([{ metadata, handler }], undefined, {
    allowMutations: true,
  });
  assert.equal(registry.get("write.value").metadata.effect, "write");
  assert.equal(
    new ToolRegistry([{ metadata, handler }], registry).allowMutations,
    true,
  );
});
await test("bounded Woku patterns retain ECMAScript semantics and draft-07 validation", () => {
  const raw: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../../shared/fixtures/woku-patterns.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.ok(Array.isArray(raw));
  for (const untrusted of raw) {
    const item: unknown = untrusted;
    assert.ok(typeof item === "object" && item !== null);
    assert.ok("pattern" in item && typeof item.pattern === "string");
    assert.ok("value" in item && typeof item.value === "string");
    assert.ok("valid" in item && typeof item.valid === "boolean");
    const registry = new ToolRegistry([
      {
        metadata: {
          ...metadata,
          effect: "read",
          input_schema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: { value: { type: "string", pattern: item.pattern } },
          },
        },
        handler,
      },
    ]);
    assert.equal(
      registry.validate("write.value", { value: item.value }).length === 0,
      item.valid,
    );
  }
});

await test("draft-07 ref validation siblings fail closed instead of changing dialect semantics", () => {
  assert.throws(
    () =>
      new ToolRegistry([
        {
          metadata: {
            ...metadata,
            effect: "read",
            input_schema: {
              $schema: "http://json-schema.org/draft-07/schema#",
              type: "object",
              $defs: { s: { type: "string" } },
              properties: { s: { $ref: "#/$defs/s", minLength: 3 } },
            },
          },
          handler,
        },
      ]),
  );
});
