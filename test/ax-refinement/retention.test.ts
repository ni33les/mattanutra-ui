import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { toCanonicalRequest } from "../../lib/agentic/plan/matching.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";
import { match } from "../../lib/matcher/index.ts";
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";

test("AXR-SRCH-01 preserved Anna control with complete references keeps dose and commercial quality", async () => {
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
    // Independent arithmetic: D3 gap 2.5/10, C excess 20/40, zinc excess
    // 2.5/5, plus 2 * (301.5 + 52.8 - 350)/350 supplemental magnesium.
    const controlLoss = .25 + .5 + .5 + 2 * 4.3 / 350;
    assert.ok(result.selected.doseFit!.total <= controlLoss);
    assert.ok(result.selected.doseFit!.total < controlLoss || result.selected.priceMinor <= 53700, `An equal-dose basket became more expensive; earlier exploratory combination explored=${explored}`);
    assert.ok(result.searchSummary!.expansionAttempts <= 8000);
  } finally { resetMatcherSafetyCeilings(); }
});
