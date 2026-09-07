import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { isAgenticErrorResult } from "../lib/agentic/contract/errors.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { matchPlan, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import { mergeRequestPatch } from "../lib/agentic/plan/request-patch.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";
import { resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";

const cases = [
  { family: "Vitamin K2", requested: "MK-7", equivalent: "Menaquinone-7", wrong: "MK-4", unit: "mcg" as const },
  { family: "Vitamin D", requested: "D2", equivalent: "Ergocalciferol", wrong: "Vitamin D3", unit: "mcg" as const },
  { family: "Folate", requested: "Folic acid", equivalent: "Folic acid", wrong: "Methylfolate", unit: "mcg" as const },
  { family: "Magnesium", requested: "Magnesium glycinate", equivalent: "Magnesium bisglycinate", wrong: "Magnesium oxide", unit: "mg" as const }
];
afterEach(resetMatcherSafetyCeilings);
for (const [index, example] of cases.entries()) it(`keeps the explicit ${example.requested} form through normalization, JSON storage, patching and matching`, async () => {
  setMatcherSafetyCeilings([]);
  const base = sampleValueSnapshot();
  const concept = { ...base.supplements[1]!, name: example.family, aliases: [example.requested, example.equivalent, example.wrong, "สารอาหารตามที่ระบุ"], acceptedUnits: [example.unit] };
  const product = (last: string, name: string, price: number) => sampleRetailProduct({ id: `eeeeeeee-eeee-eeee-eeee-eeeeeeeeee${index}${last}`, title: name, name, supplementId: concept.supplementId, amount: 100, unit: example.unit, unitPriceMinor: price, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle" });
  const wrong = product("1", example.wrong, 100);
  const right = product("2", example.equivalent, 1000);
  const snapshot = { ...base, catalogueVersion: `form-alias-${index}`, supplements: [concept], products: [wrong, right] };
  const original = { locale: "en" as const, destinationCountry: "TH", optimization: "lowest_cost" as const, profile: {}, requirements: {}, medicationCodes: ["apixaban"], targets: [{ name: example.requested, amount: 100, unit: example.unit }] };
  const normalize = (request: unknown) => normalizePlanRequest({ config: loadAgenticConfig(), request, snapshot });
  const normalized = await normalize(original);
  assert.ok(!isAgenticErrorResult(normalized));
  const state = JSON.parse(JSON.stringify(normalized.state));
  const canonical = toCanonicalRequest(state); assert.ok(!("error" in canonical));
  const result = matchPlan({ state, snapshot });
  assert.ok(result.selected, "The supported exact-form product must remain available");
  assert.deepEqual(result.selected.basket.map(item => item.productId), [right.productId]);
  assert.notEqual(canonical.targets[0]!.name, example.family, "The explicit form must survive generic concept resolution");
  assert.equal(result.selected.coverage[0]!.deliveredAmount, 100);
  assert.equal(result.selected.coverage[0]!.coveragePercent, 100);
  const patched = mergeRequestPatch(state.originalRequest, { requirements: { excludeProductIds: [wrong.productId] } });
  assert.ok(!isAgenticErrorResult(patched));
  assert.deepEqual(patched.targets, original.targets); assert.deepEqual(patched.medicationCodes, original.medicationCodes);
  const revised = await normalize(patched); assert.ok(!isAgenticErrorResult(revised));
  assert.equal(revised.state.targets[0]!.name, state.targets[0].name);
  const noExactForm = matchPlan({ state, snapshot: { ...snapshot, catalogueVersion: `form-alias-wrong-only-${index}`, products: [wrong] } });
  assert.deepEqual(noExactForm.selected?.basket ?? [], [], "Another form must not silently satisfy this target");
  assert.equal(noExactForm.selected?.coverage[0]?.coveragePercent, 0);
  const equivalent = await normalize({ ...original, targets: [{ ...original.targets[0]!, name: example.equivalent, supplementId: concept.supplementId }] });
  assert.ok(!isAgenticErrorResult(equivalent));
  assert.equal(equivalent.state.targets[0]!.name, state.targets[0].name, "True form aliases share the canonical form name");
  for (const name of [example.family, "สารอาหารตามที่ระบุ"]) {
    const general = await normalize({ ...original, targets: [{ ...original.targets[0]!, name }] });
    assert.ok(!isAgenticErrorResult(general));
    assert.equal(general.state.targets[0]!.name, example.family, "A general/localized catalogue alias does not acquire a new form restriction");
  }
});
