import assert from 'node:assert/strict';
import { runConversationalJourney } from '../../scripts/published-client-journey.mjs';
import { loadAgenticConfig } from '../../lib/agentic/config.ts';
import { createAgenticRuntime } from '../../lib/agentic/runtime.ts';
import { handleJsonRpc } from '../helpers/recording-mcp-dispatcher.ts';
import { captureMcpTranscript } from '../helpers/mcp-evidence.ts';
import { normalizePublishedClientResult } from '../../scripts/published-client-semantics.mjs';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import { resetMatchPlanCache } from '../../lib/agentic/plan/matching.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from '../helpers/gold-catalogue.ts';

// The harness controls the executor. The imported client sees public RPC only.
export async function documentedRun(locale: string, discovery: string, checkout = false) {
  installGoldCatalogue(); resetMatchPlanCache(); const app = createAgenticRuntime({ config: { ...loadAgenticConfig(), siteUrl: "https://fixture.example" } });
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

/** Reuses the published client; the manual broader report cannot execute retired wire suites. */
export async function runCurrentProtocolPack() {
  const cases=[];
  for(const locale of ["en","th","zh-CN"])for(const discovery of ["resources","tools_only"]){
    const {result,transcript}=await captureMcpTranscript(()=>documentedRun(locale,discovery));
    cases.push({id:`SPLAN-DOC-${locale}-${discovery}`,result:"PASS",evidence:{acceptance:normalizePublishedClientResult(result,"https://fixture.example/api/mcp"),mcpTranscript:normalizePublishedClientResult(transcript,"https://fixture.example/api/mcp")}});
  }
  return {contractVersion:"11.0.0",cases,totalCases:cases.length,passedCases:cases.length};
}
