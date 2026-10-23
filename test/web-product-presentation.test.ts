import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createRequire, register } from "node:module";
import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FormulationResult } from "../lib/formulation-types.ts";
import type { NutritionJourneySnapshot } from "../lib/nutrition-journey-read.ts";
import { webPreparationCards, webProductCopy } from "../components/nutrition-flow/web-product-copy.ts";
import { webRevealProgress } from "../lib/web-reveal-progress.ts";

describe("free product journey waiting details", () => {
  for (const locale of ["en", "th", "zh-CN"] as const) {
    it(`${locale}: uses saved answer labels in a stable order without inventing missing answers`, () => {
      const cards = webPreparationCards({ goals: ["energy"], diet: "balanced", supplements: "none", firstName: "Private Name", meds: "Private Medication" }, locale);
      assert.deepEqual(cards.map(card => card.id), ["goals", "diet", "supplements", "process"]);
      assert.notEqual(cards[0].value, webProductCopy[locale].unspecified);
      assert.notEqual(cards[1].value, webProductCopy[locale].unspecified);
      assert.notEqual(cards[2].value, webProductCopy[locale].unspecified);
      assert.doesNotMatch(JSON.stringify(cards), /Private Name|Private Medication/);
      const missing = webPreparationCards({ goals: ["future_unknown_option"], diet: "<script>" }, locale);
      assert.deepEqual(missing.slice(0, 3).map(card => card.value), Array(3).fill(webProductCopy[locale].unspecified));
      assert.doesNotMatch(JSON.stringify(missing), /future_unknown_option|<script>/);
    });
  }
});

describe("free reveal progress follows available work", () => {
  const waiting = { ready: false, failed: false, formulaReady: false };
  const scorePending = { copyReady: false, copyFailed: false };
  const scoreReady = { copyReady: true, copyFailed: false };
  const scoreFailed = { copyReady: false, copyFailed: true };

  it("moves from HealthScore preparation through formula and product matching as results arrive", () => {
    assert.deepEqual([
      webRevealProgress({ ...waiting, snapshot: scorePending }),
      webRevealProgress({ ...waiting, snapshot: scoreReady }),
      webRevealProgress({ ...waiting, formulaReady: true, snapshot: scoreReady }),
      webRevealProgress({ ...waiting, formulaReady: true, ready: true, snapshot: scoreReady }),
    ], ["calculating", "preparing", "matching", "ready"]);
  });

  it("keeps formula preparation available when independent HealthScore analysis fails", () => {
    assert.equal(webRevealProgress({ ...waiting, snapshot: scoreFailed }), "preparing");
  });

  it("shows available formula and products without waiting for a late or failed HealthScore", () => {
    for (const snapshot of [scorePending, scoreFailed]) {
      assert.equal(webRevealProgress({ ...waiting, formulaReady: true, snapshot }), "matching");
      assert.equal(webRevealProgress({ ...waiting, formulaReady: true, ready: true, snapshot }), "ready");
    }
  });

  it("reports a failed generation step while preserving ready results as the highest priority", () => {
    assert.equal(webRevealProgress({ ...waiting, failed: true, snapshot: scorePending }), "failed");
    assert.equal(webRevealProgress({ ...waiting, formulaReady: true, failed: true, snapshot: scoreReady }), "failed");
    assert.equal(webRevealProgress({ ...waiting, formulaReady: true, ready: true, failed: true, snapshot: scoreFailed }), "ready");
  });

  it("does not claim HealthScore calculation without a current snapshot", () => {
    assert.equal(webRevealProgress({ ...waiting, snapshot: null }), "preparing");
  });

  it("provides distinct localized progress labels for all supported locales", () => {
    assert.deepEqual([
      webProductCopy.en.calculating, webProductCopy.en.preparing, webProductCopy.en.matching,
    ], ["Calculating your HealthScore", "Formulating your supplements", "Matching products"]);
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const copy = webProductCopy[locale];
      assert.equal(new Set([copy.calculating, copy.preparing, copy.matching]).size, 3);
      for (const text of [copy.calculating, copy.preparing, copy.matching]) assert.ok(text.trim());
    }
  });
});

