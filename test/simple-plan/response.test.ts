import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';

test('SPLAN-DTO-01/02 a terminal handle read returns one useful decision with ingredient and product facts', async () => {
  const result = internalFixture(); const { app, handle } = await storedFixture(result);
  const response = await handleJsonRpc(app, { id: 1, method: 'tools/call', params: { name: 'plan', arguments: { planHandle: handle } } });
  const body = response?.result?.structuredContent as Record<string, unknown>;
  assert.equal(body.ok, true); assert.ok(Array.isArray(body.choices) && body.choices.length > 0);
  assert.ok(!('responseView' in body)); assert.ok(!('advice' in body)); assert.ok(!('basket' in body));
  assert.ok(!('contractVersion' in body)); assert.equal(body.selectedOptionId, null);
  for (const choice of body.choices as Record<string, unknown>[]) {
    assert.ok(choice.summary); assert.ok(Array.isArray(choice.ingredients) && choice.ingredients.length > 0);
    assert.ok(Array.isArray(choice.products) && choice.products.length > 0);
    for (const product of choice.products as Record<string, unknown>[]) for (const field of ['imageUrl', 'productUrl', 'quantity', 'unitPrice', 'lineTotal', 'servingsPerDay', 'dailyQuantity', 'supplyDays']) assert.ok(field in product, field);
  }
});
