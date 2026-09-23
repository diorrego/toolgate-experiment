/** Server-side connection configuration. Importing the SDK opens no resources. */
export interface ClientConfig {
  readonly baseUrl: string;
  readonly apiKey: () => Promise<string>;
  readonly contractVersion: "0.1";
  readonly timeoutMs?: number;
  /** Development only: allow HTTP on literal 127.0.0.1 or ::1. */
  readonly allowInsecureLocalhost?: boolean;
}

/** A sanitized error which never retains the invalid URL or credentials. */
export class ToolgateError extends Error {
  readonly code = "INVALID_CONFIGURATION";
  readonly retryable = false;

  constructor() {
    super("Invalid Toolgate client configuration");
    this.name = "ToolgateError";
  }

  toJSON(): { code: string; retryable: boolean } {
    return { code: this.code, retryable: this.retryable };
  }
}

/**
 * Validate connection settings without resolving keys or opening a connection.
 * Throws a sanitized ToolgateError. The returned copy is immutable; resources
 * supplied by the provider remain owned by the provider.
 */
export function validateClientConfig(
  config: ClientConfig,
): Readonly<ClientConfig & { timeoutMs: number }> {
  if (!isClientConfig(config)) {
    throw new ToolgateError();
  }
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new ToolgateError();
  }
  const localHttp =
    config.allowInsecureLocalhost === true &&
    url.protocol === "http:" &&
    ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new ToolgateError();
  }
  const timeoutMs = config.timeoutMs ?? 3500;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  ) {
    throw new ToolgateError();
  }
  return Object.freeze({
    baseUrl: url.href,
    apiKey: config.apiKey,
    contractVersion: config.contractVersion,
    timeoutMs,
    allowInsecureLocalhost: config.allowInsecureLocalhost ?? false,
  });
}

// JavaScript callers can bypass declarations; validate the original values.
function isClientConfig(value: unknown): value is ClientConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "baseUrl" in value &&
    typeof value.baseUrl === "string" &&
    "apiKey" in value &&
    typeof value.apiKey === "function" &&
    "contractVersion" in value &&
    value.contractVersion === "0.1" &&
    (!("timeoutMs" in value) ||
      value.timeoutMs === undefined ||
      typeof value.timeoutMs === "number") &&
    (!("allowInsecureLocalhost" in value) ||
      value.allowInsecureLocalhost === undefined ||
      typeof value.allowInsecureLocalhost === "boolean")
  );
}
