import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createClient, ToolgateTransportError } from "../src/client.ts";

const schema = JSON.parse(
  readFileSync(
    new URL("../../../../shared/schemas/api.schema.json", import.meta.url),
    "utf8",
  ),
) as {
  $defs: {
    Capabilities: {
      properties: Record<
        string,
        { const?: unknown; items?: { const: unknown } }
      >;
    };
  };
};
const capabilities = Object.fromEntries(
  Object.entries(schema.$defs.Capabilities.properties).map(([key, value]) => [
    key,
    value.items ? [value.items.const] : value.const,
  ]),
);
const config = {
  baseUrl: "https://core.example",
  apiKey: () => Promise.resolve("synthetic-service-key"),
  contractVersion: "0.1" as const,
};

await test("negotiates generated capabilities with service headers and fixed origin", async () => {
  let calls = 0;
  const client = createClient(config, (url, options) => {
    calls++;
    assert.equal(url, "https://core.example/v1/capabilities");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("Authorization"), "Bearer synthetic-service-key");
    assert.equal(headers.get("X-Toolgate-Contract"), "0.1");
    assert.equal(options.redirect, "error");
    return Promise.resolve(Response.json(capabilities));
  });
  assert.equal(calls, 0);
  assert.equal((await client.getCapabilities()).contractVersion, "0.1.0");
  assert.equal(calls, 1);
  client.close();
  client.close();
  await assert.rejects(client.getCapabilities(), { code: "CLIENT_CLOSED" });
});

await test("rejects unsupported contract and unknown fields without coercion", async () => {
  for (const value of [
    { ...capabilities, extra: true },
    { ...capabilities, max_catalog_tools: "10000" },
    { ...capabilities, contract_version: "0.2.0" },
  ]) {
    const client = createClient(config, () =>
      Promise.resolve(Response.json(value)),
    );
    await assert.rejects(client.getCapabilities(), {
      code: "INVALID_RESPONSE",
    });
  }
});

await test("rejects invalid raw JSON, duplicate escaped keys, invalid UTF-8 and oversized bodies", async () => {
  for (const bytes of [
    "",
    "<html>sentinel</html>",
    '{"a":1,"\\u0061":2}',
    '{"__proto__":{}}',
    "[".repeat(34) + "0" + "]".repeat(34),
    "x".repeat(262145),
    new Uint8Array([0xff]),
  ]) {
    const client = createClient(config, () =>
      Promise.resolve(
        new Response(bytes, {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await assert.rejects(client.getCapabilities(), ToolgateTransportError);
  }
});

await test("rejects wrong content type, HTTP errors and redirects without retry", async () => {
  for (const response of [
    new Response("secret", { status: 401 }),
    new Response("secret", { status: 429 }),
    new Response("", {
      status: 302,
      headers: { Location: "https://untrusted.invalid" },
    }),
    new Response(JSON.stringify(capabilities), {
      headers: { "content-type": "text/html" },
    }),
  ]) {
    let count = 0;
    const client = createClient(config, () => {
      count++;
      return Promise.resolve(response);
    });
    await assert.rejects(
      client.getCapabilities(),
      (error: unknown) =>
        error instanceof ToolgateTransportError &&
        !JSON.stringify(error).includes("secret"),
    );
    assert.equal(count, 1);
  }
});

await test("abort before call never resolves credentials or opens network", async () => {
  let credentials = 0;
  const client = createClient({
    ...config,
    apiKey: () => {
      credentials++;
      return Promise.resolve("key");
    },
  });
  await assert.rejects(client.getCapabilities(AbortSignal.abort()), {
    code: "REQUEST_ABORTED",
  });
  assert.equal(credentials, 0);
});

await test("deadline includes a stalled credential resolver", async () => {
  const client = createClient({
    ...config,
    timeoutMs: 15,
    apiKey: () => new Promise<string>(() => {}),
  });
  await assert.rejects(client.getCapabilities(), { code: "DEADLINE_EXCEEDED" });
});

await test("abort and close cancel in-flight calls even when injected transport stalls", async () => {
  for (const method of ["abort", "close"]) {
    const controller = new AbortController();
    const client = createClient(config, () => new Promise<Response>(() => {}));
    const pending = client.getCapabilities(controller.signal);
    if (method === "abort") controller.abort();
    else client.close();
    await assert.rejects(pending, {
      code: method === "abort" ? "REQUEST_ABORTED" : "CLIENT_CLOSED",
    });
  }
});

await test("credentials and thrown transport errors cannot escape through SDK errors", async () => {
  for (const key of ["", "bad\r\nheader"]) {
    let calls = 0;
    const client = createClient(
      { ...config, apiKey: () => Promise.resolve(key) },
      () => {
        calls++;
        return Promise.reject(Error("secret"));
      },
    );
    await assert.rejects(client.getCapabilities(), {
      code: "INVALID_CREDENTIAL",
    });
    assert.equal(calls, 0);
  }
  const client = createClient(config, () =>
    Promise.reject(Error("sentinel-token")),
  );
  await assert.rejects(
    client.getCapabilities(),
    (error: unknown) =>
      error instanceof ToolgateTransportError &&
      error.code === "TRANSPORT_ERROR" &&
      !JSON.stringify(error).includes("sentinel"),
  );
});

await test("actual fetch never follows a redirect carrying credentials", async () => {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? "");
    response.writeHead(302, { Location: "/leak" });
    response.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const client = createClient({
      ...config,
      baseUrl: `http://127.0.0.1:${String(address.port)}`,
      allowInsecureLocalhost: true,
    });
    await assert.rejects(client.getCapabilities(), { code: "TRANSPORT_ERROR" });
    assert.deepEqual(hits, ["/v1/capabilities"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

await test("deadline includes streamed response body and cancels its reader", async () => {
  let cancelled = false;
  const client = createClient({ ...config, timeoutMs: 15 }, () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    ),
  );
  await assert.rejects(client.getCapabilities(), { code: "DEADLINE_EXCEEDED" });
  assert.equal(cancelled, true);
});
