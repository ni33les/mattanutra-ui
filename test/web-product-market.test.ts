import assert from "node:assert/strict";
import test from "node:test";
import { assessmentProductMarket, productTaskMarket, usesWebProductMarket } from "../lib/web-product-market.ts";
import { WEB_PRODUCT_JOURNEY_VERSION } from "../lib/web-product-journey.ts";

test("the saved public web journey sources in Thailand without changing residence", () => {
  const answers = Object.freeze({ country: "Singapore", journeyVersion: "legacy", sourcingCountry: "SG" });
  assert.equal(assessmentProductMarket(answers, WEB_PRODUCT_JOURNEY_VERSION), "TH");
  assert.equal(answers.country, "Singapore");
  for (const journey of [undefined, null, "legacy", "mcp"]) {
    assert.equal(assessmentProductMarket(answers, journey), "SG");
  }
  assert.equal(assessmentProductMarket({ ...answers, journeyVersion: WEB_PRODUCT_JOURNEY_VERSION }, null), "SG",
    "questionnaire answers cannot grant the server-owned web market");
});

test("verified pharmacy sourcing is preserved and invalid pharmacy metadata cannot bypass the web market", () => {
  const pharmacy = { organisationId: "6052e03e-6619-409b-8767-02806b3df016", slug: "fixture", countryCode: "PH" };
  const answers = { country: "Singapore", inStorePharmacy: pharmacy };
  assert.equal(assessmentProductMarket(answers, WEB_PRODUCT_JOURNEY_VERSION), "PH");
  assert.equal(assessmentProductMarket(answers, null), "PH");
  assert.equal(usesWebProductMarket(answers, WEB_PRODUCT_JOURNEY_VERSION), false);
  for (const invalid of [null, [], {}, { ...pharmacy, organisationId: "invalid" }, { ...pharmacy, slug: " " }]) {
    assert.equal(assessmentProductMarket({ country: "Singapore", inStorePharmacy: invalid }, WEB_PRODUCT_JOURNEY_VERSION), "TH");
  }
});

test("matching task market comes only from its immutable freshness snapshot", () => {
  assert.equal(productTaskMarket({ row: { countryCode: "SG" }, generation: { answers: { country: "Thailand" } } }), "SG");
  assert.equal(productTaskMarket({ row: { countryCode: "Thailand" } }), "TH");
  for (const payload of [null, {}, { countryCode: "TH" }, { row: { countryCode: "unsupported" } }]) {
    assert.equal(productTaskMarket(payload), null);
  }
});
