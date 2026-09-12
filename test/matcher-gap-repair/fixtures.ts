import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { CatalogueSnapshot } from '../../lib/agentic/catalogue/types.ts';
import type { ProductRecommendationInput } from '../../lib/product-recommendation-types.ts';
import type { SafetyCeiling } from '../../lib/matcher/types.ts';
import { administrationDailyPills } from '../../lib/product-administration.ts';
import { setMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
const frozen = JSON.parse(gunzipSync(readFileSync(new URL('./reported-input.json.gz', import.meta.url))).toString());
const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/availability/uat-catalogue.json.gz', import.meta.url))).toString()) as CatalogueSnapshot;
export const relacza = '44f3a282-8c3e-4f9d-898a-a68d9b27ccbc';
export const recorded = frozen.selected as { productIds: string[]; servings: number[]; score: number; coverage: number };
export function input(corrected = false): ProductRecommendationInput {
  assert.equal(snapshot.runtimeRevision, frozen.catalogueRevision);
  setMatcherSafetyCeilings(frozen.ceilings as SafetyCeiling[]);
  const candidates = snapshot.products.filter(p => p.orderable && p.sellerId === frozen.sellerId).map(p => ({ ...structuredClone(p.candidate), matchingFacts: {
    pillCountKnown: administrationDailyPills(p.candidate.administration) != null, dailyPillsPerServing: p.dailyPills,
    form: p.form, dietarySource: p.dietarySource, omegaSource: p.omegaSource } }));
  assert.equal(candidates.length, 76);
  if (corrected) { const p = candidates.find(p => p.id === relacza); assert.ok(p); const f=p.facts.find(f=>f.normalizedName==='vitamin_b12'); assert.ok(f); f.unit='mcg'; f.comparableAmount=1; }
  return { candidates, needs: frozen.needs, clientContext: frozen.clientContext, clientSex: frozen.clientSex, countryCode:'TH', stackPreference:'balanced' };
}
