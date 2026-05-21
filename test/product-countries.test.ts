import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
  normalizeProductCountryCodes,
  productCountryLabel
} from "../lib/product-countries.ts";

describe("product countries", () => {
  it("normalizes supported ISO market codes", () => {
    assert.equal(normalizeProductCountryCode("th"), "TH");
    assert.equal(normalizeProductCountryCode(" US "), "US");
    assert.equal(normalizeProductCountryCode("Thailand"), null);
  });

  it("defaults empty or unsupported country lists to Thailand", () => {
    assert.deepEqual(normalizeProductCountryCodes([]), [defaultProductCountryCode]);
    assert.deepEqual(normalizeProductCountryCodes(["OTHER"]), [defaultProductCountryCode]);
  });

  it("deduplicates country lists and keeps stable labels", () => {
    assert.deepEqual(normalizeProductCountryCodes(["th", "TH", "US"]), ["TH", "US"]);
    assert.equal(productCountryLabel("TH"), "Thailand");
    assert.equal(productCountryLabel("ZZ"), "ZZ");
  });
});
