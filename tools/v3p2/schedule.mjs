export const MODES = ["direct", "joint-1", "joint-3", "joint-5", "joint-8"];
export function schedule(cases, repetitions = 5) {
  const tasks = [];
  for (let repeat = 0; repeat < repetitions; repeat++) {
    const ordered = [
      ...cases.slice((repeat * 7) % cases.length),
      ...cases.slice(0, (repeat * 7) % cases.length),
    ];
    for (const c of ordered) {
      const i = cases.indexOf(c);
      for (let position = 0; position < 5; position++)
        tasks.push({
          caseId: c.id,
          repeat: repeat + 1,
          position,
          mode: MODES[(i + repeat + position) % 5],
        });
    }
  }
  return tasks;
}
