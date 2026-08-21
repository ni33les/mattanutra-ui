import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultProductCountryCode,
  displayCountryName,
  normalizeProductCountryCode,
  normalizeProductCountryCodes,
  parseShippingCountryCode,
  productCountryLabel
} from "../lib/product-countries.ts";

describe("product countries", () => {
  it("normalizes supported ISO market codes", () => {
    assert.equal(normalizeProductCountryCode("th"), "TH");
    assert.equal(normalizeProductCountryCode(" US "), "US");
    assert.equal(normalizeProductCountryCode("U.S."), "US");
  });

  it("normalizes supported country labels", () => {
    assert.equal(normalizeProductCountryCode("Thailand"), "TH");
    assert.equal(normalizeProductCountryCode(" thailand "), "TH");
    assert.equal(normalizeProductCountryCode("United States"), "US");
    assert.equal(normalizeProductCountryCode("United Kingdom"), "GB");
    assert.equal(normalizeProductCountryCode("UK"), "GB");
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

  it("parses shipping countries without remapping unknown ISO codes to Thailand", () => {
    assert.equal(parseShippingCountryCode("Thailand"), "TH");
    assert.equal(parseShippingCountryCode("SG"), "SG");
    assert.equal(parseShippingCountryCode("nz"), "NZ");
    assert.equal(parseShippingCountryCode("ZZ"), "ZZ");
    assert.equal(parseShippingCountryCode("OTHER"), null);
    assert.equal(parseShippingCountryCode(""), null);
    assert.equal(displayCountryName("SG"), "Singapore");
  });
});
