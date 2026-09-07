import assert from "node:assert/strict";
import { test } from "node:test";
import * as live from "../lib/agentic/catalogue/live.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { FIXTURE_PRODUCTS, FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { packFactsFromProduct } from "../lib/agentic/value/pack-facts.ts";
import { toMatcherProduct } from "../lib/agentic/plan/to-matcher-product.ts";
import type { CatalogueProduct } from "../lib/agentic/catalogue/types.ts";

const verified = {
  route: "oral", physicalUnit: "capsule", unitsPerServing: 2, doseIncrement: 1, packQuantity: 60,
  provenance: { status: "verified", sourceUrl: "https://manufacturer.example/label", sourceText: "2 capsules per serving; 60 capsules", verifiedAt: "2026-09-07T00:00:00.000Z" }
} as const;
function product(patch: Record<string, unknown> = {}): CatalogueProduct {
  return { ...FIXTURE_PRODUCTS[0], source: "retail", candidate: { ...FIXTURE_PRODUCTS[0].candidate, title: "400 mg nutrient 60 capsules", administration: null }, ...patch } as CatalogueProduct;
}

test("CAT5-01 live loading preserves low confidence, evidence and absent quantities", () => {
  assert.equal(typeof live.snapshotFacts, "function");
  const [fact] = live.snapshotFacts([{ name: "Vitamin D3", amount: null, unit: "mcg", confidence: "low", source: "label_review", sourceUrl: "https://manufacturer.example", sourceText: "quantity not established" }]);
  assert.equal(fact.amount, null);
  assert.equal(fact.confidence, "low");
  assert.equal(fact.source, "label_review");
  assert.equal(fact.sourceText, "quantity not established");
});

test("CAT5-02 contradictory mapped nutrient cannot establish verified coverage", () => {
  assert.equal(typeof live.snapshotFacts, "function");
  const [fact] = live.snapshotFacts([{ name: "Inulin", normalizedName: "inulin", amount: 45, unit: "mg", confidence: "high", supplementId: "66666666-6666-6666-6666-666666666666", mappedName: "Zinc", mappedAliases: [] }]);
  assert.equal(fact.mappingStatus, "conflicting");
  const value = product({ contributionSupplementIds: ["sup_66666666666666666666666666666666"], candidate: { ...FIXTURE_PRODUCTS[0].candidate, facts: [fact] } });
  assert.deepEqual(toMatcherProduct(value).contributionSubjectIds, []);
  assert.equal(toMatcherProduct(value).labelledContributions[0].subjectId, null);
});

test("CAT5-03 live unknown route/form is not an oral capsule or a pill count", () => {
  assert.equal(typeof live.toCatalogueProduct, "function");
  const candidate = { ...FIXTURE_PRODUCTS[0].candidate, title: "Hair Rise hair spray 20m", administration: null, validation: { checkedAt: "", matchableFactCount: 1, reasons: [], status: "pass", summary: "" } };
  const mapped = live.toCatalogueProduct(candidate, FIXTURE_SUPPLEMENTS, new Map(FIXTURE_SUPPLEMENTS.flatMap(s => [[s.uuid, s.supplementId], [s.name.toLowerCase(), s.supplementId]])));
  assert.ok(mapped);
  assert.equal(mapped.form, "unknown");
  assert.equal(mapped.dailyPills, 0);
  assert.equal(mapped.incompleteCommercialFacts, false);
});

test("CAT5-04 topical ingredients never satisfy oral nutrient targets", () => {
  const value = product({ candidate: { ...FIXTURE_PRODUCTS[0].candidate, administration: { ...verified, route: "topical" } } });
  assert.deepEqual(toMatcherProduct(value).contributionSubjectIds, []);
  assert.ok(toMatcherProduct(value).labelledContributions.every(f => f.subjectId === null));
  assert.equal(toMatcherProduct(value).orderable, true);
});

test("CAT5-05 missing live pack metadata remains unknown despite title numbers", () => {
  const facts = packFactsFromProduct(product());
  assert.equal(facts.servingsPerPack, null);
  assert.equal(facts.unitsPerServing, null);
  assert.equal(facts.servingSize, null);
  assert.equal(facts.complete, false);
});

test("CAT5-06 verified physical units determine supply instead of nutrient amount", () => {
  const facts = packFactsFromProduct(product({ candidate: { ...FIXTURE_PRODUCTS[0].candidate, administration: verified } }));
  assert.equal(facts.servingsPerPack, 30);
  assert.equal(facts.unitsPerServing, 2);
  assert.deepEqual(facts.servingSize, { amount: 2, unit: "capsule" });
  assert.equal(facts.complete, true);
});

test("CAT5-07 catalogue identity changes with administration and evidence", () => {
  const value = product();
  const snapshot = { availabilityAsOf: "2026-09-07T00:00:00.000Z", catalogueVersion: "retail-TH-1", products: [value], supplements: FIXTURE_SUPPLEMENTS };
  const id = catalogueSnapshotId(snapshot);
  const administration = { ...snapshot, products: [product({ candidate: { ...value.candidate, administration: verified } })] };
  assert.notEqual(catalogueSnapshotId(administration), id);
  const evidence = { ...snapshot, products: [product({ candidate: { ...value.candidate, facts: value.candidate.facts.map(f => ({ ...f, confidence: "low", sourceText: "unverified updated label" })) } })] };
  assert.notEqual(catalogueSnapshotId(evidence), id);
});

test("CAT5-08 manufacturer Omega-3 amount and conflicting catalogue repairs are fingerprint guarded", async () => {
  const { catalogueRecordFingerprint, catalogueCorrectionState } = await import("../lib/catalogue-corrections.ts");
  const before = { id: "one", name: "Omega-3", amount: 1000, unit: "mg" };
  const after = { ...before, amount: 350 };
  const correction = { correctionId: "fish-oil-active-omega3", entityTable: "product_facts" as const, entityId: "one", before, after, beforeFingerprint: catalogueRecordFingerprint(before), afterFingerprint: catalogueRecordFingerprint(after), evidence: { sourceUrl: "https://www.vistra.co.th/product/vistra-odorless-fish-oil-1000mg/", checkedAt: "2026-09-07", summary: "One capsule contains fish oil 1000 mg providing Omega-3 350 mg." } };
  assert.equal(catalogueCorrectionState(correction, before), "pending");
  assert.equal(catalogueCorrectionState(correction, after), "already_applied");
  assert.throws(() => catalogueCorrectionState(correction, { ...before, amount: 750 }), /changed since review/);
  assert.throws(() => catalogueCorrectionState({ ...correction, after: { ...after, amount: 0 } }, before), /Invalid correction manifest fingerprint/);
});

test("CAT5-09 administration never permits splitting capsules or upgrades missing evidence", async () => {
  const { parseProductAdministration } = await import("../lib/product-administration.ts");
  assert.equal(parseProductAdministration({ ...verified, doseIncrement: 0.5 })?.provenance.status, "conflicting");
  assert.equal(parseProductAdministration({ ...verified, doseIncrement: 0.5 })?.doseIncrement, null);
  assert.equal(parseProductAdministration({ ...verified, provenance: { ...verified.provenance, sourceText: null } })?.provenance.status, "unverified");
  assert.equal(parseProductAdministration(null), null);
  assert.equal(parseProductAdministration({})?.route, "unknown");
});
