import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry, ToolgateProvider } from "../src/provider.ts";
import { RemoteClient } from "../src/remote.ts";
import { PostgresStore } from "../src/store.ts";
import { sha } from "../src/codec.ts";
import type { Actor, OperationView } from "../src/wire.generated.ts";

class SnapshotSink extends PostgresStore {
  saved: OperationView[] = [];
  constructor() {
    super("workflow-test", "postgres://unused:unused@127.0.0.1:1/unused");
  }
  override async put(_actor: Actor, view: OperationView): Promise<void> {
    this.saved.push(view);
    await Promise.resolve();
  }
}

await test("workflow validates every child binding before storing any snapshot", async () => {
  const metadata = {
    tool_id: "read.value",
    name: "read.value",
    title: "Read value",
    description: "Read a synthetic value",
    aliases: [],
    tags: [],
    effect: "read" as const,
    open_world: false,
    input_schema: { type: "object", properties: {} },
    schema_profile: "tg-jsonschema-1" as const,
  };
  let dispatched = 0;
  const registry = new ToolRegistry([
    {
      metadata,
      handler: async () => {
        dispatched++;
        return Promise.resolve({ content: [] });
      },
    },
  ]);
  const actor: Actor = {
    principal_ref: "user",
    workspace_ref: "workspace",
    authorization_revision: "policy",
    allowed_tool_ids: registry.ids(),
  };
  const valid = {
    operation_id: "00000000-0000-4000-8000-000000000001",
    revision: 1,
    catalog_id: "fixture",
    catalog_version: registry.version,
    expires_at: "2030-01-01T00:00:00Z",
    status: "ready",
    selected_tool: {
      tool_id: metadata.tool_id,
      name: metadata.name,
      title: metadata.title,
      description: metadata.description,
      effect: metadata.effect,
      open_world: false,
      input_schema: metadata.input_schema,
      schema_digest: sha(metadata.input_schema),
    },
    arguments_digest: sha({}),
    next_tool: "execute_read_action",
  };
  for (const [index, invalid] of [
    { ...valid, operation_id: "00000000-0000-4000-8000-000000000002" },
    { ...valid, catalog_version: "a".repeat(64) },
    { ...valid, selected_tool: { ...valid.selected_tool, effect: "write" } },
    {
      ...valid,
      selected_tool: {
        ...valid.selected_tool,
        input_schema: { type: "string" },
      },
    },
  ].entries()) {
    const store = new SnapshotSink();
    const client = new RemoteClient(
      {
        baseUrl: "https://core.example",
        apiKey: () => Promise.resolve("synthetic-key"),
        contractVersion: "0.1",
      },
      {
        transport: () =>
          Promise.resolve(
            Response.json(
              {
                status: "prepared",
                candidate_count: 2,
                operations: index === 0 ? [valid, invalid] : [invalid],
              },
              { status: 201 },
            ),
          ),
      },
    );
    try {
      const provider = new ToolgateProvider({
        catalogId: "fixture",
        registry,
        client,
        store,
        authorize: () => Promise.resolve(true),
      });
      await assert.rejects(provider.prepareWorkflow(actor, "read a value"));
      assert.equal(store.saved.length, 0);
      assert.equal(dispatched, 0);
    } finally {
      client.close();
      await store.close();
    }
  }
});
