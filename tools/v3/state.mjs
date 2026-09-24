import { isDeepStrictEqual } from "node:util";
export function resolveIds(value, ids) {
  if (typeof value === "string" && value.startsWith("@")) {
    if (!ids[value.slice(1)]) throw Error("Unknown fixture identifier");
    return ids[value.slice(1)];
  }
  if (Array.isArray(value)) return value.map((v) => resolveIds(v, ids));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveIds(v, ids)]),
    );
  return value;
}
export function subset(actual, expected) {
  if (Array.isArray(expected)) return isDeepStrictEqual(actual, expected);
  if (expected && typeof expected === "object")
    return (
      actual && Object.entries(expected).every(([k, v]) => subset(actual[k], v))
    );
  return isDeepStrictEqual(actual, expected);
}
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["createdAt", "updatedAt", "__v"].includes(k))
        .map(([k, v]) => [k, clean(v)]),
    );
  return value;
}
export function verifyState(oracle, before, after, ids) {
  const expected = clean(structuredClone(before)),
    actual = clean(after),
    spec = resolveIds(oracle.state, ids);
  if (spec) {
    const rows = expected[spec.model],
      result = actual[spec.model];
    if (!rows || !result) return { correct: false, unchangedOthers: false };
    if (spec.create) {
      const added = result.filter((r) => !rows.some((b) => b._id === r._id));
      if (added.length !== 1 || !subset(added[0], spec.create))
        return { correct: false, unchangedOthers: false };
      rows.push(added[0]);
    } else {
      const index = rows.findIndex((r) => r._id === spec.id),
        target = rows[index];
      if (!target) throw Error("Invalid state oracle target");
      if (spec.delete) rows.splice(index, 1);
      else
        for (const [field, value] of Object.entries(spec.fields)) {
          if (field !== "tasks") target[field] = value;
          else if (value.taskText) {
            const task = target.tasks.find((t) => t._id === value.taskText.id);
            if (!task) throw Error("Missing oracle task");
            task.text = value.taskText.text;
          } else if (value.order) {
            target.tasks = value.order.map((id, order) => ({
              ...target.tasks.find((t) => t._id === id),
              order,
            }));
          } else if (value.appendText) {
            const end = result.find((r) => r._id === spec.id),
              added =
                end?.tasks.filter(
                  (t) => !target.tasks.some((b) => b._id === t._id),
                ) ?? [];
            if (
              added.length !== 1 ||
              added[0].text !== value.appendText ||
              added[0].order !== target.tasks.length ||
              added[0].status !== "todo"
            )
              return { correct: false, unchangedOthers: false };
            target.tasks.push(added[0]);
          }
        }
    }
  }
  const sort = (s) =>
    Object.fromEntries(
      Object.entries(s).map(([k, rows]) => [
        k,
        [...rows].sort((a, b) => a._id.localeCompare(b._id)),
      ]),
    );
  const correct = isDeepStrictEqual(sort(expected), sort(actual));
  return { correct, unchangedOthers: correct };
}
