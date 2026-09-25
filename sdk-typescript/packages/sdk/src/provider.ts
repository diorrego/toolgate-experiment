import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction, ErrorObject } from "ajv";
import { decodeWire, jsonValue, jcs, sha } from "./codec.ts";
import {
  RemoteClient,
  RemoteError,
  type CallOptions,
  type WorkflowOptions,
} from "./remote.ts";
import { PostgresStore } from "./store.ts";
import type {
  Actor,
  ToolDescriptor,
  CatalogUpload,
  OperationView,
  WorkflowView,
  SelectedTool,
  ExecutionDecision,
  ValidationIssue,
  NeedsArgumentsOperation,
} from "./wire.generated.ts";

export interface LocalTool {
  metadata: ToolDescriptor;
  handler: (
    args: Record<string, unknown>,
    context: { signal?: AbortSignal; executionKey: string },
  ) => Promise<unknown>;
}
const supported = new Set(
  "$schema $id $defs $ref type properties required additionalProperties enum const minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength minItems maxItems items minProperties maxProperties allOf anyOf oneOf title description default examples deprecated readOnly writeOnly format pattern".split(
    " ",
  ),
);
const wokuPatterns = new Set([
  String.raw`^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$`,
  String.raw`\S`,
  String.raw`^(?=.*[0-9])[+]?[0-9()\-\s.]+$`,
  String.raw`^[a-f0-9]{24}$`,
  String.raw`^[0-9a-fA-F]{24}$`,
  String.raw`\D`,
]);
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function frozenArguments(
  input: Record<string, unknown>,
): Record<string, unknown> {
  jsonValue(input);
  const copy: unknown = JSON.parse(jcs(input));
  if (!record(copy)) throw new RemoteError("INVALID_REQUEST");
  const freeze = (value: unknown): void => {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(copy);
  return copy;
}
function profile(schema: Record<string, unknown>): void {
  jsonValue(schema);
  if (Buffer.byteLength(jcs(schema)) > 65536)
    throw new RemoteError("SCHEMA_UNSUPPORTED");
  const walk = (node: unknown, refs: Set<string>, depth: number): void => {
    if (depth > 64) throw new RemoteError("SCHEMA_UNSUPPORTED");
    if (typeof node === "boolean") return;
    if (!record(node)) throw new RemoteError("SCHEMA_UNSUPPORTED");
    if (
      schema["$schema"] === "http://json-schema.org/draft-07/schema#" &&
      "$ref" in node &&
      Object.keys(node).some(
        (key) =>
          ![
            "$ref",
            "title",
            "description",
            "default",
            "examples",
            "deprecated",
            "readOnly",
            "writeOnly",
            "format",
          ].includes(key),
      )
    )
      throw new RemoteError("SCHEMA_UNSUPPORTED");
    for (const [key, value] of Object.entries(node)) {
      if (!supported.has(key)) throw new RemoteError("SCHEMA_UNSUPPORTED");
      if (
        key === "$schema" &&
        value !== "https://json-schema.org/draft/2020-12/schema" &&
        value !== "http://json-schema.org/draft-07/schema#"
      )
        throw new RemoteError("SCHEMA_UNSUPPORTED");
      if (
        key === "pattern" &&
        (typeof value !== "string" || !wokuPatterns.has(value))
      )
        throw new RemoteError("SCHEMA_UNSUPPORTED");
      if (key === "$ref") {
        if (
          typeof value !== "string" ||
          !value.startsWith("#/") ||
          refs.has(value)
        )
          throw new RemoteError("SCHEMA_UNSUPPORTED");
        let target: unknown = schema;
        for (const part of value.slice(2).split("/")) {
          if (!record(target)) throw new RemoteError("SCHEMA_UNSUPPORTED");
          target = target[part.replaceAll("~1", "/").replaceAll("~0", "~")];
        }
        walk(target, new Set([...refs, value]), depth + 1);
      } else if (key === "properties" || key === "$defs") {
        if (!record(value)) throw new RemoteError("SCHEMA_UNSUPPORTED");
        for (const child of Object.values(value)) walk(child, refs, depth + 1);
      } else if (key === "items" || key === "additionalProperties")
        walk(value, refs, depth + 1);
      else if (["allOf", "anyOf", "oneOf"].includes(key)) {
        if (!Array.isArray(value)) throw new RemoteError("SCHEMA_UNSUPPORTED");
        for (const child of value) walk(child, refs, depth + 1);
      }
    }
  };
  walk(schema, new Set(), 0);
}
/** Explicit metadata and provider-local handlers; mutation registration is opt-in. */
export class ToolRegistry {
  readonly version: string;
  readonly allowMutations: boolean;
  private readonly tools = new Map<string, LocalTool>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly upload: CatalogUpload;
  constructor(
    definitions: LocalTool[],
    template?: ToolRegistry,
    options: { allowMutations?: boolean } = {},
  ) {
    this.allowMutations =
      template?.allowMutations ?? options.allowMutations === true;
    const ajv = template
      ? null
      : new Ajv2020({
          strict: false,
          validateFormats: false,
          allErrors: true,
          coerceTypes: false,
          useDefaults: false,
          removeAdditional: false,
        });
    if (ajv) {
      const require = createRequire(import.meta.url);
      const draft7: unknown = require("ajv/dist/refs/json-schema-draft-07.json");
      if (!record(draft7)) throw new RemoteError("SCHEMA_UNSUPPORTED");
      ajv.addMetaSchema(draft7);
    }
    const metadata: ToolDescriptor[] = [];
    for (const tool of definitions) {
      const clean = decodeWire(
        "ToolDescriptor",
        JSON.parse(jcs(tool.metadata)) as unknown,
      );
      if (clean.effect !== "read" && !this.allowMutations)
        throw new RemoteError("READ_ONLY_CATALOG_REQUIRED");
      if (this.tools.has(clean.tool_id))
        throw new RemoteError("CATALOG_INVALID");
      let validate = template?.validators.get(clean.tool_id);
      if (template) {
        const original = template.get(clean.tool_id).metadata;
        if (sha(original) !== sha(clean) || !validate)
          throw new RemoteError("CATALOG_MISMATCH");
      } else {
        profile(clean.input_schema);
        if (!ajv) throw new RemoteError("CATALOG_INVALID");
        validate = ajv.compile(clean.input_schema);
      }
      Object.freeze(clean);
      this.validators.set(clean.tool_id, validate);
      this.tools.set(
        clean.tool_id,
        Object.freeze({ metadata: clean, handler: tool.handler }),
      );
      metadata.push(clean);
    }
    metadata.sort((a, b) =>
      a.tool_id < b.tool_id ? -1 : a.tool_id > b.tool_id ? 1 : 0,
    );
    this.upload =
      template?.upload ??
      decodeWire("CatalogUpload", {
        schema_profile: "tg-jsonschema-1",
        tools: metadata,
      });
    this.version = template?.version ?? sha(this.upload);
  }
  catalog(): CatalogUpload {
    return decodeWire("CatalogUpload", JSON.parse(jcs(this.upload)) as unknown);
  }
  ids(): string[] {
    return [...this.tools.keys()].sort();
  }
  get(id: string): LocalTool {
    const tool = this.tools.get(id);
    if (!tool) throw new RemoteError("TOOL_NOT_ALLOWED");
    return tool;
  }
  validate(id: string, args: Record<string, unknown>): ValidationIssue[] {
    jsonValue(args);
    if (Buffer.byteLength(jcs(args)) > 65536)
      throw new RemoteError("PAYLOAD_TOO_LARGE");
    const validate = this.validators.get(id);
    if (!validate) throw new RemoteError("TOOL_NOT_ALLOWED");
    if (validate(args)) return [];
    return normalizeIssues(validate.errors ?? []);
  }
}
function normalizeIssues(errors: ErrorObject[]): ValidationIssue[] {
  const codeMap: Record<string, ValidationIssue["code"]> = {
    required: "required",
    type: "type",
    enum: "enum",
    const: "const",
    additionalProperties: "additional_property",
    minimum: "minimum",
    exclusiveMinimum: "minimum",
    maximum: "maximum",
    exclusiveMaximum: "maximum",
    minLength: "length",
    maxLength: "length",
    minItems: "items",
    maxItems: "items",
    oneOf: "one_of",
    anyOf: "any_of",
    allOf: "all_of",
  };
  const branches = errors.filter((e) => ["oneOf", "anyOf"].includes(e.keyword));
  const relevant = errors.filter(
    (e) =>
      !branches.some(
        (b) =>
          e !== b &&
          e.schemaPath.startsWith(b.schemaPath.replace(/\/(oneOf|anyOf)$/, "")),
      ),
  );
  return relevant
    .slice(0, 128)
    .map((e) => {
      const code = codeMap[e.keyword] ?? "unsupported_value";
      const missing: unknown = e.params["missingProperty"];
      const path =
        e.keyword === "required" && typeof missing === "string"
          ? e.instancePath +
            "/" +
            missing.replaceAll("~", "~0").replaceAll("/", "~1")
          : e.instancePath;
      return {
        code,
        instance_path: path,
        schema_path: e.schemaPath,
        message_key: "toolgate.validation." + code,
      };
    })
    .sort((a, b) =>
      (a.instance_path + "\0" + a.schema_path + "\0" + a.code).localeCompare(
        b.instance_path + "\0" + b.schema_path + "\0" + b.code,
        "en",
      ),
    );
}
export interface ProviderOptions {
  catalogId: string;
  registry: ToolRegistry;
  client: RemoteClient;
  store: PostgresStore;
  /** Required for every mutation, including replay. The model cannot provide this approval. */
  approve?: (
    actor: Actor,
    toolId: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
  authorize: (
    actor: Actor,
    toolId: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}
export interface ExecuteInput {
  operation_id: string;
  operation_revision: number;
  arguments: Record<string, unknown>;
}
/** Provider-local executor. Remote decisions never constitute authorization. */
export class ToolgateProvider {
  private readonly options: ProviderOptions;
  constructor(options: ProviderOptions) {
    this.options = options;
  }
  async bootstrap(admin: RemoteClient): Promise<void> {
    await this.options.client.getCapabilities();
    await admin.putCatalog(
      this.options.catalogId,
      this.options.registry.version,
      this.options.registry.catalog(),
    );
  }
  async prepareWorkflow(
    actor: Actor,
    intent: string,
    options: WorkflowOptions = {},
  ): Promise<WorkflowView> {
    const view = await this.options.client.prepareWorkflow(
      {
        actor,
        catalog_id: this.options.catalogId,
        catalog_version: this.options.registry.version,
        intent,
        ...(options.exposureLimit !== undefined
          ? { exposure_limit: options.exposureLimit }
          : {}),
      },
      options,
    );
    if (
      options.exposureLimit !== undefined &&
      view.operations.length > options.exposureLimit
    )
      throw new RemoteError("INVALID_RESPONSE");
    const ids = new Set<string>();
    const toolIds = new Set<string>();
    for (const child of view.operations) {
      if (
        !(child.status === "ready" || child.status === "needs_arguments") ||
        ids.has(child.operation_id) ||
        toolIds.has(child.selected_tool.tool_id) ||
        !actor.allowed_tool_ids.includes(child.selected_tool.tool_id) ||
        child.catalog_id !== this.options.catalogId ||
        child.catalog_version !== this.options.registry.version
      )
        throw new RemoteError("INVALID_RESPONSE");
      this.bindings(child, child.selected_tool, actor);
      ids.add(child.operation_id);
      toolIds.add(child.selected_tool.tool_id);
    }
    if ((view.status === "prepared") !== view.operations.length > 0)
      throw new RemoteError("INVALID_RESPONSE");
    for (const child of view.operations)
      await this.options.store.put(actor, child);
    return decodeWire("WorkflowView", JSON.parse(jcs(view)) as unknown);
  }
  async prepare(
    actor: Actor,
    intent: string,
    known: Record<string, unknown>,
    options: CallOptions = {},
  ): Promise<OperationView> {
    jsonValue(known);
    const view = await this.options.client.prepare(
      {
        actor,
        catalog_id: this.options.catalogId,
        catalog_version: this.options.registry.version,
        intent,
        known_arguments: known,
      },
      options,
    );
    await this.options.store.put(actor, view);
    return decodeWire("OperationView", JSON.parse(jcs(view)) as unknown);
  }
  async resolve(
    actor: Actor,
    id: string,
    revision: number,
    choice: string,
    args: Record<string, unknown>,
    options: CallOptions = {},
  ): Promise<OperationView> {
    const snapshot = await this.options.store.get(actor, id);
    if (
      snapshot.status !== "needs_choice" ||
      snapshot.revision !== revision ||
      !snapshot.candidates.some((c) => c.tool_id === choice)
    )
      throw new RemoteError("OPERATION_STATE_INVALID");
    const view = await this.options.client.resolve(
      id,
      {
        actor,
        expected_revision: revision,
        tool_choice: choice,
        arguments: args,
      },
      options,
    );
    await this.options.store.put(actor, view);
    return decodeWire("OperationView", JSON.parse(jcs(view)) as unknown);
  }
  private bindings(
    snapshot: OperationView,
    selected: SelectedTool,
    actor: Actor,
  ): void {
    if (
      snapshot.catalog_id !== this.options.catalogId ||
      snapshot.catalog_version !== this.options.registry.version ||
      !actor.allowed_tool_ids.includes(selected.tool_id)
    )
      throw new RemoteError("CATALOG_MISMATCH");
    const local = this.options.registry.get(selected.tool_id).metadata;
    if (
      local.effect !== selected.effect ||
      sha(local.input_schema) !== selected.schema_digest ||
      sha(selected.input_schema) !== selected.schema_digest
    )
      throw new RemoteError("DECISION_MISMATCH");
  }
  private decision(
    snapshot: OperationView,
    selected: SelectedTool,
    decision: ExecutionDecision,
    args: Record<string, unknown>,
  ): void {
    if (
      decision.operation_id !== snapshot.operation_id ||
      decision.catalog_id !== snapshot.catalog_id ||
      decision.catalog_version !== snapshot.catalog_version ||
      decision.tool_id !== selected.tool_id ||
      decision.schema_digest !== selected.schema_digest ||
      decision.effect !== selected.effect ||
      decision.arguments_digest !== sha(args) ||
      decision.operation_revision !==
        (snapshot.status === "decision_issued"
          ? snapshot.revision
          : snapshot.revision + 1)
    )
      throw new RemoteError("DECISION_MISMATCH");
  }
  async executeRead(
    actor: Actor,
    input: ExecuteInput,
    options: CallOptions = {},
  ): Promise<unknown> {
    return this.execute(actor, input, false, options);
  }
  async executeWrite(
    actor: Actor,
    input: ExecuteInput,
    options: CallOptions = {},
  ): Promise<unknown> {
    return this.execute(actor, input, true, options);
  }
  private async permitted(
    actor: Actor,
    toolId: string,
    args: Record<string, unknown>,
    mutation: boolean,
  ): Promise<boolean> {
    return (
      (await this.options.authorize(actor, toolId, args)) &&
      (!mutation ||
        (await this.options.approve?.(actor, toolId, args)) === true)
    );
  }
  private async execute(
    actor: Actor,
    input: ExecuteInput,
    mutation: boolean,
    options: CallOptions,
  ): Promise<unknown> {
    const args = frozenArguments(input.arguments);
    const snapshot = await this.options.store.get(actor, input.operation_id);
    if (
      snapshot.status !== "ready" &&
      snapshot.status !== "needs_arguments" &&
      snapshot.status !== "decision_issued"
    )
      throw new RemoteError("OPERATION_STATE_INVALID");
    const selected = snapshot.selected_tool;
    if ((selected.effect !== "read") !== mutation)
      throw new RemoteError("EFFECT_MISMATCH");
    this.bindings(snapshot, selected, actor);
    if (!(await this.permitted(actor, selected.tool_id, args, mutation)))
      throw new RemoteError("TOOL_NOT_ALLOWED");
    const issues = this.options.registry.validate(selected.tool_id, args);
    const firstIssue = issues[0];
    if (firstIssue) {
      const result: NeedsArgumentsOperation = {
        operation_id: snapshot.operation_id,
        revision: snapshot.revision,
        catalog_id: snapshot.catalog_id,
        catalog_version: snapshot.catalog_version,
        expires_at: snapshot.expires_at,
        status: "needs_arguments",
        selected_tool: selected,
        next_tool: mutation ? "execute_write_action" : "execute_read_action",
        issues: [firstIssue, ...issues.slice(1)],
        missing_paths: issues
          .filter((i) => i.code === "required")
          .map((i) => i.instance_path),
      };
      return result;
    }
    if (snapshot.status === "decision_issued") {
      this.decision(snapshot, selected, snapshot.decision, args);
      const replay = await this.options.store.replay(actor, snapshot.decision);
      if (replay.found) return replay.result;
    } else if (snapshot.revision !== input.operation_revision)
      throw new RemoteError("REVISION_CONFLICT");
    if (Date.parse(snapshot.expires_at) <= Date.now())
      throw new RemoteError("OPERATION_EXPIRED");
    const remote = await this.options.client.createExecutionDecision(
      snapshot.operation_id,
      { actor, expected_revision: snapshot.revision, arguments: args },
      {
        ...options,
        idempotencyKey: sha({
          id: input.operation_id,
          revision: snapshot.revision,
          args: args,
        }),
      },
    );
    if (remote.status === "needs_arguments") {
      await this.options.store.put(actor, remote);
      return remote;
    }
    const decision = remote.decision;
    this.decision(snapshot, selected, decision, args);
    const issued: OperationView = {
      operation_id: snapshot.operation_id,
      revision: decision.operation_revision,
      catalog_id: snapshot.catalog_id,
      catalog_version: snapshot.catalog_version,
      expires_at: snapshot.expires_at,
      status: "decision_issued",
      selected_tool: selected,
      decision,
    };
    await this.options.store.put(actor, issued);
    if (
      Date.parse(decision.not_after) <= Date.now() ||
      !(await this.permitted(actor, selected.tool_id, args, mutation))
    )
      throw new RemoteError("TOOL_NOT_ALLOWED");
    const claim = await this.options.store.claim(actor, decision);
    if ("replay" in claim) {
      if (!(await this.permitted(actor, selected.tool_id, args, mutation)))
        throw new RemoteError("TOOL_NOT_ALLOWED");
      return claim.replay;
    }
    if (!claim.fence) throw new RemoteError("STORE_UNAVAILABLE");
    const fence = claim.fence;
    if (
      options.signal?.aborted ||
      Date.parse(decision.not_after) <= Date.now()
    ) {
      await this.options.store.terminal(
        actor,
        decision,
        fence,
        "failed_before_dispatch",
      );
      throw new RemoteError("DECISION_EXPIRED");
    }
    await this.options.store.dispatch(actor, decision, fence);
    let result: unknown;
    try {
      // This is the only business invocation; timeout or invalid output never retries it.
      result = await this.options.registry.get(selected.tool_id).handler(args, {
        executionKey: decision.execution_key,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      jsonValue(result, { maxArray: 10000, maxProperties: 10000 });
      if (
        !record(result) ||
        !Array.isArray(result["content"]) ||
        Buffer.byteLength(jcs(result)) > 1048576
      )
        throw new RemoteError("INVALID_RESULT");
      for (const block of result["content"]) {
        if (
          !record(block) ||
          block["type"] !== "text" ||
          typeof block["text"] !== "string"
        )
          throw new RemoteError("UNSUPPORTED_RESULT_BLOCK");
      }
    } catch {
      try {
        await this.options.store.terminal(actor, decision, fence, "unknown");
      } catch {
        /* Durable dispatching remains uncertain. */
      }
      throw new RemoteError("EXECUTION_UNKNOWN");
    }
    try {
      await this.options.store.terminal(
        actor,
        decision,
        fence,
        result["isError"] === true ? "failed_after_dispatch" : "succeeded",
        result,
      );
    } catch {
      throw new RemoteError("EXECUTION_UNKNOWN");
    }
    return result;
  }
}
