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
test('SPLAN-VERSION-03 a retired plan cannot replay an execute receipt; order handles remain independent', async () => {
  const { commitIdempotency } = await import('../../lib/agentic/idempotency.ts');
  const { businessError } = await import('../../lib/agentic/contract/errors.ts');
  const { app, handle } = await storedFixture({ ...internalFixture(), contractVersion: '8.0.0' });
  const args = { planHandle: handle, expectedRevision: 1, idempotencyKey: 'retired-execute-key' };
  await commitIdempotency({ store: app.store, now: app.now!, operation: 'execute', key: args.idempotencyKey,
    ownerScope: `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`,
    payload: { planHandle: handle, expectedRevision: 1 }, resourceIds: {}, response: businessError({ reasonCode: 'stale_revision', message: 'Previously saved receipt' }) });
  const rpc = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name: 'execute', arguments: args } });
  const result = rpc?.result?.structuredContent as {ok: boolean; error: {reasonCode: string}};
  assert.equal(result.ok, false); assert.equal(result.error.reasonCode, 'not_found');
});
