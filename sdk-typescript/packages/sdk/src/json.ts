/** Parse bounded wire JSON before duplicates disappear into JavaScript objects. */
export function parseWireJson(text: string, maxArray = 1000): unknown {
  let position = 0;
  const invalid = (): never => {
    throw new Error("Invalid wire JSON");
  };
  const space = (): void => {
    while (/[\t\n\r ]/.test(text[position] ?? "x")) position++;
  };
  const string = (): string => {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === "\\") position++;
      else if (char === '"') {
        const value: unknown = JSON.parse(text.slice(start, position));
        return typeof value === "string" ? value : invalid();
      }
    }
    return invalid();
  };
  const value = (depth: number): unknown => {
    if (depth > 32) return invalid();
    space();
    const char = text[position];
    if (char === '"') return string();
    if (char === "{" || char === "[") {
      const object: Record<string, unknown> = {};
      const array: unknown[] = [];
      const keys = new Set<string>();
      const end = char === "{" ? "}" : "]";
      position++;
      space();
      if (text[position] === end) {
        position++;
        return char === "{" ? object : array;
      }
      while (position < text.length) {
        space();
        if (char === "{") {
          if (text[position] !== '"') return invalid();
          const key = string();
          if (
            keys.has(key) ||
            ["__proto__", "prototype", "constructor"].includes(key)
          )
            return invalid();
          keys.add(key);
          if (keys.size > 256) return invalid();
          space();
          if (text[position++] !== ":") return invalid();
          object[key] = value(depth + 1);
        } else {
          array.push(value(depth + 1));
          if (array.length > maxArray) return invalid();
        }
        space();
        const separator = text[position++];
        if (separator === end) return char === "{" ? object : array;
        if (separator !== ",") return invalid();
      }
      return invalid();
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(position),
      )?.[0];
    if (!token) return invalid();
    position += token.length;
    const parsed: unknown = JSON.parse(token);
    if (
      typeof parsed === "number" &&
      (!Number.isFinite(parsed) ||
        (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)))
    )
      return invalid();
    return parsed;
  };
  const result = value(0);
  space();
  if (position !== text.length) return invalid();
  return result;
}
