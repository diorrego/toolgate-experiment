import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { validateClientConfig, type ClientConfig } from "./config.ts";
import { parseWireJson } from "./json.ts";
import { decodeWire, jcs } from "./codec.ts";
import type {
  WireMap,
  CatalogUpload,
  PrepareRequest,
  ResolveRequest,
  DecisionRequest,
  InspectRequest,
  CancelRequest,
  ReceiptRequest,
} from "./wire.generated.ts";
import type { HttpTransport } from "./client.ts";

/** Only sanitized metadata; never arguments, service keys or business results. */
export interface RemoteMetric {
  path: string;
  durationMs: number;
  attempts: number;
  requestId: string | null;
  status: number | null;
  hops: {
    requestId: string | null;
    status: number;
    coreTiming: string | null;
    jevCalls: number | null;
    jevMs: number | null;
    /** Selector wall time; overlapping Jev request durations must not be added to it. */
    selectorMs: number | null;
    jevMaxConcurrent: number | null;
    selectorProfile: "choice" | "binary-parallel-v1" | null;
    jevUsageCalls: number | null;
    jevInputTokens: number | null;
    jevOutputTokens: number | null;
  }[];
}
export interface CallOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
}
export class RemoteError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(code: string, retryable = false, status: number | null = null) {
    super(code);
    this.name = "RemoteError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
  toJSON(): { code: string; retryable: boolean; status: number | null } {
    return { code: this.code, retryable: this.retryable, status: this.status };
  }
}
const part = (value: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw new RemoteError("INVALID_REQUEST");
  return encodeURIComponent(value);
};
/** Reusable HTTPS transport; all business selection remains in the remote core. */
export class RemoteClient {
  private readonly settings: ReturnType<typeof validateClientConfig>;
  private readonly lifecycle = new AbortController();
  private readonly transport: HttpTransport;
  private readonly metric: ((value: RemoteMetric) => void) | undefined;
  constructor(
    config: ClientConfig,
    options: {
      transport?: HttpTransport;
      onRequest?: (value: RemoteMetric) => void;
    } = {},
  ) {
    this.settings = validateClientConfig(config);
    this.transport = options.transport ?? fetch;
    this.metric = options.onRequest;
  }
  close(): void {
    this.lifecycle.abort();
  }
  getCapabilities(options: CallOptions = {}) {
    return this.call(
      "GET",
      "/v1/capabilities",
      null,
      null,
      "Capabilities",
      options,
    );
  }
  putCatalog(
    id: string,
    version: string,
    body: CatalogUpload,
    options: CallOptions = {},
  ) {
    return this.call(
      "PUT",
      `/v1/catalogs/${part(id)}/versions/${part(version)}`,
      "CatalogUpload",
      body,
      "CatalogInfo",
      options,
    );
  }
  getCatalog(id: string, version: string, options: CallOptions = {}) {
    return this.call(
      "GET",
      `/v1/catalogs/${part(id)}/versions/${part(version)}`,
      null,
      null,
      "CatalogDocument",
      options,
    );
  }
  prepare(body: PrepareRequest, options: CallOptions = {}) {
    return this.call(
      "POST",
      "/v1/operations",
      "PrepareRequest",
      body,
      "OperationView",
      options,
    );
  }
  resolve(id: string, body: ResolveRequest, options: CallOptions = {}) {
    return this.call(
      "POST",
      `/v1/operations/${part(id)}/resolve`,
      "ResolveRequest",
      body,
      "OperationView",
      options,
    );
  }
  createExecutionDecision(
    id: string,
    body: DecisionRequest,
    options: CallOptions = {},
  ) {
    return this.call(
      "POST",
      `/v1/operations/${part(id)}/execution-decisions`,
      "DecisionRequest",
      body,
      "DecisionResponse",
      options,
    );
  }
  inspect(id: string, body: InspectRequest, options: CallOptions = {}) {
    return this.call(
      "POST",
      `/v1/operations/${part(id)}/inspect`,
      "InspectRequest",
      body,
      "OperationView",
      options,
    );
  }
  cancel(id: string, body: CancelRequest, options: CallOptions = {}) {
    return this.call(
      "POST",
      `/v1/operations/${part(id)}/cancel`,
      "CancelRequest",
      body,
      "OperationView",
      options,
    );
  }
  receipt(id: string, body: ReceiptRequest, options: CallOptions = {}) {
    return this.call(
      "POST",
      `/v1/operations/${part(id)}/receipts`,
      "ReceiptRequest",
      body,
      "ReceiptResponse",
      options,
    );
  }
  private async call<K extends keyof WireMap>(
    method: string,
    path: string,
    input: keyof WireMap | null,
    body: unknown,
    output: K,
    options: CallOptions,
  ): Promise<WireMap[K]> {
    if (this.lifecycle.signal.aborted) throw new RemoteError("CLIENT_CLOSED");
    if (options.signal?.aborted) throw new RemoteError("REQUEST_ABORTED");
    let raw: string | undefined;
    try {
      if (input) {
        decodeWire(input, body);
        raw = jcs(body);
      }
    } catch {
      throw new RemoteError("INVALID_REQUEST");
    }
    const maximum = method === "PUT" ? 16777216 : 262144;
    if (raw && Buffer.byteLength(raw) > maximum)
      throw new RemoteError("PAYLOAD_TOO_LARGE");
    const idempotency = options.idempotencyKey ?? randomUUID();
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotency))
      throw new RemoteError("INVALID_REQUEST");
    const started = performance.now();
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort();
    }, this.settings.timeoutMs);
    const signals = [deadline.signal, this.lifecycle.signal];
    if (options.signal) signals.push(options.signal);
    const signal = AbortSignal.any(signals);
    const abortError = () =>
      new RemoteError(
        this.lifecycle.signal.aborted
          ? "CLIENT_CLOSED"
          : options.signal?.aborted
            ? "REQUEST_ABORTED"
            : "DEADLINE_EXCEEDED",
      );
    let listener = (): void => {};
    const aborted = new Promise<never>((_, reject) => {
      listener = () => {
        reject(abortError());
      };
      signal.addEventListener("abort", listener, { once: true });
    });
    const bounded = <T>(promise: Promise<T>): Promise<T> =>
      Promise.race([promise, aborted]);
    const hops: RemoteMetric["hops"] = [];
    let attempts = 0;
    let requestId: string | null = null;
    let status: number | null = null;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const key = await bounded(this.settings.apiKey());
        if (typeof key !== "string" || !/^[\x21-\x7e]+$/.test(key))
          throw new RemoteError("INVALID_CREDENTIAL");
        signal.throwIfAborted();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${key}`,
          "X-Toolgate-Contract": "0.1",
          Accept: "application/json",
        };
        if (raw !== undefined) headers["Content-Type"] = "application/json";
        if (method === "POST" && !path.endsWith("/inspect"))
          headers["Idempotency-Key"] = idempotency;
        attempts++;
        const response = await bounded(
          this.transport(new URL(path, this.settings.baseUrl).href, {
            method,
            headers,
            redirect: "error",
            signal,
            ...(raw !== undefined ? { body: raw } : {}),
          }),
        );
        status = response.status;
        requestId = response.headers.get("x-request-id");
        const metricNumber = (name: string): number | null => {
          const raw = response.headers.get(name);
          const value =
            raw !== null && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
          return value !== null && Number.isFinite(value) ? value : null;
        };
        const metricInteger = (name: string): number | null => {
          const value = metricNumber(name);
          return value !== null && Number.isSafeInteger(value) ? value : null;
        };
        hops.push({
          requestId,
          status: response.status,
          coreTiming: response.headers.get("server-timing"),
          jevCalls: metricNumber("x-toolgate-jev-calls"),
          jevMs: metricNumber("x-toolgate-jev-ms"),
          selectorMs: metricNumber("x-toolgate-selector-ms"),
          jevMaxConcurrent: metricInteger("x-toolgate-jev-max-concurrent"),
          selectorProfile:
            response.headers.get("x-toolgate-selector-profile") === "choice"
              ? "choice"
              : response.headers.get("x-toolgate-selector-profile") ===
                  "binary-parallel-v1"
                ? "binary-parallel-v1"
                : null,
          jevUsageCalls: metricInteger("x-toolgate-jev-usage-calls"),
          jevInputTokens: metricInteger("x-toolgate-jev-input-tokens"),
          jevOutputTokens: metricInteger("x-toolgate-jev-output-tokens"),
        });
        if (
          response.redirected ||
          (response.status >= 300 && response.status < 400)
        ) {
          await bounded(response.body?.cancel() ?? Promise.resolve());
          throw new RemoteError("INVALID_RESPONSE");
        }
        if (
          response.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase() !== "application/json" ||
          !response.body
        ) {
          await bounded(response.body?.cancel() ?? Promise.resolve());
          throw new RemoteError("INVALID_RESPONSE");
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        const limit = output === "CatalogDocument" ? 16777216 : 262144;
        try {
          let chunk = await bounded(reader.read());
          while (!chunk.done) {
            size += chunk.value.byteLength;
            if (size > limit) throw new RemoteError("PAYLOAD_TOO_LARGE");
            chunks.push(chunk.value);
            chunk = await bounded(reader.read());
          }
        } catch (error) {
          void reader.cancel().catch(() => {});
          throw error;
        } finally {
          reader.releaseLock();
        }
        let value: unknown;
        try {
          value = parseWireJson(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            ),
            10000,
          );
        } catch {
          throw new RemoteError("INVALID_RESPONSE");
        }
        if (response.ok) {
          if (response.status !== (path === "/v1/operations" ? 201 : 200))
            throw new RemoteError("INVALID_RESPONSE");
          try {
            return decodeWire(output, value);
          } catch {
            throw new RemoteError("INVALID_RESPONSE");
          }
        }
        let error: WireMap["Error"];
        try {
          error = decodeWire("Error", value);
        } catch {
          throw new RemoteError("INVALID_RESPONSE");
        }
        const failure = new RemoteError(
          error.error.code,
          error.error.retryable,
          response.status,
        );
        const retry =
          attempt === 0 &&
          error.error.retryable &&
          [409, 429, 503, 504].includes(response.status);
        const after = response.headers.get("retry-after");
        let delay = 50;
        if (after) {
          delay = /^\d+$/.test(after)
            ? Number(after) * 1000
            : Math.max(0, Date.parse(after) - Date.now());
        }
        if (
          !retry ||
          !Number.isFinite(delay) ||
          performance.now() - started + delay >= this.settings.timeoutMs
        )
          throw failure;
        await bounded(wait(delay, undefined, { signal }));
      }
      throw new RemoteError("RETRY_EXHAUSTED");
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (error instanceof RemoteError) throw error;
      throw new RemoteError("TRANSPORT_ERROR");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", listener);
      try {
        this.metric?.({
          path: path.replace(/[0-9a-f-]{36}/g, ":operation"),
          durationMs: performance.now() - started,
          attempts,
          hops,
          requestId,
          status,
        });
      } catch {
        /* Observability cannot alter dispatch semantics. */
      }
    }
  }
}
