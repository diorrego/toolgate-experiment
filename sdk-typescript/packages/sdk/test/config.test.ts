import assert from "node:assert/strict";
import test from "node:test";
import { validateClientConfig, ToolgateError } from "../src/index.ts";

const key = () => Promise.resolve("synthetic-key");

await test("validates configuration without invoking credentials or network", () => {
  let calls = 0;
  const config = validateClientConfig({
    baseUrl: "https://core.example",
    apiKey: () => {
      calls++;
      return key();
    },
    contractVersion: "0.1",
  });
  assert.equal(config.baseUrl, "https://core.example/");
  assert.equal(config.timeoutMs, 3500);
  assert.equal(calls, 0);
  assert.equal(Object.isFrozen(config), true);
});

await test("rejects unsafe URLs without exposing embedded credentials", () => {
  for (const baseUrl of [
    "http://remote.example",
    "http://127.0.0.1:9081",
    "https://secret:password@core.example",
    "https://core.example/?token=sentinel",
    "https://core.example/#fragment",
    "https://core.example/path",
    "not a URL",
  ]) {
    assert.throws(
      () =>
        validateClientConfig({ baseUrl, apiKey: key, contractVersion: "0.1" }),
      (error: unknown) => {
        assert.ok(error instanceof ToolgateError);
        assert.equal(error.code, "INVALID_CONFIGURATION");
        assert.equal(JSON.stringify(error).includes("secret"), false);
        assert.equal(JSON.stringify(error).includes("sentinel"), false);
        return true;
      },
    );
  }
});

await test("HTTP development opt-in is restricted to literal loopback", () => {
  for (const baseUrl of ["http://127.0.0.1:9081", "http://[::1]:9082"]) {
    assert.equal(
      validateClientConfig({
        baseUrl,
        apiKey: key,
        contractVersion: "0.1",
        allowInsecureLocalhost: true,
      }).baseUrl,
      `${baseUrl}/`,
    );
  }
  assert.throws(
    () =>
      validateClientConfig({
        baseUrl: "http://remote.example",
        apiKey: key,
        contractVersion: "0.1",
        allowInsecureLocalhost: true,
      }),
    ToolgateError,
  );
});

await test("timeouts must be finite positive integral milliseconds", () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, 0.5, 2147483648]) {
    assert.throws(
      () =>
        validateClientConfig({
          baseUrl: "https://core.example",
          apiKey: key,
          contractVersion: "0.1",
          timeoutMs,
        }),
      ToolgateError,
    );
  }
});

await test("rejects invalid JavaScript configuration at runtime", () => {
  for (const value of [
    null,
    {},
    { baseUrl: "https://core.example", contractVersion: "9.0", apiKey: key },
    {
      baseUrl: "https://core.example",
      contractVersion: "0.1",
      apiKey: key,
      timeoutMs: null,
    },
  ]) {
    assert.throws(
      () => Reflect.apply(validateClientConfig, undefined, [value]),
      ToolgateError,
    );
  }
});
