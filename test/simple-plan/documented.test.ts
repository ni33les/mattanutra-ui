import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePublishedClientResult } from '../../scripts/published-client-semantics.mjs';
import { documentedRun } from './documented-harness.ts';
test('SPLAN-DOC-01/02 schema-only and tools-only journeys use returned identifiers in three locales and recover checkout', { timeout: 60000 }, async () => {
  const results = [];
  for (const locale of ['en', 'th', 'zh-CN']) results.push(await documentedRun(locale, locale === 'en' ? 'schema_only' : locale === 'th' ? 'tools_only' : 'resources', locale === 'en'));
  assert.equal(results.length, 3);
  const output = process.env['MCP_simple-plan_EVIDENCE_DIR'];
  if (output) { mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'documented-inventory-run.json'), JSON.stringify(results, null, 2), { flag: 'wx' }); }
});
test('SPLAN-DOC-03 semantic normalization preserves recommendation facts and business differences', () => {
  const a = { planHandle: 'cap_random-a', choices: [{ products: [{ productId: 'sku', quantity: 2, lineTotal: 100 }] }] };
  const b = { planHandle: 'cap_random-b', choices: [{ products: [{ productId: 'sku', quantity: 2, lineTotal: 100 }] }] };
  assert.deepEqual(normalizePublishedClientResult(a), normalizePublishedClientResult(b));
  b.choices[0].products[0].quantity = 3; assert.notDeepEqual(normalizePublishedClientResult(a), normalizePublishedClientResult(b));
});
