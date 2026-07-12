import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT,
  HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS,
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

function excellentProfile() {
  return {
    activity: "active",
    alcohol: "none",
    antibiotics: "no",
    diet: "whole",
    digestion: "none",
    energy: "excellent",
    foodFrequency: {
      dairy: "daily",
      eggs: "daily",
      fish: "often",
      fruitveg: "3+",
      legumes: "most",
      redmeat: "rare"
    },
    goals: ["sleep"],
    hrv: "70",
    labs: {
      b12: "700",
      ferritin: "80",
      hba1c: "5.1",
      o3: "8",
      vitd: "45"
    },
    labUnits: {
      b12: "pg/mL",
      ferritin: "ng/mL",
      hba1c: "%",
      o3: "%",
      vitd: "ng/mL"
    },
    meds: "none",
    sex: "female",
    sleepHrs: "8-9",
    smoking: "never",
    stress: "low",
    sun: "30+",
    sunscreen: "sometimes",
    symptoms: [],
    vo2: "52"
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

  it("uses singular grammar when only one finding is caught", () => {
    const result = computeHealthScore(
      {
        age: "36-45",
        country: "Thailand",
        goals: ["energy"],
        sex: "male",
        sun: "15-30",
        sunscreen: "daily"
      },
      "en"
    );

    assert.equal(result.pageContent?.copySeeds.findings.length, 1);
    assert.equal(
      result.pageContent?.copySeeds.findingsHeadline,
      "1 thing a generic vitamin quiz would have missed."
    );
  });

  it("uses gap-framed relativity below median", () => {
    const result = computeHealthScore(profileOne(), "en");
    const relativity = result.pageContent?.copySeeds.relativity;

    assert.equal(relativity?.mode, "gap");
    assert.equal(relativity?.gap, 13);
    assert.equal(relativity?.spectrumMedian, 60);
    assert.equal(relativity?.spectrumYou, 47);
  });

  it("exposes the v7 presentation contract from deterministic fields", () => {
    const result = computeHealthScore(profileOne(), "en");
    const page = result.pageContent;

    assert.ok(page);
    assert.equal(page.locked.score, 47);
    assert.equal(page.locked.median, 60);
    assert.equal(page.locked.percentile, 4);
    assert.equal(page.copySeeds.bandPill, "Building foundation");
    assert.equal(page.copySeeds.opportunityPill, "High opportunity");
    assert.equal(page.copySeeds.relativity.spectrumMedianPct, 48.4);
    assert.equal(page.copySeeds.relativity.spectrumYouPct, 27.4);
    assert.equal(page.copySeeds.relativity.spectrumGapLeftPct, 27.4);
    assert.equal(page.copySeeds.relativity.spectrumGapWidthPct, 21);
    assert.deepEqual(page.copySeeds.relativity.legendCaptions, [
      "Where you are",
      "Recoverable gap",
      "Room to grow to 92"
    ]);
    assert.deepEqual(
      page.copySeeds.methodCards.map((card) => card.number),
      [1, 2, 3]
    );
    assert.equal(
      page.locked.pillars.filter((pillar) => pillar.isHero).length,
      1
    );
    assert.deepEqual(
      page.locked.pillars.map((pillar) => pillar.fillClass),
      ["hi", "hi", "hi", "lo", "lo"]
    );
    assert.deepEqual(
      page.locked.pillars.map((pillar) => pillar.value),
      [...page.locked.pillars.map((pillar) => pillar.value)].sort(
        (left, right) => right - left
      )
    );
    assert.equal(page.copySeeds.subtraction.labelChosen, "Shortlisted for your score");
    assert.equal(
      page.locked.subtraction.evaluated,
      DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT
    );
    assert.ok(page.locked.subtraction.chosen >= 6);
    assert.ok(page.locked.subtraction.chosen <= 12);
  });

  it("uses rank-framed relativity above median and caps visible percentile", () => {
    const result = computeHealthScore(excellentProfile(), "en");
    const page = result.pageContent;

    assert.ok(page);
    assert.equal(result.score, 92);
    assert.equal(result.band, "Excellent");
    assert.equal(page.locked.percentile, 96);
    assert.equal(page.copySeeds.relativity.mode, "rank");
    assert.equal(page.copySeeds.relativity.spectrumMedian, 60);
    assert.equal(page.copySeeds.relativity.spectrumYou, 92);
    assert.equal(page.copySeeds.opportunityPill, "Top tier");
  });

  it("localizes v7 read-model labels for public locales", () => {
    const expected = {
      en: {
        bandPill: "Building foundation",
        shortlisted: "Shortlisted for your score"
      },
      th: {
        bandPill: "กำลังสร้างพื้นฐาน",
        shortlisted: "คัดเลือกสำหรับคะแนนของคุณ"
      },
      "zh-CN": {
        bandPill: "正在建立基础",
        shortlisted: "进入你的备选"
      }
    } as const;

    for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
      const page = computeHealthScore(profileOne(), locale).pageContent;

      assert.ok(page);
      assert.equal(page.copySeeds.bandPill, expected[locale].bandPill);
      assert.equal(
        page.copySeeds.subtraction.labelChosen,
        expected[locale].shortlisted
      );
      assert.equal(page.copySeeds.relativity.legendCaptions.length, 3);
    }
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

  it("derives the HealthScore selected nutrient count from assessment complexity", () => {
    const simple = computeHealthScore(
      {
        activity: "active",
        alcohol: "none",
        diet: "whole",
        digestion: "none",
        energy: "good",
        foodFrequency: {
          fish: "often",
          fruitveg: "3+"
        },
        goals: ["sleep"],
        meds: "none",
        sex: "female",
        sleepHrs: "8-9",
        smoking: "never",
        stress: "low"
      },
      "en"
    );
    const broad = computeHealthScore(
      {
        activity: "active",
        alcohol: "4-7",
        antibiotics: "yes",
        diet: "whole",
        digestion: "constipation",
        energy: "excellent",
        foodFrequency: {
          dairy: "never",
          eggs: "weekly",
          fish: "rare",
          fruitveg: "1-2",
          legumes: "most",
          redmeat: "3+"
        },
        goals: ["sleep", "fitness", "energy"],
        hrv: "46",
        labs: {
          b12: "520",
          ferritin: "80",
          hba1c: "5.3",
          o3: "6.2",
          vitd: "42"
        },
        labUnits: {
          b12: "pg/mL",
          ferritin: "ng/mL",
          hba1c: "%",
          o3: "%",
          vitd: "ng/mL"
        },
        medTypes: ["statin"],
        meds: "yes",
        sex: "female",
        sleepHrs: "8-9",
        smoking: "occasional",
        stress: "moderate",
        symptoms: ["stress", "fatigue"],
        vo2: "48"
      },
      "en"
    );

    assert.equal(simple.pageContent?.locked.subtraction.chosen, 6);
    assert.equal(simple.pageContent?.locked.nutrientsChosen, 6);
    assert.equal(broad.pageContent?.locked.subtraction.chosen, 12);
    assert.equal(
      broad.pageContent?.locked.subtraction.setAside,
      DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT - 12
    );
    assert.equal(broad.pageContent?.locked.nutrientsChosen, 12);
  });

  it("allows the live supplement catalogue count to override the fallback", () => {
    const result = computeHealthScore(profileOne(), "en", {
      evaluatedIngredientCount: 160
    });

    assert.equal(result.pageContent?.locked.subtraction.evaluated, 160);
    assert.equal(
      result.pageContent?.locked.subtraction.setAside,
      160 - (result.pageContent?.locked.subtraction.chosen ?? 0)
    );
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

  it("keeps deterministic zh-CN copy out of English and Thai fallback text", () => {
    const result = computeHealthScore(profileOne(), "zh-CN");
    const leaks: string[] = [];
    const allowedLatin =
      /\b(?:HealthScore|CoQ10|Omega|B12|D3|STATIN|AI|ml|kg|min|BMI)\b/g;

    walkStrings(result.pageContent?.copySeeds, (text) => {
      const normalized = text.replace(allowedLatin, "");

      if (/[\u0E00-\u0E7F]/.test(normalized)) {
        leaks.push(text);
      }

      if (/[A-Za-z][A-Za-z0-9+.'&-]*(?:\s+[A-Za-z][A-Za-z0-9+.'&-]*){1,}/.test(normalized)) {
        leaks.push(text);
      }
    });

    assert.deepEqual(leaks, []);
  });
});
