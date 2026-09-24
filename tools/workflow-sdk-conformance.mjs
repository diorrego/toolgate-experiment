import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const require = createRequire(
  new URL("../.local/consumer/package.json", import.meta.url),
);
const {
  RemoteClient,
  ToolRegistry,
  ToolgateProvider,
  PostgresStore,
} = require("@toolgate/sdk");
const cfg = JSON.parse(readFileSync(process.env.TOOLGATE_LAB_STATE));
let calls = 0,
  approved = true,
  uncertain = false;
const definitions = ["read", "write"].map((effect) => ({
  metadata: {
    tool_id: "workflow." + effect,
    name: "workflow." + effect,
    title: effect,
    description: "Synthetic workflow " + effect,
    aliases: [],
    tags: [],
    effect,
    open_world: false,
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    schema_profile: "tg-jsonschema-1",
  },
  handler: async (args) => {
    calls++;
    if (uncertain) throw Error("Lost handler response");
    return { content: [{ type: "text", text: JSON.stringify(args) }] };
  },
}));
const registry = new ToolRegistry(definitions, undefined, {
    allowMutations: true,
  }),
  actor = {
    principal_ref: "wf-sdk",
    workspace_ref: "sandbox",
    authorization_revision: "policy",
    allowed_tool_ids: registry.ids(),
  };
const metrics = [],
  baseUrl = process.argv[2],
  client = new RemoteClient(
    {
      baseUrl,
      apiKey: async () => cfg.keys.runtime,
      contractVersion: "0.1",
      allowInsecureLocalhost: true,
    },
    { onRequest: (m) => metrics.push(m) },
  ),
  admin = new RemoteClient({
    baseUrl,
    apiKey: async () => cfg.keys.admin,
    contractVersion: "0.1",
    allowInsecureLocalhost: true,
  });
const store = new PostgresStore(
  "workflow-" + randomUUID(),
  `postgres://tg_provider:${cfg.provider_password}@127.0.0.1:${cfg.port}/toolgate_sdk?sslmode=disable`,
);
const options = {
  catalogId: "workflow-sdk",
  registry,
  client,
  store,
  authorize: async () => true,
  approve: async () => approved,
};
const provider = new ToolgateProvider(options),
  input = (op) => ({
    operation_id: op.operation_id,
    operation_revision: op.revision,
    arguments: { id: "discovered" },
  });
try {
  await provider.bootstrap(admin);
  const view = await provider.prepareWorkflow(actor, "read and update value");
  assert.equal(view.operations.length, 2);
  assert.equal(calls, 0);
  const read = view.operations.find((o) => o.selected_tool.effect === "read"),
    write = view.operations.find((o) => o.selected_tool.effect === "write");
  const inference = () =>
      metrics.flatMap((m) => m.hops).reduce((n, h) => n + h.jevCalls, 0),
    before = inference();
  await assert.rejects(provider.executeRead(actor, input(write)));
  await assert.rejects(provider.executeWrite(actor, input(read)));
  assert.equal(calls, 0);
  const noApproval = new ToolgateProvider({ ...options, approve: undefined });
  await assert.rejects(noApproval.executeWrite(actor, input(write)));
  assert.equal(calls, 0);
  await provider.executeRead(actor, input(read));
  approved = false;
  await assert.rejects(provider.executeWrite(actor, input(write)));
  assert.equal(calls, 1);
  approved = true;
  const output = await provider.executeWrite(actor, input(write));
  assert.equal(calls, 2);
  assert.deepEqual(await provider.executeWrite(actor, input(write)), output);
  assert.equal(calls, 2);
  assert.equal(inference(), before);
  approved = false;
  await assert.rejects(provider.executeWrite(actor, input(write)));
  approved = true;
  await assert.rejects(
    provider.executeWrite({ ...actor, principal_ref: "foreign" }, input(write)),
  );
  const pending = await provider.prepareWorkflow(actor, "read and write again"),
    mutation = pending.operations.find(
      (o) => o.selected_tool.effect === "write",
    );
  uncertain = true;
  await assert.rejects(provider.executeWrite(actor, input(mutation)));
  uncertain = false;
  const after = calls;
  await assert.rejects(provider.executeWrite(actor, input(mutation)));
  assert.equal(calls, after);
  console.log(
    JSON.stringify({
      sdkWorkflow: true,
      checks: [
        "prepare_no_dispatch",
        "two_local_snapshots",
        "effect_guards",
        "default_approval_denied",
        "approval_before_dispatch_and_replay",
        "remote_decisions_without_selection",
        "durable_replay",
        "foreign_actor",
        "uncertain_effect_not_retried",
      ],
    }),
  );
} finally {
  client.close();
  admin.close();
  await store.close();
}
