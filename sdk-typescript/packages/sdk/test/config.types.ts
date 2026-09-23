import { validateClientConfig } from "../src/index.js";

validateClientConfig({
  baseUrl: "https://core.example",
  apiKey: () => Promise.resolve("synthetic"),
  contractVersion: "0.1",
});
validateClientConfig({
  baseUrl: "https://core.example",
  apiKey: () => Promise.resolve("synthetic"),
  // @ts-expect-error Contract negotiation must be explicit and supported.
  contractVersion: "9.0",
});
validateClientConfig({
  baseUrl: "https://core.example",
  // @ts-expect-error No browser key string; credentials come from server code.
  apiKey: "secret",
  contractVersion: "0.1",
});
