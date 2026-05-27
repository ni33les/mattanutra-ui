import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHealthScore } from "../lib/health-score.ts";
import { validateHealthScoreAiResponse } from "../lib/health-score-analysis.ts";

const text = {
  en: "Specific copy anchored to this HealthScore result.",
  th: "ข้อความเฉพาะที่ยึดกับผลคะแนนสุขภาพนี้"
};

function profileOne() {
  return {
    activity: "light",
    age: "36-45",
    country: "Singapore",
    diet: "balanced",
    digestion: "bloating",
    energy: "low",
    foodFrequency: { fish: "rare" },
    goals: ["energy", "heart", "fitness"],
    medTypes: ["statin"],
    meds: "yes",
    sex: "male",
    sleepHrs: "6-7",
    stress: "high",
    sun: "15-30",
    sunscreen: "daily",
    symptoms: ["fatigue", "digestion", "sleep"]
  };
}

function localizedCards(count: number, titleKey: "headline" | "title" = "headline") {
  return Array.from({ length: count }, (_, index) => ({
      body: {
      en: `Body ${index + 1} grounded in the selected assessment signals.`,
      th: `รายละเอียด ${index + 1} ที่ยึดกับสัญญาณจากแบบประเมิน`
    },
    [titleKey]: {
      en: `Card ${index + 1}`,
      th: `การ์ด ${index + 1}`
    }
  }));
}

function paywallFeatures() {
  return localizedCards(3).map((card) => ({
    description: card.body,
    name: card.headline
  }));
}

function validResponse() {
  return {
    advice: {
      overview: text,
      paywallEyebrow: text,
      paywallFeatures: paywallFeatures(),
      paywallSubtitle: text,
      paywallTitle: text
    },
    pageCopy: {
      bandLine: text,
      findingsHeadline: text,
      findingsSub: text,
      findings: localizedCards(3),
      gapTrio: localizedCards(3),
      heroBody: text,
      heroTitle: text,
      highestLeverageBody: text,
      methodCards: localizedCards(3, "title"),
      methodHeadline: text,
      overview: text,
      paywallFeatures: paywallFeatures(),
      paywallSubtitle: text,
      paywallTitle: text,
      pillarHeadline: text,
      relativityHeadline: text,
      relativitySub: text,
      strengthNote: text,
      subtractionBody: text
    }
  };
}

function mutableResponse() {
  return validResponse() as unknown as {
    advice: Record<string, unknown>;
    pageCopy: Record<string, unknown>;
  };
}

function validate(value: unknown) {
  return validateHealthScoreAiResponse({
    healthScore: computeHealthScore(profileOne(), "en"),
    locale: "th",
    value
  });
}

describe("HealthScore AI copy validator", () => {
  it("accepts structured English and Thai page copy in locked slots", () => {
    const validation = validate(validResponse());

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(validation.response.pageCopy.gapTrio?.length, 3);
    assert.equal(validation.response.pageCopy.findings?.length, 3);
  });

  it("rejects missing required locales", () => {
    const response = mutableResponse();

    response.pageCopy.heroTitle = { en: "English only" };

    const validation = validate(response);

    assert.ok(validation.errors.some((error) => error.includes("heroTitle.th")));
  });

  it("requires both English and Thai even when the current locale is English", () => {
    const response = mutableResponse();

    response.pageCopy.heroBody = { en: "English only" };

    const validation = validateHealthScoreAiResponse({
      healthScore: computeHealthScore(profileOne(), "en"),
      locale: "en",
      value: response
    });

    assert.ok(validation.errors.some((error) => error.includes("heroBody.th")));
  });

  it("rejects extra top-level fields that try to alter locked facts", () => {
    const validation = validate({
      ...validResponse(),
      locked: { score: 99 }
    });

    assert.ok(
      validation.errors.some((error) =>
        error.includes("Top-level response must only include advice and pageCopy")
      )
    );
  });

  it("rejects banned copy substrings", () => {
    const response = mutableResponse();

    response.pageCopy.subtractionBody = {
      en: "Get tested with bloodwork before doing anything.",
      th: "ข้อความไทย"
    };

    const validation = validate(response);

    assert.ok(
      validation.errors.some((error) => error.includes("forbidden term"))
    );
  });

  it("rejects wrong card counts", () => {
    const response = mutableResponse();

    response.pageCopy.methodCards = localizedCards(2, "title");

    const validation = validate(response);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("methodCards must contain exactly 3 items")
      )
    );
  });

  it("rejects schema drift inside cards", () => {
    const response = mutableResponse();

    response.pageCopy.gapTrio = [
      ...localizedCards(2),
      {
        ...localizedCards(1)[0],
        lockedScore: 47
      }
    ];

    const validation = validate(response);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("gapTrio[2] has unexpected keys")
      )
    );
  });
});
