/** Provider-side benchmark adapter. The API agent only sees this provider's MCP endpoint. */
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
export async function createV2Provider({
  config,
  catalog,
  gateTools,
  callNative,
  state,
}) {
  const sdkRequire = createRequire(config.sdkConsumer),
    mcpRequire = createRequire(config.mcpConsumer);
  const { RemoteClient, ToolRegistry, ToolgateProvider, PostgresStore } =
    sdkRequire("@toolgate/sdk");
  const { Ajv2020 } = sdkRequire("ajv/dist/2020.js");
  const ajv = new Ajv2020({
    strict: false,
    validateFormats: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    allErrors: true,
  });
  const gateValidators = new Map(
    gateTools.map((t) => [t.name, ajv.compile(t.inputSchema)]),
  );
  const { Server } = mcpRequire("@modelcontextprotocol/sdk/server/index.js");
  const { StreamableHTTPServerTransport } = mcpRequire(
    "@modelcontextprotocol/sdk/server/streamableHttp.js",
  );
  const { ListToolsRequestSchema, CallToolRequestSchema } = mcpRequire(
    "@modelcontextprotocol/sdk/types.js",
  );
  let mode = "direct",
    record = {};
  const connections = new Map(),
    integration = randomUUID(),
    bootstrap = [];
  const effect = (t) =>
    t.annotations.readOnlyHint
      ? "read"
      : t.annotations.destructiveHint
        ? "destructive"
        : "write";
  const registry = new ToolRegistry(
    catalog.tools.map((t) => ({
      metadata: {
        tool_id: t.name,
        name: t.name,
        title: t.title ?? t.name,
        description: t.description,
        aliases: [],
        tags: [],
        effect: effect(t),
        open_world: t.annotations.openWorldHint ?? false,
        input_schema: t.inputSchema,
        schema_profile: "tg-jsonschema-1",
      },
      handler: async (args) => {
        const started = performance.now();
        let result;
        try {
          result = await callNative(t.name, args);
          return result;
        } finally {
          record.businessCalls.push({
            tool: t.name,
            arguments: args,
            effect: effect(t),
            durationMs: performance.now() - started,
            isError: !result || result.isError === true,
          });
        }
      },
    })),
    undefined,
    { allowMutations: true },
  );
  const actor = {
    principal_ref: "v2-synthetic-operator",
    workspace_ref: "v2-synthetic-company",
    authorization_revision: "v2-sandbox-policy-1",
    allowed_tool_ids: registry.ids(),
  };
  for (const [name, url] of Object.entries(config.coreUrls)) {
    const started = performance.now(),
      client = new RemoteClient(
        {
          baseUrl: url,
          apiKey: async () => state.keys.runtime,
          contractVersion: "0.1",
        },
        { onRequest: (m) => record.remote?.push(m) },
      );
    const store = new PostgresStore(
      "v2-" + integration + "-" + name,
      `postgres://tg_provider:${state.provider_password}@127.0.0.1:${state.port}/toolgate_sdk?sslmode=disable`,
    );
    const provider = new ToolgateProvider({
      catalogId: "woku-v2-complete",
      registry,
      client,
      store,
      authorize: async (a) =>
        a.principal_ref === actor.principal_ref &&
        a.workspace_ref === actor.workspace_ref,
      approve: async (a) =>
        a.principal_ref === actor.principal_ref &&
        a.authorization_revision === actor.authorization_revision,
    });
    const admin = new RemoteClient({
      baseUrl: url,
      apiKey: async () => state.keys.admin,
      contractVersion: "0.1",
    });
    try {
      await provider.bootstrap(admin);
    } finally {
      admin.close();
    }
    connections.set(name, { client, store, provider });
    bootstrap.push({ name, durationMs: performance.now() - started });
  }
  function reset(nextMode) {
    if (!["direct", "design-1", "design-2", "design-3"].includes(nextMode))
      throw Error("Invalid trusted mode");
    mode = nextMode;
    record = {
      businessCalls: [],
      preparations: [],
      remote: [],
      selectionProposals: [],
      firstSelection: null,
      uncertainExecution: false,
    };
  }
  reset("direct");
  async function dispatch(name, args) {
    if (record.uncertainExecution) throw Error("EXECUTION_UNKNOWN");
    if (mode === "direct") {
      record.selectionProposals.push(name);
      record.firstSelection ??= name;
      const local = registry.get(name);
      if (registry.validate(name, args).length)
        throw Error("INVALID_ARGUMENTS");
      return local.handler(args, {});
    }
    if (!gateValidators.get(name)?.(args)) throw Error("INVALID_REQUEST");
    const provider = connections.get(
      mode === "design-3" ? "binary" : "choice",
    ).provider;
    let value;
    if (name === "prepare_action") {
      value = args.operation_id
        ? await provider.resolve(
            actor,
            args.operation_id,
            args.operation_revision,
            args.tool_choice,
            args.known_arguments ?? {},
          )
        : await provider.prepare(
            actor,
            args.intent,
            args.known_arguments ?? {},
          );
      record.preparations.push(value);
      if (value.selected_tool)
        record.selectionProposals.push(value.selected_tool.tool_id);
      if (record.preparations.length === 1)
        record.firstSelection = value.selected_tool?.tool_id ?? null;
    } else if (name === "execute_read_action")
      value = await provider.executeRead(actor, args);
    else if (name === "execute_write_action")
      value = await provider.executeWrite(actor, args);
    else throw Error("UNKNOWN_TOOL");
    return value?.content
      ? value
      : { content: [{ type: "text", text: JSON.stringify(value) }] };
  }
  async function mcp(req, res, body) {
    const server = new Server(
      { name: "woku-v2-laboratory", version: "2.0.0" },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: mode === "direct" ? catalog.tools : gateTools,
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await dispatch(
          request.params.name,
          request.params.arguments ?? {},
        );
      } catch (e) {
        if (e.code === "EXECUTION_UNKNOWN") record.uncertainExecution = true;
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: e.code ?? e.message }),
            },
          ],
        };
      }
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }
  return {
    reset,
    mcp,
    snapshot: () => structuredClone(record),
    bootstrap,
    async close() {
      for (const c of connections.values()) {
        c.client.close();
        await c.store.close();
      }
    },
  };
}
