import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const directory = mkdtempSync(join(tmpdir(), "toolgate-pack-"));
const capabilitySchema = JSON.parse(
  readFileSync("../shared/schemas/api.schema.json", "utf8"),
).$defs.Capabilities;
const capabilityFixture = Object.fromEntries(
  Object.entries(capabilitySchema.properties).map(([key, value]) => [
    key,
    value.items ? [value.items.const] : value.const,
  ]),
);
const output = JSON.parse(
  execFileSync(
    "npm",
    [
      "pack",
      "--workspace",
      "@toolgate/sdk",
      "--json",
      "--pack-destination",
      directory,
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(output.length, 1);
for (const file of output[0].files) {
  assert.match(file.path, /^(dist\/|package\.json$|README\.md$)/);
}
writeFileSync(
  join(directory, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(directory, output[0].filename),
  ],
  { cwd: directory, stdio: "pipe" },
);
writeFileSync(
  join(directory, "consumer.mjs"),
  `
import assert from 'node:assert/strict';
import { validateClientConfig, ToolgateError, createClient, ToolgateTransportError } from '@toolgate/sdk';
const config = validateClientConfig({baseUrl:'https://core.example',apiKey:async()=> 'synthetic', contractVersion:'0.1'});
assert.equal(config.timeoutMs,3500);
assert.throws(()=>validateClientConfig({...config,baseUrl:'http://remote.example'}),ToolgateError);
const client = createClient(config, async () => Response.json(${JSON.stringify(capabilityFixture)}));
assert.equal((await client.getCapabilities()).mcpExecutionOwner, 'provider-sdk');
client.close();
await assert.rejects(client.getCapabilities(), ToolgateTransportError);
`,
);
execFileSync(process.execPath, ["consumer.mjs"], {
  cwd: directory,
  stdio: "inherit",
});
writeFileSync(
  join(directory, "consumer.ts"),
  `
import { validateClientConfig, createClient, type Capabilities } from '@toolgate/sdk';
const config = validateClientConfig({baseUrl:'https://core.example',apiKey:async()=> 'synthetic',contractVersion:'0.1'});
const timeout: number = config.timeoutMs;
// @ts-expect-error immutable public configuration
config.baseUrl = 'https://changed.example';
void timeout;
const result: Promise<Capabilities> = createClient(config).getCapabilities();
// @ts-expect-error negotiated version is fixed by the shared contract
const wrong: Capabilities['contractVersion'] = '0.2.0';
void result; void wrong;
`,
);
execFileSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    "--strict",
    "--noEmit",
    "--target",
    "ES2023",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "consumer.ts",
  ],
  { cwd: directory, stdio: "inherit" },
);
const installed = JSON.parse(
  readFileSync(
    join(directory, "node_modules/@toolgate/sdk/package.json"),
    "utf8",
  ),
);
assert.equal(installed.sideEffects, false);
console.log("External tarball runtime and type consumer passed:", directory);
