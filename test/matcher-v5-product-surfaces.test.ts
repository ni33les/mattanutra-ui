import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as adviceComponents from "../components/web-health-advice.tsx";
import { recommendWithMatcher } from "../lib/matcher/adapters/web.ts";
import { webMatchingCopy } from "../lib/web-health-advice.ts";
import { createAdminPlanCoverageSimulationRunner, runNextAdminPlanCoverageSimulationSample } from "../lib/admin-product-coverage-simulation.ts";
import { retailPlanInsertProductRows, renderRetailPlanInsertPdf, type RetailPlanInsertData } from "../lib/retail-plan-insert.tsx";
import type { ProductCandidate, ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";

const names = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
const needs: ProductRecommendationNeed[] = names.map(name => ({ id: name, sourceId: name, displayName: name, normalizedName: name, category: "Supplement",
  itemType: "supplement", weight: 1, targetComparableAmount: 100000, targetText: "100 mg", targetDose: { amount: 100, unit: "mg", originalText: "100 mg" } }));
function candidate(name: string): ProductCandidate {
  return { id: name, title: name, platform: "manual", productUrl: `https://fixture.example/${name}`, region: "TH", currency: "THB", status: "approved",
    availabilityStatus: "in_stock", labelStatus: "parsed", automatedSafetyPassed: false, priceAmount: 1,
    administration: { route: "oral", physicalUnit: "capsule", unitsPerServing: 1, doseIncrement: 1, packQuantity: 30,
      provenance: { status: "verified", sourceUrl: "https://fixture.example/label", sourceText: "1 capsule serving; 30 capsules", verifiedAt: "2026-09-07" } },
    facts: [{ name, normalizedName: name, amount: 100, comparableAmount: 100000, unit: "mg", itemType: "supplement", confidence: "high", mappingStatus: "verified" }] };
}

test("SURFACE5-01 unknown web pill counts remain null and render localized uncertainty", () => {
  const product = { ...candidate("alpha"), administration: null };
  const result = recommendWithMatcher({ needs: [needs[0]], candidates: [product] });
  assert.equal(result.diagnostics.matching?.options[0]?.dailyPills, null);
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const html = renderToStaticMarkup(React.createElement(adviceComponents.WebMatchingPillCount, { count: null, locale }));
    assert.ok(html.includes(webMatchingCopy[locale].pillsUnknown));
    assert.doesNotMatch(html, /:\s*0(?:\D|$)/);
    const known = renderToStaticMarkup(React.createElement(adviceComponents.WebMatchingPillCount, { count: 0, locale }));
    assert.match(known, />0<|: 0/);
  }
});

test("SURFACE5-02 admin simulation explores the same unrestricted eight-product match", () => {
  const runner = createAdminPlanCoverageSimulationRunner({ candidates: names.map(candidate), countryCode: "TH", seed: "eight-customer-targets",
    supplements: names.map(id => ({ id, name: id, normalizedName: id, category: "Supplement", targetComparableAmount: 100000 })),
    demandProfiles: [{ id: "eight-targets", answers: {}, archetypeId: "fixture", archetypeName: "Fixture", clientSex: null,
      generatedAt: "2026-09-07", needs, sampleIndex: 0, supplementNames: names }] });
  runNextAdminPlanCoverageSimulationSample(runner);
  assert.equal(runner.productStats.size, 8);
  assert.equal(runner.coverageValues[0], 100);
});

test("SURFACE5-03 customer inserts keep all eight purchased product rows and dosing instructions", async () => {
  const lines = names.map((name, i) => ({ brand_name: null, image_url: null, metadata: {}, product_id: name, product_title: name, quantity_ordered: i + 1 }));
  const rows = await retailPlanInsertProductRows({ lines, locale: "en", result: null });
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map(row => row.productId), names);
  assert.deepEqual(rows.map(row => row.quantity), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(rows.every(row => row.take.length > 0));
});

test("SURFACE5-04 eight-product customer PDF creates continuation pages", async () => {
  const rows = names.map((name, i) => ({ brandName: null, covers: [name], imageDataUri: null, productId: name, quantity: 1,
    take: `Take ${i + 1} labelled servings daily.`, title: name, why: "Evaluated customer product." }));
  const qr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNCsAAAAASUVORK5CYII=";
  const data: RetailPlanInsertData = { brandMarkDataUri: null, customerFirstName: "Fixture", customerName: "Fixture Customer", foodRows: [],
    generatedAt: "2026-09-07", locale: "en", orderDateLabel: "7 September 2026", orderId: "fixture-order", orderNumber: "fixture-eight",
    organisationName: "Fixture", partnerLocationLabel: null, panyaCode: "fixture", panyaExpiresAt: "2026-12-07", panyaLineUrl: "https://fixture.example/chat",
    panyaQrDataUri: qr, planId: "fixture-plan", planUrl: "https://fixture.example/plan", productRows: rows, revealQrDataUri: qr };
  const pdf = await renderRetailPlanInsertPdf(data);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 3);
  // These English fixture pages use the renderer's standard Helvetica font.
  // Read actual PDF text operands independently of the React component tree.
  const text = [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match => {
    try { return [inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")]; }
    catch { return []; }
  }).flatMap(stream => [...stream.matchAll(/<([0-9a-f]+)>/gi)].map(match => Buffer.from(match[1], "hex").toString("latin1"))).join("");
  for (const [index, name] of names.entries()) {
    assert.ok(text.includes(name), `Purchased product ${name} is present in the rendered PDF`);
    assert.ok(text.includes(`Take ${index + 1} labelled servings daily.`), `Complete dose instructions for ${name} are present`);
  }
});
