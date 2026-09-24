/** Only independent reads in the same model response overlap. Writes are barriers. */
export async function executeCalls(calls, isRead, invoke, maxConcurrent = 4) {
  const outputs = [];
  for (let i = 0; i < calls.length; ) {
    if (!isRead(calls[i])) {
      outputs.push(await invoke(calls[i++]));
      continue;
    }
    const batch = [];
    while (i < calls.length && isRead(calls[i]) && batch.length < maxConcurrent)
      batch.push(calls[i++]);
    const settled = await Promise.allSettled(batch.map(invoke));
    // Join all admitted work before propagating a host failure or resetting state.
    for (const r of settled) {
      if (r.status === "rejected") throw r.reason;
      outputs.push(r.value);
    }
  }
  return outputs;
}
