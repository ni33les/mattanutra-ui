import { baseline } from "../mcp-payload/fixtures.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { toCanonicalRequest } from "../../lib/agentic/plan/matching.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";
import { match } from "../../lib/matcher/index.ts";
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
import { readFileSync } from "node:fs";
import { correctedAxSnapshot } from "../../lib/agentic/catalogue/ax-corrections.ts";
import type { PlanRequest } from "../../lib/agentic/plan/types.ts";

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

for (const [id, loss, price] of [["A4", 4/300, 91900], ["A5", 5/100, 70300]] as const) test(`AXR-SRCH-02 ${id} preserves the frozen control complement within 8000 attempts`, async () => {
  const profiles = JSON.parse(readFileSync(new URL("../fixtures/ax-refinement/six-profiles.json", import.meta.url), "utf8")) as { id: string; request: PlanRequest }[];
  const request = profiles.find(row => row.id === id)!.request;
  const frozen = reconstructAnnaSnapshot(await loadFrozenAnnaInput("dev"));
  const snapshot = correctedAxSnapshot(frozen.snapshot, JSON.parse(readFileSync(new URL("../fixtures/ax-refinement/dev-corrections.json", import.meta.url), "utf8"))).snapshot;
  setMatcherSafetyCeilings(frozen.ceilings);
  try {
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), request, snapshot }); assert.ok("state" in normalized);
    const canonical = toCanonicalRequest(normalized.state); assert.ok(!("error" in canonical));
    const result = match(canonical, { ...snapshot, products: snapshot.products.map(toMatcherProduct) }); assert.ok(result.selected);
    assert.ok(result.selected.doseFit!.total <= loss, `Dose loss ${result.selected.doseFit!.total} exceeds control ${loss}`);
    const control = baseline.cases.find(row => row.caseId === `${id}-en`)!.plan;
    assert.equal(control.stackSummary!.totalPriceMinor, price, "Historical prices are unchanged");
    const controlPills = control.stackSummary!.totalDailyPills;
    if (result.selected.doseFit!.total === loss) {
      const selected = result.selected, pills = selected.pillCountKnown === false ? null : selected.dailyPills;
      // Since 7.2.1 equal fit prefers known pills, then products, then cost.
      // Price is still enforced whenever the higher-priority routine ties.
      const routineOrder = Number(pills === null) - Number(controlPills === null) ||
        (pills !== null && controlPills !== null ? pills - controlPills : 0) ||
        selected.productCount - control.stackSummary!.productCount;
      assert.ok(routineOrder < 0 || (routineOrder === 0 && selected.priceMinor <= price),
        `Equal-fit routine regressed: ${JSON.stringify({ pills, products: selected.productCount, price: selected.priceMinor, control: control.stackSummary })}`);
    }
    assert.ok(result.searchSummary!.expansionAttempts <= 8000);
  } finally { resetMatcherSafetyCeilings(); }
});
