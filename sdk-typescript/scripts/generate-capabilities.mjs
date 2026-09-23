import { URL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";

const root = new URL("../../", import.meta.url);
const schema = JSON.parse(
  readFileSync(new URL("shared/schemas/api.schema.json", root), "utf8"),
).$defs.Capabilities;
if (
  schema.additionalProperties !== false ||
  Object.keys(schema.properties).sort().join() !==
    [...schema.required].sort().join()
) {
  throw Error("Capabilities shape changed; review the codec generator");
}
const wire = {};
const local = {};
for (const [name, spec] of Object.entries(schema.properties)) {
  let value;
  if (Object.hasOwn(spec, "const")) value = spec.const;
  else if (
    spec.type === "array" &&
    spec.minItems === 1 &&
    spec.maxItems === 1 &&
    Object.hasOwn(spec.items, "const")
  )
    value = [spec.items.const];
  else throw Error("Capabilities shape changed; review the codec generator");
  wire[name] = value;
  local[name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
}
const code = await format(
  `// Generated from shared/schemas/api.schema.json. Do not edit.
export const wireCapabilities = ${JSON.stringify(wire)} as const;
export const capabilities = ${JSON.stringify(local)} as const;
Object.freeze(capabilities.schemaProfiles);
Object.freeze(capabilities);
export type Capabilities = typeof capabilities;
`,
  { parser: "typescript" },
);
const path = new URL(
  "packages/sdk/src/capabilities.generated.ts",
  new URL("../", import.meta.url),
);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== code)
    throw Error("Generated capabilities drift");
} else writeFileSync(path, code);
