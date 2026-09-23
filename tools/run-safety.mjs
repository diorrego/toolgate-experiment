/** Stop infrastructure failures without retrying or hiding measured business failures. */
export function stopReason(record) {
  for (const call of [...(record.hostTools ?? []), ...(record.tools ?? [])]) {
    if (call.result?._meta?.['mcp/www_authenticate']) return 'MCP_AUTHENTICATION_REQUIRED';
  }
  return record.status === 'runner_failed' ? 'RUNNER_SETUP_FAILED' : null;
}

export function assertSurface(mode, names, expectedDirectTools) {
  const expected = mode === 'direct'
    ? [...new Set(expectedDirectTools)].sort()
    : ['execute_read_action', 'execute_write_action', 'prepare_action'];
  if (names.slice().sort().join() !== expected.join()) throw Error('MCP_SURFACE_UNAVAILABLE');
}
