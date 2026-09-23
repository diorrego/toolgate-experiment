import { Ajv2020 } from "ajv/dist/2020.js";
import { fullFormats } from "ajv-formats/dist/formats.js";
import api from "./api.generated.json" with { type: "json" };
import type { WireMap } from "./wire.generated.ts";
import canonicalize from "canonicalize";
import { createHash } from "node:crypto";

const ajv = new Ajv2020({
  strict: false,
  formats: fullFormats,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
ajv.addSchema(api, "toolgate");
/** Generated schema name and type share one source; no unchecked DTO casts. */
export function decodeWire<K extends keyof WireMap>(
  name: K,
  value: unknown,
): WireMap[K] {
  if (!isWire(name, value)) throw Error("INVALID_WIRE");
  return value;
}
function isWire<K extends keyof WireMap>(
  name: K,
  value: unknown,
): value is WireMap[K] {
  const validate = ajv.getSchema(`toolgate#/$defs/${name}`);
  return validate !== undefined && validate(value) === true;
}
export function jsonValue(
  value: unknown,
  limits = { maxArray: 1000, maxProperties: 256 },
  seen = new Set<object>(),
  depth = 0,
): void {
  if (depth > 32) throw Error("JSON_LIMIT");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  )
    return;
  if (typeof value !== "object" || seen.has(value))
    throw Error("INVALID_JSON_VALUE");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > limits.maxArray) throw Error("JSON_LIMIT");
    for (const item of value) jsonValue(item, limits, seen, depth + 1);
  } else {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw Error("INVALID_JSON_VALUE");
    if (Reflect.ownKeys(value).length > limits.maxProperties)
      throw Error("JSON_LIMIT");
    for (const key of Reflect.ownKeys(value)) {
      if (
        typeof key !== "string" ||
        ["constructor", "prototype", "__proto__"].includes(key)
      )
        throw Error("INVALID_JSON_KEY");
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (
        !property ||
        !Object.hasOwn(property, "value") ||
        !property.enumerable
      )
        throw Error("INVALID_JSON_VALUE");
      const item: unknown = property.value;
      jsonValue(item, limits, seen, depth + 1);
    }
  }
  seen.delete(value);
}
export function jcs(value: unknown): string {
  jsonValue(value, { maxArray: 10000, maxProperties: 10000 });
  const raw = canonicalize(value);
  if (typeof raw !== "string") throw Error("INVALID_JSON_VALUE");
  return raw;
}
export function sha(value: unknown): string {
  return createHash("sha256").update(jcs(value)).digest("hex");
}
