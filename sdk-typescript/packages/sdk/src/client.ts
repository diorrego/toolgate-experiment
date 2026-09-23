import { validateClientConfig, type ClientConfig } from "./config.ts";
import {
  capabilities,
  wireCapabilities,
  type Capabilities,
} from "./capabilities.generated.ts";
import { parseWireJson } from "./json.ts";

type ErrorCode =
  | "INVALID_RESPONSE"
  | "PAYLOAD_TOO_LARGE"
  | "REQUEST_ABORTED"
  | "DEADLINE_EXCEEDED"
  | "CLIENT_CLOSED"
  | "TRANSPORT_ERROR"
  | "INVALID_CREDENTIAL"
  | "HTTP_ERROR";

/** Sanitized transport failure. This slice does not retry or expose remote bodies. */
export class ToolgateTransportError extends Error {
  readonly retryable = false;
  readonly code: ErrorCode;
  readonly httpStatus: number | undefined;
  constructor(code: ErrorCode, httpStatus?: number) {
    super(`Toolgate request failed: ${code}`);
    this.name = "ToolgateTransportError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
  toJSON(): {
    code: ErrorCode;
    retryable: boolean;
    httpStatus: number | undefined;
  } {
    return {
      code: this.code,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
    };
  }
}

/** Injected fetch must honor the supplied signal; its dispatcher belongs to the host. */
export type HttpTransport = (
  url: string,
  options: RequestInit,
) => Promise<Response>;

function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item: unknown, index: number) =>
        matches(actual[index], item),
      )
    );
  }
  return actual === expected;
}

function decodeCapabilities(input: unknown): Capabilities {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== Object.keys(wireCapabilities).length ||
    !Object.entries(wireCapabilities).every(
      ([key, expected]) =>
        key in input && matches(Reflect.get(input, key), expected),
    )
  ) {
    throw new ToolgateTransportError("INVALID_RESPONSE");
  }
  return capabilities;
}

/** Reusable negotiation client. No network/credentials are accessed by construction. */
export function createClient(
  config: ClientConfig,
  transport: HttpTransport = fetch,
): {
  getCapabilities(signal?: AbortSignal): Promise<Capabilities>;
  close(): void;
} {
  const settings = validateClientConfig(config);
  const lifecycle = new AbortController();
  return {
    close() {
      lifecycle.abort();
    },
    async getCapabilities(callerSignal?: AbortSignal): Promise<Capabilities> {
      if (lifecycle.signal.aborted)
        throw new ToolgateTransportError("CLIENT_CLOSED");
      if (callerSignal?.aborted)
        throw new ToolgateTransportError("REQUEST_ABORTED");
      const deadline = new AbortController();
      const timer = setTimeout(() => {
        deadline.abort();
      }, settings.timeoutMs);
      const signals = [lifecycle.signal, deadline.signal];
      if (callerSignal) signals.push(callerSignal);
      const signal = AbortSignal.any(signals);
      const cancellation = (): ToolgateTransportError =>
        new ToolgateTransportError(
          lifecycle.signal.aborted
            ? "CLIENT_CLOSED"
            : callerSignal?.aborted
              ? "REQUEST_ABORTED"
              : "DEADLINE_EXCEEDED",
        );
      const checkCancellation = (): void => {
        if (signal.aborted) throw cancellation();
      };
      let abortListener = (): void => {};
      const cancelled = new Promise<never>((_, reject) => {
        abortListener = () => {
          reject(cancellation());
        };
        signal.addEventListener("abort", abortListener, { once: true });
      });
      const bounded = <T>(work: Promise<T>): Promise<T> =>
        Promise.race([work, cancelled]);
      try {
        const key = await bounded(settings.apiKey());
        if (typeof key !== "string" || !/^[\x21-\x7e]+$/.test(key))
          throw new ToolgateTransportError("INVALID_CREDENTIAL");
        checkCancellation();
        const response = await bounded(
          transport(new URL("v1/capabilities", settings.baseUrl).href, {
            method: "GET",
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "X-Toolgate-Contract": settings.contractVersion,
              Accept: "application/json",
            },
          }),
        );
        if (response.redirected || response.status !== 200) {
          await bounded(response.body?.cancel() ?? Promise.resolve());
          throw new ToolgateTransportError("HTTP_ERROR", response.status);
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
          throw new ToolgateTransportError("INVALID_RESPONSE");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let raw = "";
        try {
          let chunk = await bounded(reader.read());
          while (!chunk.done) {
            const value = chunk.value;
            bytes += value.byteLength;
            if (bytes > 262144)
              throw new ToolgateTransportError("PAYLOAD_TOO_LARGE");
            raw += decoder.decode(value, { stream: true });
            chunk = await bounded(reader.read());
          }
          raw += decoder.decode();
        } catch (error) {
          // Do not wait on a misbehaving injected stream after the budget expires.
          void reader.cancel().catch(() => {});
          if (error instanceof ToolgateTransportError) throw error;
          throw new ToolgateTransportError("INVALID_RESPONSE");
        } finally {
          reader.releaseLock();
        }
        checkCancellation();
        try {
          return decodeCapabilities(parseWireJson(raw));
        } catch {
          throw new ToolgateTransportError("INVALID_RESPONSE");
        }
      } catch (error) {
        checkCancellation();
        if (error instanceof ToolgateTransportError) throw error;
        throw new ToolgateTransportError("TRANSPORT_ERROR");
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abortListener);
      }
    },
  };
}
