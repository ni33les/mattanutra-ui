import assert from "node:assert/strict";
import { it } from "node:test";
import { pharmacyPath, pharmacyOrganisationSlug, pharmacyCandidatePrice, pharmacyAnalysisPolicy, belongsToPharmacy } from "../lib/pharmacy-journey.ts";

it("PHARM-01 routes the poster to landing and the questionnaire to quiz in each locale", () => {
  for (const locale of ["en", "th", "zh-CN"] as const) {
    assert.equal(pharmacyPath(locale, "delight-pharmacy", "landing"), `/${locale}/retail/delight/landing`);
    assert.equal(pharmacyPath(locale, "delight", "quiz", { session: "visitor-one" }), `/${locale}/retail/delight/quiz?session=visitor-one`);
    assert.equal(pharmacyPath(locale, "other-shop", "reveal", { plan: "saved-plan" }), `/${locale}/retail/other-shop/reveal?plan=saved-plan`);
  }
  assert.equal(pharmacyOrganisationSlug("delight"), "delight-pharmacy");
  assert.equal(pharmacyOrganisationSlug("other-shop"), "other-shop");
});

it("PHARM-02 prices pharmacy matching at RRP without mutating online candidates", () => {
  const candidate = Object.freeze({ priceAmount: 550, retailRrpPriceAmount: 500 });
  assert.equal(pharmacyCandidatePrice(candidate), 500);
  assert.equal(candidate.priceAmount, 550);
  assert.equal(pharmacyCandidatePrice({ priceAmount: 550 }), null, "never guess RRP by reversing a margin");
});

it("PHARM-03 generates explanations without making pharmacy reveal wait for them", () => {
  assert.deepEqual(pharmacyAnalysisPolicy, { generateHealthScore: true, waitForHealthScore: false, waitForProducts: true, pricingBasis: "pharmacy-rrp-v1" });
});

it("PHARM-07 scopes retail matching by the stored organisation ID, not its public seller ID", () => {
  assert.equal(belongsToPharmacy({ sellerId: "seller_public", candidate: { selectedRetailerOrganisationId: "database-id" } }, "database-id"), true);
  assert.equal(belongsToPharmacy({ sellerId: "database-id", candidate: { selectedRetailerOrganisationId: "other-shop" } }, "database-id"), false);
  assert.equal(belongsToPharmacy({ sellerId: "seller_public", candidate: {} }, "database-id"), false);
});
