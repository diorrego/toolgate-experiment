import assert from "node:assert/strict";
import test from "node:test";
import { RemoteClient, type RemoteMetric } from "../src/remote.ts";

await test("remote usage keeps missing headers unknown and counts even invalid response bodies", async () => {
  for (const headers of [
    {
      "x-toolgate-jev-calls": "1",
      "x-toolgate-jev-usage-calls": "1",
      "x-toolgate-jev-input-tokens": "123",
      "x-toolgate-jev-output-tokens": "7",
      "x-toolgate-selector-ms": "50.25",
      "x-toolgate-jev-max-concurrent": "22",
    },
    {},
    {
      "x-toolgate-jev-input-tokens": "9007199254740992",
      "x-toolgate-jev-output-tokens": "1.5",
      "x-toolgate-selector-ms": "-1",
      "x-toolgate-jev-max-concurrent": "1.5",
    },
  ]) {
    const metrics: RemoteMetric[] = [];
    const client = new RemoteClient(
      {
        baseUrl: "https://core.example",
        contractVersion: "0.1",
        apiKey: () => Promise.resolve("synthetic"),
      },
      {
        transport: () =>
          Promise.resolve(
            new Response("{}", {
              headers: { "content-type": "application/json", ...headers },
            }),
          ),
        onRequest: (metric) => metrics.push(metric),
      },
    );
    await assert.rejects(client.getCapabilities());
    assert.equal(metrics.length, 1);
    const hop = metrics[0]?.hops[0];
    assert.equal(
      hop?.jevInputTokens,
      headers["x-toolgate-jev-input-tokens"] === "123" ? 123 : null,
    );
    assert.equal(
      hop.jevOutputTokens,
      headers["x-toolgate-jev-output-tokens"] === "7" ? 7 : null,
    );
    assert.equal(
      hop.jevUsageCalls,
      headers["x-toolgate-jev-usage-calls"] === "1" ? 1 : null,
    );
    assert.equal(
      hop.selectorMs,
      headers["x-toolgate-selector-ms"] === "50.25" ? 50.25 : null,
    );
    assert.equal(
      hop.jevMaxConcurrent,
      headers["x-toolgate-jev-max-concurrent"] === "22" ? 22 : null,
    );
    client.close();
  }
});
