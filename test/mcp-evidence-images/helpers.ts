import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from '../../lib/agentic/catalogue/snapshot.ts';
import { resetMatchPlanCache } from '../../lib/agentic/plan/matching.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { createAgenticRuntime, type AgenticRuntime } from '../../lib/agentic/runtime.ts';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import type { CatalogueSnapshot } from '../../lib/agentic/catalogue/types.ts';
import type { SafetyReferenceSnapshot } from '../../lib/agentic/catalogue/load-safety-ceilings.ts';
import type { SimplePlanDecision } from '../../lib/agentic/contract/decision-schema.ts';
const root = new URL('../fixtures/mcp-evidence-images/', import.meta.url);
export const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const raw = gunzipSync(readFileSync(new URL('dev-20260911.json.gz', root)));
assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256, 'Frozen real DEV inputs changed');
export const frozen = JSON.parse(raw.toString()) as { snapshot: CatalogueSnapshot; references: SafetyReferenceSnapshot; versions: Array<{product_id:string;version:number;image_url:string|null}> };
export function install() {
  replaceCatalogueSnapshot(structuredClone(frozen.snapshot)); resetMatchPlanCache();
  setMatcherSafetyCeilings(frozen.references.ceilings, { runtimeRevision: frozen.references.runtimeRevision, fingerprint: frozen.references.fingerprint });
}
export function cleanup() { replaceCatalogueSnapshot(null); resetCatalogueSnapshotCache(); resetMatchPlanCache(); resetMatcherSafetyCeilings(); }
export function runtime() {
  const app = createAgenticRuntime();
  // The memory store models the pinned catalogue's commercial publication fence.
  app.store.isCatalogueRevisionCurrent = async revision => revision === frozen.snapshot.runtimeRevision;
  return { ...app, config: { ...app.config, internalQaHarness: false }, isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{countryCode:'TH',countryName:'Thailand',currency:'THB'}] } };
}
export function requirements(index = 0) {
  const fixture = manifest.fixtures[index];
  return { productDoses: [{ productId: fixture.productId, servingsPerDay: fixture.servingsPerDay }],
    excludeProductIds: [...new Set(frozen.snapshot.products.map(p => p.productId))].filter(id => id !== fixture.productId) };
}
export const create = () => ({ idempotencyKey:'ev-images-create',locale:'en',destinationCountry:'TH',
  targets:[{name:'Vitamin D3',amount:1000,unit:'IU',basis:'total_daily'}],currentSupplements:[],
  intake:[{source:'diet',supplementId:frozen.snapshot.supplements.find(s=>s.name==='Vitamin D3')!.supplementId,name:'Vitamin D3',certainty:'known',amount:0,unit:'IU'}],requirements:requirements() });
export async function rpc(app: AgenticRuntime, name: string, args: unknown) {
  return handleJsonRpc(app, {jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
}
export async function plan(app: AgenticRuntime, args: Record<string,unknown>) {
  let response = await rpc(app, 'plan', args);
  assert.ok(response?.result?.structuredContent, JSON.stringify(response));
  let value = response.result.structuredContent as SimplePlanDecision;
  assert.equal(value.ok, true, JSON.stringify(value));
  if (value.status === 'processing' && typeof args.idempotencyKey === 'string') {
    const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope??'anon'}`;
    const operation = await app.store.getPlanOperationByKey(owner,args.idempotencyKey); assert.ok(operation);
    const result = await runAdmittedPlanOperation({store:app.store,config:app.config,operationId:operation.id});assert.equal(result.ok,true,JSON.stringify(result));
    response = await rpc(app,'plan',{planHandle:value.planHandle});
    value = response!.result!.structuredContent as SimplePlanDecision;
  }
  assert.ok('choices' in value,JSON.stringify(value)); return value;
}
