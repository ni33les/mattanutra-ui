import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAnnaCases, loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { matcherSafetyCeilings, matcherSafetyReferenceIdentity } from "../../lib/matcher/safety-ceilings.ts";

const environments = ["dev", "uat"] as const;

test("EXP-CORPUS-01 four corrected Anna anchors preserve the request, listings and frozen commerce", async () => {
  const cases = await loadAnnaCases();
  assert.deepEqual(cases.map(row => row.id), ["anna-dev-create", "anna-dev-revise", "anna-uat-create", "anna-uat-revise"]);
  for (const row of cases) {
    const input = await loadFrozenAnnaInput(row.id.includes("-dev-") ? "dev" : "uat");
    assert.equal(row.catalog.products.length, 154);
    assert.equal(new Set(row.catalog.products.map(p => p.productId)).size, 79);
    assert.equal(row.request.targets.length, 4);
    assert.equal(row.request.maxProductCount, 2);
    assert.equal(row.request.maxDailyPills, 2);
    assert.deepEqual(row.request.currentSupplements, []);
    assert.deepEqual(row.request.dietaryIntake, []);
    assert.equal(row.request.unknownIntakeSubjectIds?.length, 4);
    assert.ok(row.request.targets.every(target => target.basis === "total_daily"));
    assert.deepEqual(row.request.medicationCodes, ["paracetamol"]);
    assert.deepEqual(row.request.conditionCodes, ["perimenopause", "high_cholesterol"]);
    assert.equal(row.request.optimization, row.id.endsWith("create") ? "lowest_cost" : "best_coverage");
    assert.deepEqual(row.catalog.products.map(p => [p.productId, p.sellerId, p.retailerSku, p.unitPriceMinor, p.stockStatus]),
      input.baseline.catalogue.products.map(p => [p.productId, p.sellerId, p.retailerSku, p.unitPriceMinor, p.stockStatus]));
    assert.equal(row.provenance.inputKind, "reconstructed_corrected_baseline");
    assert.equal(row.provenance.referenceEpoch, 99);
  }
});

test("EXP-CORPUS-02 actual corrected facts and retired references retain identity, units and uncertainty", async () => {
  for (const environment of environments) {
    const input = await loadFrozenAnnaInput(environment);
    const result = reconstructAnnaSnapshot(input);
    const corrected = result.snapshot.products.filter(p => p.candidate.id === "3dc57564-e623-4262-b9f3-4f4a1c72ec21");
    assert.ok(corrected.length > 0);
    for (const product of corrected) {
      for (const [name, amount, unit, confidence] of [["Vitamin C", 60, "mg", "high"], ["Biotin", 50, "mcg", "moderate"], ["Lutein", 6, "mg", "moderate"]]) {
        const fact = product.candidate.facts.find(row => row.name === name);
        assert.equal(fact?.amount, amount); assert.equal(fact?.unit, unit); assert.equal(fact?.confidence, confidence);
      }
    }
    const d3 = result.ceilings.filter(row => row.subjectId === "927083fb-b90a-5a24-b4c5-5067b06ead5f");
    assert.equal(d3.length, 7);
    assert.ok(d3.every(row => row.sourceScope === "total"));
    assert.equal(d3.find(row => row.lifeStage === "adult")?.maxAmount, 100);
    assert.equal(d3.find(row => row.lifeStage === "child_1_3")?.maxAmount, 2500);
    assert.equal(d3.find(row => row.lifeStage === "child_1_3")?.maxUnit, "IU");
    const b6 = result.ceilings.find(row => row.name === "Vitamin B6" && row.lifeStage === "adult");
    assert.equal(b6?.maxAmount, environment === "dev" ? 30 : 50);
    assert.equal(b6?.referenceConfidence, "low");
    assert.match(b6?.basisRationale ?? "", /internal/i);
    assert.ok(result.provenance.retiredReferenceHeads as number > 0);
  }
});

test("EXP-CORPUS-03 reconstruction rejects changed before facts, prices and reference relationships", async () => {
  const original = await loadFrozenAnnaInput("dev");
  const fact = structuredClone(original);
  fact.baseline.factRecords[0].amount = Number(fact.baseline.factRecords[0].amount) + 1;
  assert.throws(() => reconstructAnnaSnapshot(fact), /before|changed|fingerprint/i);
  const price = structuredClone(original);
  (price.baseline.catalogue.products[0] as { unitPriceMinor: number }).unitPriceMinor += 1;
  assert.throws(() => reconstructAnnaSnapshot(price), /baseline|fingerprint/i);
  const reference = structuredClone(original);
  reference.references[0].heads[0].sourceScope = "total";
  assert.throws(() => reconstructAnnaSnapshot(reference), /reference|fingerprint/i);
  const missing = structuredClone(original);
  missing.references[0].heads = missing.references[0].heads.filter(row => row.maxAmount !== null);
  assert.throws(() => reconstructAnnaSnapshot(missing), /reference|fingerprint/i);
});

test("EXP-CORPUS-04 offline normalization neither observes database credentials nor mutates reference caches", async () => {
  const before = structuredClone(matcherSafetyCeilings());
  const identity = matcherSafetyReferenceIdentity();
  const previous = process.env.DB_URL;
  process.env.DB_URL = "postgresql://offline-sentinel@127.0.0.1:1/must_not_connect";
  try {
    const first = await loadAnnaCases();
    const second = await loadAnnaCases();
    assert.deepEqual(first, second);
    assert.deepEqual(matcherSafetyCeilings(), before);
    assert.deepEqual(matcherSafetyReferenceIdentity(), identity);
    assert.ok(first.every(row => row.provenance.normalizationNetwork === "disabled"));
  } finally {
    if (previous === undefined) delete process.env.DB_URL; else process.env.DB_URL = previous;
  }
});

test("EXP-CORPUS-05 allowlisted fixtures carry no customer, contact, capability or commerce fields", async () => {
  const forbidden = /^(?:email|phone|address|customer|patient|userId|user_id|session|token|secret|password|capability|handle|order|checkout|payment)(?:$|[A-Z_])/;
  function inspect(value: unknown, path = "input") {
    if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, `${path}[${index}]`)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.equal(forbidden.test(key), false, `Unexpected private field ${path}.${key}`);
      if (typeof item === "string" && /^https?:\/\//.test(item)) {
        const url = new URL(item);
        assert.equal(url.username, "", path); assert.equal(url.password, "", path);
        assert.equal([...url.searchParams.keys()].some(key => /token|secret|key|signature/i.test(key)), false, path);
      }
      inspect(item, `${path}.${key}`);
    }
  }
  for (const environment of environments) {
    const input = await loadFrozenAnnaInput(environment);
    inspect(input);
    assert.deepEqual(Object.keys(input.request).sort(), ["conditionCodes", "currentSupplements", "destinationCountry", "locale", "medicationCodes", "optimization", "profile", "requirements", "targets"]);
    assert.equal(input.baseline.factRecords.length, 3);
    assert.equal(input.baseline.productRecords.length, 57);
  }
});
