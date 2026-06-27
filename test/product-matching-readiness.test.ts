import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productMatchingReadiness } from "../lib/product-matching-readiness.ts";

function baseProduct() {
  return {
    availableCountryCodes: ["TH"],
    brandStatus: "approved" as const,
    facts: [{}],
    imageUrl: "/uploads/dev/content/product.webp",
    labelStatus: "parsed",
    manufacturerCountryCodes: ["TH"],
    status: "approved" as const,
    validation: {
      matchableFactCount: 1,
      reasons: [],
      status: "pass" as const,
      summary: "1 matchable canonical fact."
    }
  };
}

describe("product matching readiness", () => {
  it("marks a clean approved product as matchable", () => {
    const readiness = productMatchingReadiness(baseProduct());

    assert.equal(readiness.ready, true);
    assert.equal(readiness.primaryReason, "Ready for matching.");
    assert.deepEqual(
      readiness.checks.filter((check) => !check.passed),
      []
    );
  });

  it("reports the first actionable blocker", () => {
    const readiness = productMatchingReadiness({
      ...baseProduct(),
      brandStatus: "pending_review"
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.primaryReason, "Brand is still pending review.");
    assert.equal(
      readiness.checks.find((check) => check.id === "brand_status")?.passed,
      false
    );
  });

  it("requires a parsed label with usable validation facts", () => {
    const readiness = productMatchingReadiness({
      ...baseProduct(),
      facts: [],
      labelStatus: "missing",
      validation: {
        matchableFactCount: 0,
        reasons: ["no_dosed_facts"] as const,
        status: "failed" as const,
        summary: "No usable per-serving product facts."
      }
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.primaryReason, "Product label facts are missing or not parsed.");
    assert.equal(
      readiness.checks.find((check) => check.id === "validation")?.reason,
      "No usable per-serving product facts."
    );
  });
});
