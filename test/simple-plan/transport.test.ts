import assert from 'node:assert/strict';
import test from 'node:test';
import { toolResult } from '../../lib/agentic/mcp/rpc.ts';
import { formatNutrientAmount, formatNutrientMessage } from '../../lib/agentic/presentation/amount.ts';

const decision = { ok: true, planHandle: 'cap_example_returned_handle_for_plan', revision: 1, status: 'processing', summary: 'Matching your targets.', nextAction: 'poll_plan', pollAfterSeconds: 3 };
test('SPLAN-WIRE-01/02 structured delivery has one substantive payload and processing fits 2 KB', () => {
  const result = toolResult(decision, false, 'plan', 'structured');
  assert.deepEqual(result.structuredContent, decision); assert.equal(result.content.length, 1);
  assert.ok(!result.content.some(row => row.text === JSON.stringify(decision))); assert.match(result.content[0].text, /poll_plan/);
  assert.ok(Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result })) < 2000);
});
test('SPLAN-WIRE-01 explicit text-only transport receives complete JSON without a structured clone', () => {
  const result = toolResult(decision, false, 'plan', 'text' as never);
  assert.equal(result.structuredContent, undefined); assert.equal(result.content.length, 1);
  assert.deepEqual(JSON.parse(result.content[0].text), decision);
});
test('SPLAN-ADV-04 floats format accurately without hiding a material nonzero amount', () => {
  assert.equal(formatNutrientMessage('Combined amount 158.39999999999998 mg', 'mg'), 'Combined amount 158.4 mg');
  assert.equal(formatNutrientAmount(2000, 'IU'), '2000');
  assert.notEqual(Number(formatNutrientAmount(0.00001, 'mg')), 0);
});
