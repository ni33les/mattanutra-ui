import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { toCanonicalRequest } from "../../lib/agentic/plan/matching.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";
import { match } from "../../lib/matcher/index.ts";
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";

test("AXR-SRCH-01 preserved Anna control basket cannot lose its equal-dose commercial advantage", async () => {
  const raw = await loadFrozenAnnaInput("uat"), frozen = reconstructAnnaSnapshot(raw);
  setMatcherSafetyCeilings(frozen.ceilings);
  try {
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), request: raw.request, snapshot: frozen.snapshot });
    assert.ok("state" in normalized);
    const request = toCanonicalRequest(normalized.state); assert.ok(!("error" in request));
    const products = ["prd_635eff91e95c42c98a3a4ad10a92bf86", "prd_71b5f9e8198e4ac2a4e16971ebf0fb7a", "prd_8286d8a186204748be2f90803cd4f8bb"];
    let explored = false;
    const result = match(request, { ...frozen.snapshot, products: frozen.snapshot.products.map(toMatcherProduct) }, undefined, undefined, (_seller, state) => {
      if (state.selectedProductIds?.length === 3 && products.every(id => state.selectedProductIds?.includes(id))) explored = true;
    });
    assert.ok(result.selected);
    assert.ok(result.selected.doseFit!.total <= .625, JSON.stringify({ fit: result.selected.doseFit, price: result.selected.priceMinor, products: result.selected.productIds, explored }));
    assert.ok(result.selected.doseFit!.total < .625 || result.selected.priceMinor <= 102000, `An equal-dose basket became more expensive; control combination explored=${explored}`);
    assert.ok(result.searchSummary!.expansionAttempts <= 8000);
  } finally { resetMatcherSafetyCeilings(); }
});
