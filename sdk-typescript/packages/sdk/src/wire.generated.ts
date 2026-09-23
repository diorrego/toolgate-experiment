/* Generated from shared/schemas/api.schema.json. Do not edit. */

export type WireValue =
  | Actor
  | CancelRequest
  | CancelledOperation
  | Candidate
  | Capabilities
  | CatalogDocument
  | CatalogInfo
  | CatalogUpload
  | DecisionIssuedResponse
  | DecisionRequest
  | DecisionResponse
  | Error
  | ErrorDetail
  | ExecutionDecision
  | Health
  | InspectRequest
  | IssuedOperation
  | NeedsArgumentsOperation
  | NeedsChoiceOperation
  | NoMatchOperation
  | OperationView
  | PrepareRequest
  | ReadyOperation
  | ReceiptRequest
  | ReceiptResponse
  | ResolveRequest
  | SelectedTool
  | ToolDescriptor
  | ToolEffect
  | ValidationIssue;
export type ToolEffect = "read" | "write" | "destructive" | "unknown";
export type DecisionResponse = DecisionIssuedResponse | NeedsArgumentsOperation;
export type OperationView =
  | ReadyOperation
  | NeedsArgumentsOperation
  | NeedsChoiceOperation
  | NoMatchOperation
  | CancelledOperation
  | IssuedOperation;

/**
 * Built exclusively by trusted provider code. Not accepted from MCP arguments. Service tenant/project/integration derive from the API credential.
 */
export interface Actor {
  /**
   * @minItems 0
   * @maxItems 10000
   */
  allowed_tool_ids: string[];
  authorization_revision: string;
  principal_ref: string;
  workspace_ref: string;
}
export interface CancelRequest {
  actor: Actor;
  expected_revision: number;
}
export interface CancelledOperation {
  catalog_id: string;
  catalog_version: string;
  expires_at: string;
  operation_id: string;
  revision: number;
  status: "cancelled";
}
export interface Candidate {
  description: string;
  effect: ToolEffect;
  title: string;
  tool_id: string;
}
export interface Capabilities {
  contract_version: "0.1.0";
  decision_ttl_seconds: 60;
  max_catalog_bytes: 16777216;
  max_catalog_tools: 10000;
  max_request_bytes: 262144;
  mcp_execution_owner: "provider-sdk";
  operation_ttl_seconds: 900;
  /**
   * @minItems 1
   * @maxItems 1
   */
  schema_profiles: ["tg-jsonschema-1"];
}
export interface CatalogDocument {
  catalog_id: string;
  catalog_version: string;
  created_at: string;
  schema_profile: "tg-jsonschema-1";
  tool_count: number;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  tools: [ToolDescriptor, ...ToolDescriptor[]];
}
export interface ToolDescriptor {
  /**
   * @minItems 0
   * @maxItems 32
   */
  aliases: string[];
  description: string;
  effect: ToolEffect;
  input_schema: {
    [k: string]: unknown;
  };
  name: string;
  open_world: boolean;
  output_schema?: {
    [k: string]: unknown;
  };
  schema_profile: "tg-jsonschema-1";
  /**
   * @minItems 0
   * @maxItems 32
   */
  tags: string[];
  title: string;
  tool_id: string;
}
export interface CatalogInfo {
  catalog_id: string;
  catalog_version: string;
  created_at: string;
  schema_profile: "tg-jsonschema-1";
  tool_count: number;
}
/**
 * Version in path = SHA-256(JCS(body)). Sort tools by tool_id before canonicalizing. Immutable and private to credential integration.
 */
export interface CatalogUpload {
  schema_profile: "tg-jsonschema-1";
  /**
   * @minItems 1
   * @maxItems 10000
   */
  tools: [ToolDescriptor, ...ToolDescriptor[]];
}
export interface DecisionIssuedResponse {
  decision: ExecutionDecision;
  status: "decision_issued";
}
/**
 * Server-to-server decision, not a bearer permission. Bind to tenant/integration/principal/workspace/operation. SDK MUST independently authorize, approve, validate and atomically deduplicate.
 */
export interface ExecutionDecision {
  arguments_digest: string;
  catalog_id: string;
  catalog_version: string;
  decision_id: string;
  effect: ToolEffect;
  execution_key: string;
  issued_at: string;
  not_after: string;
  operation_id: string;
  operation_revision: number;
  schema_digest: string;
  tool_id: string;
}
/**
 * Complete replacement arguments, not a patch. Validates and issues a decision; NEVER invokes the provider handler.
 */
export interface DecisionRequest {
  actor: Actor;
  /**
   * JSON object. Apply tg-jsonschema-1 value/byte/depth restrictions; no coercion or implicit merge.
   */
  arguments: {
    [k: string]: unknown;
  };
  expected_revision: number;
}
export interface NeedsArgumentsOperation {
  catalog_id: string;
  catalog_version: string;
  expires_at: string;
  /**
   * @minItems 1
   * @maxItems 128
   */
  issues: [ValidationIssue, ...ValidationIssue[]];
  /**
   * @minItems 0
   * @maxItems 128
   */
  missing_paths: string[];
  next_tool: "execute_read_action" | "execute_write_action";
  operation_id: string;
  revision: number;
  selected_tool: SelectedTool;
  status: "needs_arguments";
}
/**
 * Paths are RFC6901 JSON Pointers. Never include raw values. Branch failures do not mean union of branch requirements.
 */
