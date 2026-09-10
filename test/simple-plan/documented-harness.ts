import assert from 'node:assert/strict';
import { runConversationalJourney } from '../../scripts/published-client-journey.mjs';
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
      rpc: async (method: string, params: { arguments?: { idempotencyKey?: string } }) => {
        const result = await handleJsonRpc(app, { jsonrpc: '2.0', id: 1, method, params }); assert.ok(result && !result.error, JSON.stringify(result));
        if (params?.arguments?.idempotencyKey) pending.add(params.arguments.idempotencyKey);
        return JSON.parse(JSON.stringify(result.result));
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
