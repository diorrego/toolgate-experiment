import assert from 'node:assert/strict';
import test from 'node:test';
import {stopReason, assertSurface} from '../run-safety.mjs';

test('authentication failures stop the matrix even when the model finishes an answer', () => {
  const call = {status:'failed', result:{_meta:{'mcp/www_authenticate':'Bearer error="invalid_token"'}}};
  assert.equal(stopReason({status:'completed',tools:[call]}), 'MCP_AUTHENTICATION_REQUIRED');
  assert.equal(stopReason({status:'runner_error',hostTools:[call]}), 'MCP_AUTHENTICATION_REQUIRED');
});

test('initialization failures stop without retrying or discarding the failed record', () => {
  assert.equal(stopReason({status:'runner_failed',tools:[]}), 'RUNNER_SETUP_FAILED');
  assert.equal(stopReason({status:'completed',tools:[]}), null);
  assert.equal(stopReason({status:'completed',tools:[{status:'failed',result:{isError:true}}]}), null);
  assert.equal(stopReason({status:'completed',tools:[{status:'completed',result:{content:[{type:'text',text:'invalid_token'}]}}]}), null);
});

test('an empty or wrong MCP surface is rejected before paid inference', () => {
  assert.throws(() => assertSurface('direct',[],['read']), /MCP_SURFACE_UNAVAILABLE/);
  assert.throws(() => assertSurface('direct',['other'],['read']), /MCP_SURFACE_UNAVAILABLE/);
  assert.doesNotThrow(() => assertSurface('direct',['read'],['read']));
  assert.doesNotThrow(() => assertSurface('rust-first',['prepare_action','execute_read_action','execute_write_action'],['read']));
  assert.throws(() => assertSurface('go',['read'],['read']), /MCP_SURFACE_UNAVAILABLE/);
});
