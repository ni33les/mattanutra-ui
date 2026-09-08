import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { enumerateOracle, ORACLE_PROFILES, type ExperimentOracleFixture } from "../../lib/matcher/experiments/oracle.ts";
import { syntheticCorpus } from "../../lib/matcher/experiments/synthetic-corpus.ts";

function fixture(id: string): ExperimentOracleFixture {
  const row = syntheticCorpus().find(c => c.id.includes(id));
  assert.ok(row?.oracleFixture, `Missing maintained fixture ${id}`);
  return row.oracleFixture;
}
function single(id: string, productId: string) {
  const result = enumerateOracle(fixture(id));
  const row = result.candidates.find(c => c.quantities.length === 1 && c.quantities[0]?.productId === productId);
  assert.ok(row, `Missing explicitly feasible candidate ${productId}`);
  return row;
}
const ratio = (numerator: number, denominator = 1) => ({ numerator: String(numerator), denominator: String(denominator) });

describe("independent scoring experiment oracle", () => {
  it("does not import production decisions or silently omit its explicit finite grid", () => {
    const source = readFileSync(new URL("../../lib/matcher/experiments/oracle.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:dose-fit|search|candidates|eligibility|selector|qa\/oracle)["']/);
    const cases = syntheticCorpus();
    assert.equal(cases.length, 12);
    assert.equal(new Set(cases.map(row => row.id)).size, cases.length);
    for (const row of cases) {
      const result = enumerateOracle(row.oracleFixture);
      assert.equal(result.exhaustive, true);
      assert.ok(result.candidates.length > 0);
      assert.equal(Object.keys(result.profiles).length, 9);
      assert.ok(result.enumerated <= 250_000);
    }
  });

  it("independently preserves exact symmetric under/over curvature and linear2x safety excess", () => {
    const under = single("SYN-01", "under-80"), over = single("SYN-01", "over-120");
    for (const id of Object.keys(under.scores)) assert.deepEqual(under.scores[id]?.exact, over.scores[id]?.exact);
    assert.deepEqual(under.scores["linear-off"]?.exact, ratio(1, 5));
    assert.deepEqual(under.scores["mixed-off"]?.exact, ratio(3, 25));
    assert.deepEqual(under.scores["quadratic-off"]?.exact, ratio(1, 25));
    const above = single("SYN-11", "three-hundred");
    assert.deepEqual(above.scores["linear-off"]?.exact, ratio(3));
    assert.deepEqual(above.scores["quadratic-off"]?.exact, ratio(5));
    assert.equal(above.purchaseEligible, true);
    assert.equal(enumerateOracle(fixture("SYN-11")).profiles["linear-off"]?.selectedSignature, "empty");
  });

  it("distinguishes concentrated and distributed error using independent handwritten fractions", () => {
    const distributed = single("SYN-02", "distributed"), concentrated = single("SYN-02", "concentrated");
    assert.deepEqual(distributed.scores["linear-off"]?.exact, ratio(3, 5));
    assert.deepEqual(concentrated.scores["linear-off"]?.exact, ratio(3, 5));
    assert.deepEqual(distributed.scores["quadratic-off"]?.exact, ratio(9, 50));
    assert.deepEqual(concentrated.scores["quadratic-off"]?.exact, ratio(9, 25));
    assert.deepEqual(distributed.scores["mixed-off"]?.exact, ratio(39, 100));
    assert.deepEqual(concentrated.scores["mixed-off"]?.exact, ratio(12, 25));
  });

  it("uses all three explicit zero scales and keeps omitted/null preferences separate", () => {
    const zero = single("SYN-05", "one");
    assert.deepEqual(zero.scores["linear-linear"]?.exact, ratio(3, 4));
    assert.deepEqual(zero.scores["linear-quadratic"]?.exact, ratio(3, 4));
    for (const preferences of [undefined, {}, { productCount: null, dailyPills: null, priceMinor: null }]) {
      const row = enumerateOracle({ ...fixture("SYN-05"), preferences }).candidates.find(c => c.purchaseEligible);
      assert.ok(row);
      assert.ok(Object.values(row.scores).every(s => s.exact?.numerator === "0"));
    }
    assert.throws(() => enumerateOracle({ ...fixture("SYN-05"), currency: "USD" }), /currency|exchange/);
  });

  it("makes unknown active numeric preferences incomplete without treating unknown diet as a fact", () => {
    assert.ok(fixture("SYN-06").products.filter(p => p.priceMinor === null).every(p => !p.eligible), "Unknown catalogue price retains ordinary purchase ineligibility");
    for (const [product, reason] of [["unknown-pills", "unknown_dailyPills"], ["unknown-price", "unknown_priceMinor"]]) {
      // Unknown price is a scorer-only unit probe. It does not make an
      // unpriced catalogue listing ordinarily eligible in the corpus.
      const probe = { ...fixture("SYN-06"), products: fixture("SYN-06").products.map(p => p.productId === product ? { ...p, eligible: true } : p) };
      const row = enumerateOracle(probe).candidates.find(c => c.quantities.length === 1 && c.quantities[0]?.productId === product)!;
      assert.ok(row);
      assert.equal(row.metrics.nutrientEvidenceComplete, false);
      assert.equal(row.metrics.subjects[0]?.dietaryCertainty, "unknown");
      assert.equal(row.metrics.subjects[0]?.dietaryNominal, null);
      assert.equal(row.metrics.subjects[0]?.quantifiedExposureOnly, true);
      assert.equal(row.scores["linear-off"]?.complete, true);
      assert.equal(row.scores["linear-linear"]?.complete, false);
      assert.equal(row.scores["linear-linear"]?.exact, null);
      assert.deepEqual(row.scores["linear-linear"]?.incompleteReasons, [reason]);
    }
    const f = fixture("SYN-06");
    assert.throws(() => enumerateOracle({ ...f, intake: f.intake.map(row => row.certainty === "unknown" ? { ...row, amount: 0 } : row) }), /Unknown intake/);
    assert.throws(() => enumerateOracle({ ...f, intake: f.intake.slice(0, 1) }), /Explicit intake certainty/);
  });

  it("accounts for scoped reference limits and curves only added exposure above a known continued dose", () => {
    const row = single("SYN-07", "with-incidental");
    assert.deepEqual(row.scores["linear-off"]?.exact, ratio(27, 10));
    assert.deepEqual(row.metrics.subjects.find(s => s.subjectId === "b")?.points[0]?.continuedIncrease.exact, ratio(1));
    const f = fixture("SYN-07"), half = { ...f, products: f.products.map(p => p.productId === "with-incidental" ? { ...p, contributions: { a: 80, b: 5 } } : p) };
    const candidate = enumerateOracle(half).candidates.find(c => c.quantities.length === 1 && c.quantities[0]?.productId === "with-incidental");
    assert.ok(candidate);
    assert.deepEqual(candidate.scores["linear-off"]?.exact, ratio(23, 15));
    assert.deepEqual(candidate.scores["quadratic-off"]?.exact, ratio(77, 60));
    const estimated = enumerateOracle({ ...half, intake: half.intake.map(i => i.subjectId === "b" && i.scope === "supplemental" ? { ...i, certainty: "estimated" as const } : i) });
    assert.ok(estimated.candidates.every(c => c.metrics.subjects.find(s => s.subjectId === "b")?.points.every(p => p.continuedIncrease.value === 0)));
  });

  it("takes whole convex endpoint losses and labels estimates", () => {
    const twenty = single("SYN-08", "twenty"), forty = single("SYN-08", "forty");
    assert.deepEqual(twenty.scores["linear-off"]?.exact, ratio(3, 5));
    assert.deepEqual(forty.scores["linear-off"]?.exact, ratio(2, 5));
    assert.deepEqual(forty.scores["quadratic-off"]?.exact, ratio(4, 25));
    assert.equal(forty.scores["quadratic-off"]?.nutrientEvidenceComplete, true);
    assert.equal(forty.metrics.subjects[0]?.supplementalCertainty, "estimated");
  });

  it("keeps raw core Pareto protection for baseline and labels preference tradeoffs explicitly", () => {
    const result = enumerateOracle(fixture("SYN-09"));
    assert.match(result.profiles["linear-off"]!.selectedSignature!, /core-exact/);
    assert.match(result.profiles["linear-linear"]!.selectedSignature!, /optional-driven/);
    assert.equal(result.profiles["linear-off"]?.protectedPolicy, "raw_protected_pareto");
    assert.equal(result.profiles["linear-linear"]?.protectedPolicy, "explicit_preference_tradeoff");
    const onlyOptional = { ...fixture("SYN-09"), targets: fixture("SYN-09").targets.map(t => ({ ...t, importance: "optional" as const })) };
    assert.match(enumerateOracle(onlyOptional).profiles["linear-off"]!.selectedSignature!, /optional-driven/);
  });

  it("preserves unavailable targets, binding exclusions and seller/physical constraints", () => {
    const f = fixture("SYN-10"), result = enumerateOracle(f);
    assert.ok(result.candidates.every(c => c.quantities.every(q => q.productId === "only-b")));
    const b = result.candidates.find(c => c.purchaseEligible)!;
    assert.equal(b.metrics.subjects.filter(s => s.basis !== null).length, 3);
    assert.deepEqual(b.scores["linear-off"]?.exact, ratio(2));
    assert.throws(() => enumerateOracle({ ...f, productDoses: [{ productId: "excluded-a", servingsPerDay: 1 }] }), /conflicts/);
    const powder = fixture("SYN-12");
    assert.throws(() => enumerateOracle({ ...powder, productDoses: [{ productId: "powder", servingsPerDay: "0.3" }] }), /grid/);
    const fixed = enumerateOracle({ ...powder, productDoses: [{ productId: "powder", servingsPerDay: "0.6" }] });
    assert.equal(fixed.candidates.length, 1);
    assert.deepEqual(fixed.candidates[0]?.quantities[0]?.exact, ratio(3, 5));
    assert.deepEqual(fixed.candidates[0]?.scores["quadratic-off"]?.exact, ratio(0));
  });

  it("refuses oversized grids, duplicate quantities and unbounded alpha before returning evidence", () => {
    const f = fixture("SYN-05"), product = f.products[0]!;
    assert.throws(() => enumerateOracle({ ...f, products: Array.from({ length: 18 }, (_, i) => ({ ...product, productId: `p${i}` })) }), /enumeration limit/);
    assert.throws(() => enumerateOracle({ ...f, products: [{ ...product, doses: ["0.6", "0.60"] }] }), /Duplicate oracle dose/);
    assert.throws(() => enumerateOracle(f, [{ ...ORACLE_PROFILES[0]!, nutrientAlpha: { num: BigInt(3), den: BigInt(2) } }]), /alpha/);
  });

  it("produces catalogue-order invariant feasible baskets, scores and profile winners", () => {
    for (const row of syntheticCorpus()) {
      assert.ok(row.oracleFixture);
      assert.deepEqual(enumerateOracle(row.oracleFixture), enumerateOracle({ ...row.oracleFixture, products: [...row.oracleFixture.products].reverse() }));
      assert.ok(Object.isFrozen(row.request) && Object.isFrozen(row.catalog.products) && Object.isFrozen(row.oracleFixture));
    }
  });
});
