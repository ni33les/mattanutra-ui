import assert from "node:assert/strict";
import { it } from "node:test";
import { assessmentInputHash } from "../../lib/assessment-revisions.ts";
import { getBpmPayload } from "../../lib/bpm-client.ts";
const ray = "aaaabbbb-1111-4111-8111-aaaabbbbcccc";
const answers = { age: "36-45", inStorePharmacy: { organisationId: "11111111-1111-4111-8111-111111111111", slug: "delight-pharmacy" } };
it("PHARM-SRC-01 acquisition does not change generation identity", () => {
  for (const source of ["in_store", "business_card", "unknown"]) {
    assert.equal(assessmentInputHash({ ...answers, inStorePharmacy: { ...answers.inStorePharmacy, acquisition: { source, ray } } }), assessmentInputHash(answers));
  }
  assert.notEqual(assessmentInputHash({ ...answers, age: "46-55" }), assessmentInputHash(answers));
});
it("PHARM-SRC-02 server-rendered pharmacy context overrides old browser attribution even without storage", () => {
  const saved = new Map(["window", "document", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: { pathname: "/en/retail/delight/quiz", search: "?source=in_store", href: "https://dev.example/en/retail/delight/quiz?source=in_store" },
      innerWidth: 390, sessionStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
    }});
    Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "", querySelector: () => ({ dataset: { pharmacySource: "business_card", pharmacyRay: ray, pharmacySlug: "delight-pharmacy" } }) }});
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "fixture" }});
    const payload = getBpmPayload();
    assert.equal(payload.ray, ray);
    assert.equal(payload.attribution.sourceDetail, "business_card");
    assert.equal(payload.attribution.sourceChannel, "delight-pharmacy");
    assert.equal(payload.attribution.trafficSource, "pharmacy");
  } finally { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } }
});
