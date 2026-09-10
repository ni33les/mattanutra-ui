import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runConversationalJourney } from '../../scripts/published-client-journey.mjs';
import { normalizePublishedClientResult } from '../../scripts/published-client-semantics.mjs';
import { createAgenticRuntime } from '../../lib/agentic/runtime.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import { resetMatchPlanCache } from '../../lib/agentic/plan/matching.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from '../helpers/gold-catalogue.ts';

// The harness controls the executor. The imported client sees public RPC only.
export async function documentedRun(locale: string, discovery: string, checkout = false) {
  installGoldCatalogue(); resetMatchPlanCache(); const app = createAgenticRuntime();
  const pending = new Set<string>(); const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
  try {
    return await runConversationalJourney({ locale, discovery, checkout, key: `docs-${locale}-${discovery}`,
      rpc: async (method: string, params: Record<string, any>) => {
        const result = await handleJsonRpc(app, { jsonrpc: '2.0', id: 1, method, params }); assert.ok(result && !result.error, JSON.stringify(result));
        if (params?.arguments?.idempotencyKey) pending.add(params.arguments.idempotencyKey);
        return result.result;
      }, wait: async () => {
        for (const key of pending) {
          const op = await app.store.getPlanOperationByKey(owner, key);
          if (op && ['queued', 'retryable'].includes(op.status)) {
            const result = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: op.id }); assert.equal(result.ok, true, JSON.stringify(result));
          }
          pending.delete(key);
        }
      }
    });
  } finally { uninstallGoldCatalogue(); resetMatchPlanCache(); }
}
test('SPLAN-DOC-01/02 schema-only and tools-only journeys use returned identifiers in three locales and recover checkout', { timeout: 60000 }, async () => {
  const results = [];
  for (const locale of ['en', 'th', 'zh-CN']) results.push(await documentedRun(locale, locale === 'en' ? 'schema_only' : locale === 'th' ? 'tools_only' : 'resources', locale === 'en'));
  assert.equal(results.length, 3);
  const output = process.env['MCP_simple-plan_EVIDENCE_DIR'];
  if (output) { mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'documented-inventory-run.json'), JSON.stringify(results, null, 2), { flag: 'wx' }); }
});
test('SPLAN-DOC-03 semantic normalization preserves choice relationships and business differences', () => {
  const a = { recommendedOptionId: 'random-a', choices: [{ optionId: 'random-a', products: [{ productId: 'sku', quantity: 2, lineTotal: 100 }] }] };
  const b = { recommendedOptionId: 'random-b', choices: [{ optionId: 'random-b', products: [{ productId: 'sku', quantity: 2, lineTotal: 100 }] }] };
  assert.deepEqual(normalizePublishedClientResult(a), normalizePublishedClientResult(b));
  b.choices[0].products[0].quantity = 3; assert.notDeepEqual(normalizePublishedClientResult(a), normalizePublishedClientResult(b));
});
