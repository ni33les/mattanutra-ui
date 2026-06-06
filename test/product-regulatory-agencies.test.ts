import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultRegulatoryAgencyForCountry,
  productRegulatoryAgenciesByCountry,
  regulatoryAgencyByCode,
  regulatoryAgencyOptionsForCountry
} from "@/lib/product-regulatory-agencies";

describe("product regulatory agency presets", () => {
  it("defaults Thailand product-country approvals to Thai FDA", () => {
    assert.deepEqual(defaultRegulatoryAgencyForCountry("TH"), {
      agencyCode: "TH_FDA",
      agencyName: "Thai FDA"
    });
    assert.deepEqual(regulatoryAgencyOptionsForCountry("th"), [
      {
        agencyCode: "TH_FDA",
        agencyName: "Thai FDA"
      }
    ]);
  });

  it("contains static presets for supported country markets", () => {
    assert.equal(
      productRegulatoryAgenciesByCountry.SG?.[0]?.agencyCode,
      "SG_HSA"
    );
    assert.equal(
      productRegulatoryAgenciesByCountry.AU?.[0]?.agencyCode,
      "AU_TGA"
    );
    assert.equal(
      productRegulatoryAgenciesByCountry.GB?.[0]?.agencyCode,
      "GB_MHRA"
    );
  });

  it("falls back to the country default when an unknown agency is requested", () => {
    assert.deepEqual(regulatoryAgencyByCode("US", "NOT_REAL"), {
      agencyCode: "US_FDA",
      agencyName: "US FDA"
    });
  });
});
