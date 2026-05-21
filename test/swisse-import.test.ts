import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSwisseSkincareOnlyProduct,
  parseSwisseFacts
} from "@/lib/swisse-import";

describe("Swisse import helpers", () => {
  it("parses Astaxanthin + Gluta ingredient evidence", () => {
    const facts = parseSwisseFacts("Key Ingredients Astaxanthin 6 mg L-Glutathione 50 mg Vitamin C 30 mg");

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Astaxanthin", 6, "mg"],
        ["L-Glutathione", 50, "mg"],
        ["Vitamin C", 30, "mg"]
      ]
    );
  });

  it("parses fish oil EPA and DHA nested label text", () => {
    const facts = parseSwisseFacts(
      "Each soft capsule contains Fish Oil - Natural 1 g: Eicosapentaenoic acid (EPA) 180 mg Docosahexaenoicacid (DHA) 120mg"
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Fish Oil", 1, "g"],
        ["EPA", 180, "mg"],
        ["DHA", 120, "mg"]
      ]
    );
  });

  it("parses magnesium and probiotic CFU rows", () => {
    const facts = parseSwisseFacts("Magnesium 150 mg Lactobacillus acidophilus 5 billion CFU");

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Magnesium", 150, "mg"],
        ["Lactobacillus Acidophilus", 5, "billion CFU"]
      ]
    );
  });

  it("rejects concentration rows as usable facts", () => {
    const facts = parseSwisseFacts("Vitamin E 7.5 IU/g");

    assert.deepEqual(facts, []);
  });

  it("classifies topical skincare as skipped", () => {
    assert.equal(isSwisseSkincareOnlyProduct({
      productTitle: "Swisse Retinol Renewing Night Serum",
      productVendor: "Swisse Skincare"
    }), true);

    assert.equal(isSwisseSkincareOnlyProduct({
      productTitle: "Swisse Hair Skin Nails+",
      productVendor: "Swisse"
    }), false);
  });
});