export interface ValidationIssue {
  code:
    | "required"
    | "type"
    | "enum"
    | "const"
    | "additional_property"
    | "minimum"
    | "maximum"
    | "length"
    | "items"
    | "one_of"
    | "any_of"
    | "all_of"
    | "unsupported_value";
  instance_path: string;
  message_key: string;
  schema_path: string;
}
export interface SelectedTool {
  description: string;
  effect: ToolEffect;
  input_schema: {
    [k: string]: unknown;
  };
  name: string;
  open_world: boolean;
  schema_digest: string;
  title: string;
  tool_id: string;
}
export interface Error {
  error: ErrorDetail;
}
export interface ErrorDetail {
  code: string;
  /**
   * @minItems 0
   * @maxItems 128
   */
  issues?: ValidationIssue[];
  message_key: string;
  request_id: string;
  retryable: boolean;
}
export interface Health {
  status: "ok" | "not_ready";
}
export interface InspectRequest {
  actor: Actor;
}
export interface IssuedOperation {
  catalog_id: string;
  catalog_version: string;
  decision: ExecutionDecision;
  expires_at: string;
  operation_id: string;
  revision: number;
  selected_tool: SelectedTool;
  status: "decision_issued";
}
export interface NeedsChoiceOperation {
  /**
   * @minItems 2
   * @maxItems 5
   */
  candidates: [Candidate, Candidate, ...Candidate[]];
  catalog_id: string;
  catalog_version: string;
  expires_at: string;
  next_tool: "prepare_action";
  operation_id: string;
  reason: "ambiguous_intent" | "low_confidence";
  revision: number;
  status: "needs_choice";
}
export interface NoMatchOperation {
  catalog_id: string;
  catalog_version: string;
  expires_at: string;
  message_key: "toolgate.no_match.refine_intent";
  operation_id: string;
  reason: "no_authorized_tools" | "no_retrieval_match" | "selector_abstained";
  revision: number;
  status: "no_match";
}
/**
 * Selection and schema validation succeeded. This is NOT permission to bypass provider authorization or approval.
 */
export interface ReadyOperation {
  arguments_digest: string;
  catalog_id: string;
  catalog_version: string;
  expires_at: string;
  next_tool: "execute_read_action" | "execute_write_action";
  operation_id: string;
  revision: number;
  selected_tool: SelectedTool;
  status: "ready";
}
export interface PrepareRequest {
  actor: Actor;
  catalog_id: string;
  catalog_version: string;
  context_summary?: string;
  intent: string;
  /**
   * JSON object. Apply tg-jsonschema-1 value/byte/depth restrictions; no coercion or implicit merge.
   */
  known_arguments: {
    [k: string]: unknown;
  };
  locale?: "es" | "en";
}
/**
 * Optional metadata only. No raw arguments, results, URLs, stack traces or customer records.
 */
export interface ReceiptRequest {
  actor: Actor;
  decision_id: string;
  duration_ms: number;
  error_code?: string;
  outcome:
    | "succeeded"
    | "failed_before_dispatch"
    | "failed_after_dispatch"
    | "unknown";
}
export interface ReceiptResponse {
  recorded: true;
}
export interface ResolveRequest {
  actor: Actor;
  /**
   * JSON object. Apply tg-jsonschema-1 value/byte/depth restrictions; no coercion or implicit merge.
   */
  arguments: {
    [k: string]: unknown;
  };
  expected_revision: number;
  tool_choice: string;
}

export interface WireMap {
  Actor: Actor;
  CancelRequest: CancelRequest;
  CancelledOperation: CancelledOperation;
  Candidate: Candidate;
  Capabilities: Capabilities;
  CatalogDocument: CatalogDocument;
  CatalogInfo: CatalogInfo;
  CatalogUpload: CatalogUpload;
  DecisionIssuedResponse: DecisionIssuedResponse;
  DecisionRequest: DecisionRequest;
  DecisionResponse: DecisionResponse;
  Error: Error;
  ErrorDetail: ErrorDetail;
  ExecutionDecision: ExecutionDecision;
  Health: Health;
  InspectRequest: InspectRequest;
  IssuedOperation: IssuedOperation;
  NeedsArgumentsOperation: NeedsArgumentsOperation;
  NeedsChoiceOperation: NeedsChoiceOperation;
  NoMatchOperation: NoMatchOperation;
  OperationView: OperationView;
  PrepareRequest: PrepareRequest;
  ReadyOperation: ReadyOperation;
  ReceiptRequest: ReceiptRequest;
  ReceiptResponse: ReceiptResponse;
  ResolveRequest: ResolveRequest;
  SelectedTool: SelectedTool;
  ToolDescriptor: ToolDescriptor;
  ToolEffect: ToolEffect;
  ValidationIssue: ValidationIssue;
}
