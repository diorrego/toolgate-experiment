export {
  validateClientConfig,
  ToolgateError,
  type ClientConfig,
} from "./config.ts";
export {
  createClient,
  ToolgateTransportError,
  type HttpTransport,
} from "./client.ts";
export type { Capabilities } from "./capabilities.generated.ts";

export {
  RemoteClient,
  RemoteError,
  type RemoteMetric,
  type CallOptions,
  type WorkflowOptions,
  type WorkflowTrace,
} from "./remote.ts";
export {
  ToolRegistry,
  ToolgateProvider,
  type LocalTool,
  type ProviderOptions,
  type ExecuteInput,
} from "./provider.ts";
export { PostgresStore } from "./store.ts";
export type {
  Actor,
  ToolDescriptor,
  CatalogUpload,
  OperationView,
} from "./wire.generated.ts";