it("a completed empty catalogue shows availability without a zero-price basket and preserves the saved formula", async (t) => {
  register("./payment-return/next-loader.mjs", import.meta.url);
  register("./pharmacy-reveal/style-loader.mjs", import.meta.url);
  register("./mcp-tool-card/config-loader.mjs", import.meta.url);
  const require = createRequire(import.meta.url);
  mock.module(require.resolve("next/link.js"), {
    defaultExport: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props)
  });
  mock.module("../components/safe-image.tsx", {
    namedExports: { SafeImage: (props: ImgHTMLAttributes<HTMLImageElement>) => createElement("img", props) }
  });
  const { WebCombinedReveal } = await import("../components/nutrition-flow/web-combined-reveal.tsx");
  const rationale = { en: "Saved formula rationale", th: "เหตุผลสำหรับสูตรที่บันทึกไว้", "zh-CN": "已保存的配方说明" };
  const caution = { en: "Saved ingredient caution", th: "ข้อควรระวังของสารอาหารที่บันทึกไว้", "zh-CN": "已保存的营养素注意事项" };
  const snapshot = { revision: 1, formulaVersion: 1, readyForReveal: true, refreshPending: false,
    failed: false, productRunId: "fixture-run" } as NutritionJourneySnapshot;
  const result: FormulationResult = {
    access: "full", assessmentRevision: 1, formulaVersion: 1, planId: "fixture-plan", schemaVersion: 1,
    generatedAt: "2026-10-22T00:00:00Z", foodGuidance: [], recommendations: [],
    assessmentSummary: { constraints: [], goals: [], plan: "precision", profile: "", region: "Singapore" },
    supplementBreakdown: [{ id: "vitamin-d", category: "vitamin", dailyDose: "1000 IU", effectivenessRank: 1,
      rationale, status: "add", supplement: "Vitamin D3",
      cautions: [{ id: "fixture-caution", severity: "caution", body: caution }] }],
    productRecommendations: { status: "ready", runId: "fixture-run", matchedCount: 0, needsCount: 1, stackCoveragePercent: 0,
      matching: { operationalStatus: "no_purchase", selectedCandidateKey: null, options: [], alternativeSearch: undefined,
        matchingDiagnostics: { reasonCode: "catalogue_empty", catalogueListings: 0, catalogueProducts: 0,
          eligibleListings: 0, eligibleProducts: 0, supportedDoseVariants: 0, evaluatedNonemptyBaskets: 0,
          rejectionCounts: [], targets: [] } } }
  };
  const render = (value: FormulationResult, locale: "en" | "th" | "zh-CN", current = snapshot) =>
    renderToStaticMarkup(createElement(WebCombinedReveal, { locale, planId: result.planId, result: value,
      snapshot: current, failed: false, retry: () => {} }));
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const html = render(result, locale), copy = webProductCopy[locale];
    assert.match(html, /data-testid="web-product-unavailable"/);
    assert.ok(html.includes(copy.productsUnavailable));
    assert.ok(html.includes(copy.planSavedWithoutProducts));
    assert.ok(!html.includes(copy.reviewBasket));
    assert.ok(!html.includes(`>${copy.availableProducts}<`));
    assert.doesNotMatch(html, /data-testid="web-basket"|mn-order-total|mn-order-count|\/basket\/checkout|catalogue_empty|no_purchase|Singapore/);
    assert.match(html, /1000 IU/);
    assert.ok(html.includes(rationale[locale]));
    assert.ok(html.includes(caution[locale]));
    assert.ok(html.includes(`/${locale}/nutrition/plan?plan=fixture-plan`));
    assert.ok(html.includes(`/${locale}/nutrition/reveal?plan=fixture-plan`));
    assert.ok(html.includes(copy.copy));
  }
  const matching = result.productRecommendations!.matching!;
  const legitimatelyEmpty = { ...result, productRecommendations: { ...result.productRecommendations!, matching: {
    ...matching, matchingDiagnostics: { ...matching.matchingDiagnostics!, reasonCode: "targets_already_covered" as const }
  } } };
  assert.doesNotMatch(render(legitimatelyEmpty, "en"), /data-testid="web-product-unavailable"/);
  assert.ok(render(legitimatelyEmpty, "en").includes(webProductCopy.en.noProducts));
  assert.doesNotMatch(render({ ...result, supplementBreakdown: [] }, "en"), /data-testid="web-product-unavailable"/);
  const nonempty = { ...result, recommendations: [{ id: "fixture-product", name: "Fixture product", covers: ["vitamin-d"],
    description: "", marketplace: "Imported product" as const, price: { amount: 250, currency: "THB" }, priority: 1, tag: "", url: "" }] };
  assert.match(render(nonempty, "en"), /data-testid="web-basket"/);
  assert.match(render(nonempty, "en"), /\/basket\/checkout\?/);
  assert.doesNotMatch(render(nonempty, "en"), /data-testid="web-product-unavailable"/);
  assert.doesNotMatch(render(result, "en", { ...snapshot, readyForReveal: false }), /data-testid="web-product-unavailable"/);
  await t.test("language changes preserve saved explanations and cautions when translations are absent", () => {
    const sourceCopy = {
      rationale: "Original saved rationale", whyThisIsForYou: "Original personal explanation",
      decision: "Original recommendation decision", safety: "Original safety message", caution: "Original caution message"
    };
    const original: FormulationResult = { ...result, supplementBreakdown: [{ ...result.supplementBreakdown[0],
      rationale: sourceCopy.rationale, whyThisIsForYou: sourceCopy.whyThisIsForYou, decision: sourceCopy.decision,
      safety: { action: "advisory", visibility: "visible", message: sourceCopy.safety },
      cautions: [{ id: "original-caution", severity: "caution", body: sourceCopy.caution }]
    }] };
    for (const locale of ["th", "zh-CN"] as const) {
      const html = render(original, locale, { ...snapshot, locale: "en" });
      for (const text of Object.values(sourceCopy)) assert.ok(html.includes(text), `${locale}: preserved ${text}`);
      const translated: FormulationResult = { ...original, supplementBreakdown: [{ ...original.supplementBreakdown[0],
        rationale, whyThisIsForYou: rationale, decision: rationale,
        safety: { action: "advisory", visibility: "visible", message: caution },
        cautions: [{ id: "translated-caution", severity: "caution", body: caution }]
      }] };
      const localizedHtml = render(translated, locale, { ...snapshot, locale: "en" });
      assert.ok(localizedHtml.includes(rationale[locale]));
      assert.ok(localizedHtml.includes(caution[locale]));
      assert.ok(!localizedHtml.includes(rationale.en));
      assert.ok(!localizedHtml.includes(caution.en));
    }
  });
});
