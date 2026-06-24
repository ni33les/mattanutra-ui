import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferProductFormFromTextParts,
  normalizeProductForm
} from "@/lib/product-form";

describe("product form normalization", () => {
  it("normalizes explicit form aliases", () => {
    assert.equal(normalizeProductForm("soft gel"), "softgel");
    assert.equal(normalizeProductForm("capsules"), "capsule");
    assert.equal(normalizeProductForm("tabs"), "tablet");
  });

  it("infers forms from product text and facts", () => {
    assert.equal(
      inferProductFormFromTextParts([
        "Blackmores Bio C 1000",
        { servingLabel: "1 tablet daily" }
      ]),
      "tablet"
    );
    assert.equal(
      inferProductFormFromTextParts(["Collagen Peptides Powder 250g"]),
      "powder"
    );
    assert.equal(
      inferProductFormFromTextParts(["Omega 3 Fish Oil Softgels"]),
      "softgel"
    );
  });

  it("falls back to food only for food products", () => {
    assert.equal(inferProductFormFromTextParts([], { productKind: "food" }), "food");
    assert.equal(
      inferProductFormFromTextParts(["Daily multivitamin"], {
        productKind: "supplement"
      }),
      "unknown"
    );
  });
});
