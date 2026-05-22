import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHealthScore } from "../lib/health-score.ts";

function domainScore(
  result: ReturnType<typeof computeHealthScore>,
  id: string
) {
  const domain = result.domains.find((candidate) => candidate.id === id);

  assert.ok(domain, `Expected ${id} domain`);

  return domain.score;
}

const bodyContext = {
  age: "36-45",
  heightCm: "175",
  sex: "male",
  weightKg: "72"
};

describe("HealthScore v3 deterministic scoring", () => {
  it("uses v3 sleep fields and ignores the removed legacy sleep-quality key", () => {
    const lowLegacySleep = computeHealthScore(
      {
        ...bodyContext,
        caffeine: "1",
        energy: "good",
        sleep: "1",
        sleepHrs: "7-8"
      },
      "en"
    );
    const highLegacySleep = computeHealthScore(
      {
        ...bodyContext,
        caffeine: "1",
        energy: "good",
        sleep: "5",
        sleepHrs: "7-8"
      },
      "en"
    );

    assert.equal(
      domainScore(lowLegacySleep, "sleep"),
      domainScore(highLegacySleep, "sleep")
    );
  });

  it("normalizes v3 lab units before scoring biomarkers", () => {
    const ngMl = computeHealthScore(
      {
        ...bodyContext,
        labs: { vitd: "40" },
        labUnits: { vitd: "ng/mL" }
      },
      "en"
    );
    const nmolL = computeHealthScore(
      {
        ...bodyContext,
        labs: { vitd: "100" },
        labUnits: { vitd: "nmol/L" }
      },
      "en"
    );

    assert.equal(domainScore(ngMl, "biomarkers"), domainScore(nmolL, "biomarkers"));
  });

  it("scores the new v3 lifestyle fields across sleep, nutrition, stress, and habits", () => {
    const strong = computeHealthScore(
      {
        ...bodyContext,
        activity: "active",
        alcohol: "none",
        caffeine: "1",
        diet: "whole",
        digCondition: "none",
        digestion: "none",
        energy: "good",
        foodFrequency: {
          dairy: "1-2",
          eggs: "weekly",
          fish: "often",
          fruitveg: "3+",
          legumes: "most",
          redmeat: "1-2"
        },
        protein: "1.5-2",
        skin: "III",
        sleepHrs: "7-8",
        smoking: "never",
        stress: "low",
        sun: "30-60",
        sunscreen: "daily",
        symptoms: ["great"]
      },
      "en"
    );
    const weak = computeHealthScore(
      {
        ...bodyContext,
        activity: "sitting",
        alcohol: "8+",
        caffeine: "4+",
        diet: "processed",
        digCondition: "ibs",
        digestion: "loose",
        energy: "drained",
        foodFrequency: {
          dairy: "never",
          eggs: "rare",
          fish: "never",
          fruitveg: "notdaily",
          legumes: "rare",
          redmeat: "3+"
        },
        protein: "u1",
        skin: "I",
        sleepHrs: "u5",
        smoking: "daily",
        stress: "extreme",
        sun: "60+",
        sunscreen: "rarely",
        symptoms: ["fatigue", "brainfog", "sleep", "stress", "joints"]
      },
      "en"
    );

    assert.ok(domainScore(strong, "sleep") > domainScore(weak, "sleep"));
    assert.ok(domainScore(strong, "nutrition") > domainScore(weak, "nutrition"));
    assert.ok(domainScore(strong, "stress") > domainScore(weak, "stress"));
    assert.ok(domainScore(strong, "habits") > domainScore(weak, "habits"));
    assert.ok(strong.score > weak.score + 25);
  });
});
