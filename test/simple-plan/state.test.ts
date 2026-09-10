import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { createAgenticRuntime } from '../../lib/agentic/runtime.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from '../helpers/gold-catalogue.ts';

beforeEach(installGoldCatalogue); afterEach(uninstallGoldCatalogue);
const initial = { idempotencyKey: 'simple-plan-state-initial', locale: 'en', destinationCountry: 'TH',
  medicationCodes: ['apixaban'], targets: [{ name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }], scoring: { profile: 'balanced' } };
async function call(app: ReturnType<typeof createAgenticRuntime>, input: unknown) {
  const response = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name: 'plan', arguments: input } });
  assert.ok(response?.result?.structuredContent, JSON.stringify(response));
  return response.result.structuredContent as Record<string, unknown>;
}
test('SPLAN-STATE-01/03 flat create admits one durable owner; handle polling creates no work', async () => {
  const app = createAgenticRuntime();
  const first = await call(app, initial); assert.equal(first.ok, true); assert.equal(first.status, 'processing');
  assert.equal(first.nextAction, 'poll_plan'); assert.ok(!('choices' in first));
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  const operation = await app.store.getPlanOperationByKey(owner, initial.idempotencyKey); assert.ok(operation);
  const replay = await call(app, initial); assert.equal(replay.planHandle, first.planHandle);
  const polled = await call(app, { planHandle: first.planHandle }); assert.equal(polled.status, 'processing');
  assert.equal((await app.store.getPlanOperationByKey(owner, initial.idempotencyKey))?.id, operation.id);
  assert.equal((await app.store.getPlanOperation(operation.id))?.status, 'queued');
});
test('SPLAN-REQ-02 mixed select/refine returns offending field before admission', async () => {
  const app = createAgenticRuntime();
  const value = await call(app, { planHandle: 'cap_returned_example_valid_handle', expectedRevision: 1,
    idempotencyKey: 'simple-plan-ambiguous', selectedOptionId: 'opt_returned_choice', scoring: {} });
  assert.equal(value.ok, false);
  assert.equal((value.error as Record<string, unknown>).fieldPath, 'scoring');
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  assert.equal(await app.store.getPlanOperationByKey(owner, 'simple-plan-ambiguous'), null);
});
test('SPLAN-STATE-07 concurrent flat admission shares identity; different same-key content conflicts', async () => {
  const app = createAgenticRuntime();
  const responses = await Promise.all(Array.from({ length: 4 }, () => call(app, initial)));
  assert.ok(responses.every(row => row.ok)); assert.equal(new Set(responses.map(row => row.planHandle)).size, 1);
  const conflict = await call(app, { ...initial, scoring: { weights: { pills: 2 } } });
  assert.equal(conflict.ok, false); assert.equal((conflict.error as {reasonCode: string}).reasonCode, 'idempotency_conflict');
});
test('SPLAN-COMPAT-02 queued retired work is terminally rejected before any matching attempts', async () => {
  const { runAdmittedPlanOperation } = await import('../../lib/agentic/plan/service.ts');
  const app = createAgenticRuntime(); await call(app, initial);
  const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  const op = await app.store.getPlanOperationByKey(owner, initial.idempotencyKey); assert.ok(op);
  const command = structuredClone(op.command), prepared = command.prepared as { processing: { contractVersion: string } };
  prepared.processing.contractVersion = '8.0.0';
  assert.equal(await app.store.transaction(tx => tx.updatePlanOperation({ ...op, command, version: op.version + 1 }, op.version)), true);
  const result = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id });
  assert.equal(result.ok, false); if (result.ok) throw new Error('Retired work unexpectedly executed');
  assert.equal(result.error.reasonCode, 'not_found');
  const saved = await app.store.getPlanOperation(op.id); assert.equal(saved?.status, 'failed'); assert.equal(saved?.checkpoint, null);
});
