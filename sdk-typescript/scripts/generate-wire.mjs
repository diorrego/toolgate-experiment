import { readFileSync, writeFileSync } from "node:fs";
import { compile } from "json-schema-to-typescript";
import { format } from "prettier";
const source = JSON.parse(
  readFileSync("../shared/schemas/api.schema.json", "utf8"),
);
const names = Object.keys(source.$defs);
const schema = {
  ...source,
  anyOf: names.map((name) => ({ $ref: "#/$defs/" + name })),
};
const output = await compile(schema, "WireValue", {
  bannerComment:
    "/* Generated from shared/schemas/api.schema.json. Do not edit. */",
  unknownAny: true,
  maxItems: 0,
  unreachableDefinitions: true,
});
const map =
  "\nexport interface WireMap {\n" +
  names.map((name) => `${name}: ${name};`).join("\n") +
  "\n}\n";
const formatted = await format(output + map, { parser: "typescript" });
const target = "packages/sdk/src/wire.generated.ts";
const jsonCode = await format(JSON.stringify(source), { parser: "json" });
const jsonTarget = "packages/sdk/src/api.generated.json";
if (process.argv.includes("--check")) {
  if (
    readFileSync(target, "utf8") !== formatted ||
    readFileSync(jsonTarget, "utf8") !== jsonCode
  )
    throw Error("Generated wire drift");
} else {
  writeFileSync(target, formatted);
  writeFileSync(jsonTarget, jsonCode);
}
