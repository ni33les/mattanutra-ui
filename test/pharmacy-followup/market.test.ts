import assert from "node:assert/strict";
import test from "node:test";
import { productCountryCodeFromAnswers } from "../../lib/pharmacy-in-store.ts";

test("PHARM-FOLLOWUP-MARKET ordinary web keeps customer country; pharmacy uses its verified saved country", () => {
  for (const [country,expected] of [["Philippines","PH"],["Malaysia","MY"],["Thailand","TH"]]) {
    assert.equal(productCountryCodeFromAnswers({country}), expected);
    const answers = Object.freeze({country,inStorePharmacy:Object.freeze({organisationId:"6052e03e-6619-409b-8767-02806b3df016",slug:"delight-pharmacy",countryCode:"TH"})});
    assert.equal(productCountryCodeFromAnswers(answers), "TH");
    assert.equal(answers.country,country);
  }
  assert.equal(productCountryCodeFromAnswers({country:"Philippines",inStorePharmacy:{countryCode:"TH"}}),"PH","Unvalidated pharmacy metadata cannot redirect market");
  assert.equal(productCountryCodeFromAnswers(null),"TH");
});
