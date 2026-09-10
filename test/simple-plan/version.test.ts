import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';

test('SPLAN-VERSION-01 unsupported pins fail through contract validation even on discovery', async () => {
  const { app } = await storedFixture(internalFixture());
  for (const pin of ['8.0.0', '7.2.4', '10.0.0', 'invalid']) {
    const rpc = await handleJsonRpc({ ...app, clientContractVersion: pin }, { id: 1, method: 'tools/call', params: { name: 'info', arguments: {} } });
    const value = rpc?.result?.structuredContent as Record<string, unknown>;
    assert.equal(value.ok, false, pin); assert.equal(value.error.fieldPath, 'x-mattanutra-contract-version');
  }
});
test('SPLAN-VERSION-02 old plan handles receive ordinary not-found, with no migration or recovery adapter', async () => {
  const old = internalFixture(); const { app, handle } = await storedFixture({ ...old, contractVersion: '8.0.0' });
  const rpc = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name: 'plan', arguments: { planHandle: handle } } });
  const value = rpc?.result?.structuredContent as Record<string, unknown>;
  assert.equal(value.ok, false); assert.equal(value.error.reasonCode, 'not_found'); assert.doesNotMatch(value.error.message, /migrat|restart|old|refresh/i);
});
