import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    advice?: Record<string, unknown>;
    pageCopy: Record<string, unknown>;
  };
}

function addLegacyAdvice(response: ReturnType<typeof mutableResponse>) {
  response.advice = {
    overview: text,
    paywallEyebrow: text,
    paywallFeatures: paywallFeatures(),
    paywallSubtitle: text,
    paywallTitle: text
  };

  return response.advice;
}

function validate(value: unknown) {
  return validateHealthScoreAiResponse({
    healthScore: computeHealthScore(profileOne(), "en"),
    locale: "th",
    value
  });
}

describe("HealthScore AI copy validator", () => {
  it("uses the shared Grok/xAI client for HealthScore copy", async () => {
    const source = await readFile(
      new URL("../lib/health-score-analysis.ts", import.meta.url),
      "utf8"
    );

    assert.match(source, /callGrokChatCompletion/);
    assert.match(source, /getRequiredXaiApiKey/);
    assert.match(source, /process\.env\.GROK_MODEL/);
    assert.match(source, /v8-single-display-locale/);
    assert.match(source, /Return exactly one top-level key: pageCopy/);
    assert.match(source, /outputLocaleMode: "single_display_locale"/);
    assert.match(source, /Return only the requested display locale/);
    assert.doesNotMatch(source, /Every localized field must include these locale keys/);
    assert.doesNotMatch(source, /requiredOutputLocales/);
    assert.match(source, /DEFAULT_HEALTHSCORE_REASONING_EFFORT = "none"/);
    assert.match(source, /maxTokens: MAX_RESPONSE_TOKENS/);
    assert.doesNotMatch(source, /paywallFeatures: "Exactly 3 localized feature cards/);
  });

  it("accepts structured English and Thai page copy in locked slots", () => {
    const validation = validate(validResponse());

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(validation.response.pageCopy.gapTrio?.length, 3);
    assert.equal(validation.response.pageCopy.findings?.length, 3);
    assert.equal(
      (validation.response.advice.overview as { en: string }).en,
      text.en
    );
  });

  it("accepts localized paywall feature cards from legacy cached responses", () => {
    const response = mutableResponse();
    const advice = addLegacyAdvice(response);
    const grokPaywallFeatures = Array.from({ length: 3 }, (_, index) => ({
      en: {
        description: `English paywall card ${index + 1}`,
        name: `English card ${index + 1}`
      },
      th: {
        description: `รายละเอียดการ์ด ${index + 1}`,
        name: `การ์ด ${index + 1}`
      }
    }));
    advice.paywallFeatures = grokPaywallFeatures;
    response.pageCopy.paywallFeatures = grokPaywallFeatures;

    const validation = validate(response);

    assert.deepEqual(validation.errors, []);
    assert.equal(
      (validation.response?.advice.paywallFeatures?.[0]?.name as { en: string }).en,
      "English card 1"
    );
  });

  it("accepts localized paywall feature shorthand from legacy cached responses", () => {
    const response = mutableResponse();
    const advice = addLegacyAdvice(response);
    const grokPaywallFeatures = Array.from({ length: 3 }, (_, index) => ({
      en: `English paywall card ${index + 1}`,
      th: `รายละเอียดการ์ด ${index + 1}`
    }));
    advice.paywallFeatures = grokPaywallFeatures;
    response.pageCopy.paywallFeatures = grokPaywallFeatures;

    const validation = validate(response);

    assert.deepEqual(validation.errors, []);
    assert.equal(
      (validation.response?.pageCopy.paywallFeatures?.[0]?.description as { en: string }).en,
      "English paywall card 1"
    );
  });

  it("rejects missing required locales", () => {
    const response = mutableResponse();

    response.pageCopy.heroTitle = { en: "English only" };

    const validation = validate(response);

    assert.ok(validation.errors.some((error) => error.includes("heroTitle.th")));
  });

  it("allows single display-locale copy when the current locale is English", () => {
    const response = mutableResponse();

    response.pageCopy.heroBody = { en: "English only" };

    const validation = validateHealthScoreAiResponse({
      healthScore: computeHealthScore(profileOne(), "en"),
      locale: "en",
      value: response
    });

    assert.deepEqual(validation.errors, []);
  });

  it("allows single display-locale copy when the current locale is Chinese", () => {
    const response = mutableResponse();
    const chinese = "这是一段贴合当前健康分数的具体说明。";

    for (const key of [
      "bandLine",
      "findingsHeadline",
      "findingsSub",
      "heroBody",
      "heroTitle",
      "highestLeverageBody",
      "methodHeadline",
      "pillarHeadline",
      "relativityHeadline",
      "relativitySub",
      "strengthNote",
      "subtractionBody"
    ]) {
      response.pageCopy[key] = chinese;
    }
    response.pageCopy.findings = localizedCards(3).map(() => ({
      body: chinese,
      headline: chinese
    }));
    response.pageCopy.gapTrio = localizedCards(3).map(() => ({
      body: chinese,
      headline: chinese
    }));
    response.pageCopy.methodCards = localizedCards(3, "title").map(() => ({
      body: chinese,
      title: chinese
    }));

    const validation = validateHealthScoreAiResponse({
      healthScore: computeHealthScore(profileOne(), "zh-CN"),
      locale: "zh-CN",
      value: response
    });

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(
      (validation.response.pageCopy.heroTitle as { "zh-CN": string })["zh-CN"],
      chinese
    );
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

  it("rejects singular/plural anomalies in localized copy", () => {
    const response = mutableResponse();

    response.pageCopy.findingsHeadline = {
      en: "1 things a generic vitamin quiz would have missed.",
      th: "1 เรื่องที่แบบทดสอบวิตามินทั่วไปมักมองข้าม"
    };

    const validation = validate(response);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("singular grammar for 1 thing")
      )
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

  it("strips harmless deterministic seed metadata echoed inside cards", () => {
    const response = mutableResponse();

    response.pageCopy.gapTrio = localizedCards(3).map((card, index) => ({
      ...card,
      tag: `GAP ${index + 1}`,
      value: `${index + 1}`
    }));
    response.pageCopy.findings = localizedCards(3).map((card, index) => ({
      ...card,
      code: `FINDING_${index + 1}`,
      icon: "*"
    }));

    const validation = validate(response);

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(
      (validation.response.pageCopy.gapTrio?.[0]?.headline as { en: string }).en,
      "Card 1"
    );
    assert.equal(
      "tag" in (validation.response.pageCopy.gapTrio?.[0] ?? {}),
      false
    );
  });
});
