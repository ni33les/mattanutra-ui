import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS,
  applyHealthScoreProductSubtraction,
  computeHealthScore
} from "../lib/health-score.ts";

function profileOne() {
  return {
    activity: "light",
    age: "36-45",
    country: "Singapore",
    diet: "balanced",
    digestion: "bloating",
    energy: "low",
    foodFrequency: {
      fish: "rare"
    },
    goals: ["energy", "heart", "fitness"],
    medTypes: ["statin"],
    meds: "yes",
    sex: "male",
    sleepHrs: "6-7",
    stress: "high",
    sun: "15-30",
    sunscreen: "daily",
    supplements: "basic",
    symptoms: ["fatigue", "digestion", "sleep"]
  };
}

function domainScore(
  result: ReturnType<typeof computeHealthScore>,
  id: string
) {
  const domain = result.domains.find((candidate) => candidate.id === id);

  assert.ok(domain, `Expected ${id} domain`);

  return domain.score;
}

function walkStrings(value: unknown, visit: (text: string) => void) {
  if (typeof value === "string") {
    visit(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkStrings(item, visit);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      walkStrings(item, visit);
    }
  }
}

describe("HealthScore v4 deterministic scoring", () => {
  it("matches the reference Profile 1 scoring and locked content", () => {
    const result = computeHealthScore(profileOne(), "en");

    assert.equal(result.version, "healthscore:v4");
    assert.equal(result.score, 47);
    assert.equal(result.band, "Building foundation");
    assert.equal(result.pageContent?.locked.percentile, 4);
    assert.deepEqual(result.flagCodes, ["STATIN_COQ10", "VITD_ROUTINE"]);
    assert.equal(domainScore(result, "habits"), 90);
    assert.equal(domainScore(result, "sleep"), 67);
    assert.equal(domainScore(result, "nutrition"), 67);
    assert.equal(domainScore(result, "activity"), 43);
    assert.equal(domainScore(result, "stress"), 38);
  });

  it("keeps tier-1 findings first and caps the visible findings at three", () => {
    const result = computeHealthScore(profileOne(), "en");
    const findings = result.pageContent?.copySeeds.findings ?? [];

    assert.ok(findings.length > 0);
    assert.ok(findings.length <= 3);
    assert.equal(findings[0].code, "STATIN_COQ10");
    assert.ok(findings.some((finding) => finding.code === "VITD_ROUTINE"));
  });

  it("uses gap-framed relativity below median", () => {
    const result = computeHealthScore(profileOne(), "en");
    const relativity = result.pageContent?.copySeeds.relativity;

    assert.equal(relativity?.mode, "gap");
    assert.equal(relativity?.gap, 13);
    assert.equal(relativity?.spectrumMedian, 60);
    assert.equal(relativity?.spectrumYou, 47);
  });

  it("normalizes nested answer fields and lab units", () => {
    const nestedNgMl = computeHealthScore(
      {
        age: "36-45",
        country: "TH",
        foodFrequency: {
          fish: "often",
          fruitveg: "3+"
        },
        labs: { vitd: "40" },
        labUnits: { vitd: "ng/mL" },
        sex: "male"
      },
      "en"
    );
    const flatNmolL = computeHealthScore(
      {
        age: "36-45",
        country: "Thailand",
        f_fish: "often",
        f_fruitveg: "3+",
        lab_vitd: "100",
        labUnits: { vitd: "nmol/L" },
        sex: "male"
      },
      "en"
    );

    assert.equal(nestedNgMl.verification, flatNmolL.verification);
    assert.equal(domainScore(nestedNgMl, "nutrition"), domainScore(flatNmolL, "nutrition"));
  });

  it("orders the five pillars by score for page rendering", () => {
    const result = computeHealthScore(profileOne(), "en");
    const pillarLabels = result.pageContent?.locked.pillars.map((pillar) => pillar.label);

    assert.deepEqual(pillarLabels, [
      "Health Habits",
      "Sleep & Recovery",
      "Nutrition & Diet",
      "Activity & Fitness",
      "Stress & Balance"
    ]);
  });

  it("keeps deterministic fallback copy clear of forbidden substrings", () => {
    const result = computeHealthScore(profileOne(), "en");
    const hits: string[] = [];

    walkStrings(result.pageContent?.copySeeds, (text) => {
      const lower = text.toLowerCase();

      for (const forbidden of HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS) {
        if (lower.includes(forbidden)) {
          hits.push(forbidden);
        }
      }
    });

    assert.deepEqual(hits, []);
  });

  it("switches subtraction to product mode without changing locked score facts", () => {
    const result = computeHealthScore(profileOne(), "en");
    const productReady = applyHealthScoreProductSubtraction(result, {
      productsChosen: 4,
      productsEvaluated: 37
    });

    assert.equal(productReady.score, 47);
    assert.equal(productReady.pageContent?.locked.subtraction.mode, "products");
    assert.equal(productReady.pageContent?.locked.subtraction.evaluated, 37);
    assert.equal(productReady.pageContent?.locked.subtraction.setAside, 33);
    assert.equal(productReady.pageContent?.locked.subtraction.chosen, 4);
    assert.equal(productReady.pageContent?.aiCopy, undefined);
  });
});
