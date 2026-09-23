// Generated from shared/schemas/api.schema.json. Do not edit.
export const wireCapabilities = {
  contract_version: "0.1.0",
  decision_ttl_seconds: 60,
  max_catalog_bytes: 16777216,
  max_catalog_tools: 10000,
  max_request_bytes: 262144,
  mcp_execution_owner: "provider-sdk",
  operation_ttl_seconds: 900,
  schema_profiles: ["tg-jsonschema-1"],
} as const;
export const capabilities = {
  contractVersion: "0.1.0",
  decisionTtlSeconds: 60,
  maxCatalogBytes: 16777216,
  maxCatalogTools: 10000,
  maxRequestBytes: 262144,
  mcpExecutionOwner: "provider-sdk",
  operationTtlSeconds: 900,
  schemaProfiles: ["tg-jsonschema-1"],
} as const;
Object.freeze(capabilities.schemaProfiles);
Object.freeze(capabilities);
export type Capabilities = typeof capabilities;
