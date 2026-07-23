import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { computeHealthScore } from "../lib/health-score.ts";
import type { HealthScoreResult } from "../lib/health-score.ts";
import { validateHealthScoreAiResponse } from "../lib/health-score-analysis.ts";
import type { Locale } from "../lib/i18n.ts";

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

function scoreFor(locale: Locale = "en") {
  return computeHealthScore(profileOne(), locale);
}

/** Bilingual fixture: same seed text in en + th so length/numeric checks stay fair. */
function bilingual(seed: string) {
  return { en: seed, th: seed };
}

function seedBasedPageCopy(healthScore: HealthScoreResult) {
  const seeds = healthScore.pageContent?.copySeeds;
  assert.ok(seeds, "expected copySeeds for profile fixture");

  return {
    bandLine: bilingual(seeds.bandLine),
    findingsHeadline: bilingual(seeds.findingsHeadline),
    findingsSub: bilingual(seeds.findingsSub),
    findings: seeds.findings.map((card) => ({
      body: bilingual(card.body),
      headline: bilingual(card.headline)
    })),
    gapTrio: seeds.gapTrio.map((card) => ({
      body: bilingual(card.body),
      headline: bilingual(card.headline)
    })),
    heroBody: bilingual(seeds.heroBody),
    heroTitle: bilingual("You came here for energy, a stronger heart, and fitness."),
    highestLeverageBody: bilingual(
      seeds.highestLeverage?.text ?? seeds.pillarHeadline
    ),
    methodCards: seeds.methodCards.map((card) => ({
      body: bilingual(card.body),
      title: bilingual(card.title)
    })),
    methodHeadline: bilingual(seeds.methodHeadline),
    pillarHeadline: bilingual(seeds.pillarHeadline),
    relativityHeadline: bilingual(seeds.relativity.headline),
    relativitySub: bilingual(seeds.relativity.sub),
    strengthNote: bilingual(seeds.strengthNote ?? seeds.pillarHeadline),
    subtractionBody: bilingual(seeds.subtraction.body)
  };
}

function validResponse(healthScore: HealthScoreResult = scoreFor("en")) {
  return {
    pageCopy: seedBasedPageCopy(healthScore)
  };
}

function mutableResponse(healthScore: HealthScoreResult = scoreFor("en")) {
  return validResponse(healthScore) as unknown as {
    advice?: Record<string, unknown>;
    pageCopy: Record<string, unknown>;
  };
}

function addLegacyAdvice(
  response: ReturnType<typeof mutableResponse>,
  healthScore: HealthScoreResult = scoreFor("en")
) {
  const seeds = healthScore.pageContent?.copySeeds;
  assert.ok(seeds);

  response.advice = {
    overview: bilingual(seeds.heroBody),
    paywallEyebrow: bilingual("Your plan is ready for the next step."),
    paywallFeatures: seeds.methodCards.map((card) => ({
      description: bilingual(card.body),
      name: bilingual(card.title)
    })),
    paywallSubtitle: bilingual(
      "Open the full plan to turn this score into the exact formula and product stack."
    ),
    paywallTitle: bilingual("Turn your HealthScore into a plan you can run.")
  };

  return response.advice;
}

function validate(
  value: unknown,
  healthScore: HealthScoreResult = scoreFor("en"),
  locale: Locale = "th"
) {
  return validateHealthScoreAiResponse({
    healthScore,
    locale,
    value
  });
}

describe("HealthScore AI copy validator", () => {
  it("uses the shared Grok/xAI client for HealthScore copy", async () => {
    const source = await readFile(
      new URL("../lib/health-score-analysis.ts", import.meta.url),
      "utf8"
    );

    assert.match(source, /callGovernedGrokChatCompletion/);
    assert.doesNotMatch(source, /callGrokChatCompletion\(\{/);
    assert.match(source, /getRequiredXaiApiKey/);
    assert.match(source, /process\.env\.GROK_MODEL/);
    assert.match(source, /v8-single-display-locale/);
    assert.match(source, /Return exactly one top-level key: pageCopy/);
    assert.match(source, /outputLocaleMode: "single_display_locale"/);
    assert.match(source, /Return only the requested display locale/);
    assert.doesNotMatch(source, /Every localized field must include these locale keys/);
    assert.doesNotMatch(source, /requiredOutputLocales/);
    assert.match(source, /grokTaskReasoningDefault\("healthScoreCopy"\)/);
    assert.match(source, /maxTokens: MAX_RESPONSE_TOKENS/);
    assert.doesNotMatch(source, /paywallFeatures: "Exactly 3 localized feature cards/);
  });

  it("accepts structured English and Thai page copy in locked slots", () => {
    const healthScore = scoreFor("en");
    const response = validResponse(healthScore);
    const validation = validate(response, healthScore);

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(validation.response.pageCopy.gapTrio?.length, 3);
    assert.equal(validation.response.pageCopy.findings?.length, 3);
    assert.equal(
      (validation.response.advice.overview as { en: string }).en,
      healthScore.pageContent?.copySeeds.heroBody
    );
  });

  it("accepts localized paywall feature cards from legacy cached responses", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const advice = addLegacyAdvice(response, healthScore);
    const seeds = healthScore.pageContent!.copySeeds;
    const grokPaywallFeatures = seeds.methodCards.map((card) => ({
      en: {
        description: card.body,
        name: card.title
      },
      th: {
        description: card.body,
        name: card.title
      }
    }));
    advice.paywallFeatures = grokPaywallFeatures;
    response.pageCopy.paywallFeatures = grokPaywallFeatures;

    const validation = validate(response, healthScore);

    assert.deepEqual(validation.errors, []);
    assert.equal(
      (validation.response?.advice.paywallFeatures?.[0]?.name as { en: string }).en,
      seeds.methodCards[0]?.title
    );
  });

  it("accepts localized paywall feature shorthand from legacy cached responses", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const advice = addLegacyAdvice(response, healthScore);
    const seeds = healthScore.pageContent!.copySeeds;
    const grokPaywallFeatures = seeds.methodCards.map((card) => ({
      en: card.body,
      th: card.body
    }));
    advice.paywallFeatures = grokPaywallFeatures;
    response.pageCopy.paywallFeatures = grokPaywallFeatures;

    const validation = validate(response, healthScore);

    assert.deepEqual(validation.errors, []);
    assert.equal(
      (validation.response?.pageCopy.paywallFeatures?.[0]?.description as { en: string }).en,
      seeds.methodCards[0]?.body
    );
  });

  it("rejects missing required locales", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);

    response.pageCopy.heroTitle = { en: "English only" };

    const validation = validate(response, healthScore);

    assert.ok(validation.errors.some((error) => error.includes("heroTitle.th")));
  });

  it("allows single display-locale copy when the current locale is English", () => {
    const healthScore = scoreFor("en");
    const seeds = healthScore.pageContent!.copySeeds;
    const response = mutableResponse(healthScore);

    response.pageCopy.heroBody = { en: seeds.heroBody };

    const validation = validateHealthScoreAiResponse({
      healthScore,
      locale: "en",
      value: response
    });

    assert.deepEqual(validation.errors, []);
  });

  it("allows single display-locale copy when the current locale is Chinese", () => {
    const healthScore = scoreFor("zh-CN");
    const seeds = healthScore.pageContent!.copySeeds;
    const asLocale = (text: string) => text;

    const response = {
      pageCopy: {
        bandLine: asLocale(seeds.bandLine),
        findingsHeadline: asLocale(seeds.findingsHeadline),
        findingsSub: asLocale(seeds.findingsSub),
        findings: seeds.findings.map((card) => ({
          body: asLocale(card.body),
          headline: asLocale(card.headline)
        })),
        gapTrio: seeds.gapTrio.map((card) => ({
          body: asLocale(card.body),
          headline: asLocale(card.headline)
        })),
        heroBody: asLocale(seeds.heroBody),
        heroTitle: asLocale("你来这里是为了能量、更强的心脏和健身。"),
        highestLeverageBody: asLocale(
          seeds.highestLeverage?.text ?? seeds.pillarHeadline
        ),
        methodCards: seeds.methodCards.map((card) => ({
          body: asLocale(card.body),
          title: asLocale(card.title)
        })),
        methodHeadline: asLocale(seeds.methodHeadline),
        pillarHeadline: asLocale(seeds.pillarHeadline),
        relativityHeadline: asLocale(seeds.relativity.headline),
        relativitySub: asLocale(seeds.relativity.sub),
        strengthNote: asLocale(seeds.strengthNote ?? seeds.pillarHeadline),
        subtractionBody: asLocale(seeds.subtraction.body)
      }
    };

    const validation = validateHealthScoreAiResponse({
      healthScore,
      locale: "zh-CN",
      value: response
    });

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(
      (validation.response.pageCopy.heroTitle as { "zh-CN": string })["zh-CN"],
      "你来这里是为了能量、更强的心脏和健身。"
    );
  });

  it("rejects extra top-level fields that try to alter locked facts", () => {
    const healthScore = scoreFor("en");
    const validation = validate(
      {
        ...validResponse(healthScore),
        locked: { score: 99 }
      },
      healthScore
    );

    assert.ok(
      validation.errors.some((error) =>
        error.includes("Top-level response must only include advice and pageCopy")
      )
    );
  });

  it("rejects banned copy substrings", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seed = healthScore.pageContent!.copySeeds.subtraction.body;

    response.pageCopy.subtractionBody = {
      en: `${seed} Get tested with bloodwork before doing anything.`,
      th: `${seed} Get tested with bloodwork before doing anything.`
    };

    const validation = validate(response, healthScore);

    assert.ok(
      validation.errors.some((error) => error.includes("forbidden term"))
    );
  });

  it("rejects singular/plural anomalies in localized copy", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);

    response.pageCopy.findingsHeadline = {
      en: "1 things a generic vitamin quiz would have missed.",
      th: "1 things a generic vitamin quiz would have missed."
    };

    const validation = validate(response, healthScore);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("singular grammar for 1 thing")
      )
    );
  });

  it("rejects wrong card counts", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seeds = healthScore.pageContent!.copySeeds;

    response.pageCopy.methodCards = seeds.methodCards.slice(0, 2).map((card) => ({
      body: bilingual(card.body),
      title: bilingual(card.title)
    }));

    const validation = validate(response, healthScore);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("methodCards must contain exactly 3 items")
      )
    );
  });

  it("rejects schema drift inside cards", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seeds = healthScore.pageContent!.copySeeds;

    response.pageCopy.gapTrio = seeds.gapTrio.map((card, index) => ({
      body: bilingual(card.body),
      headline: bilingual(card.headline),
      ...(index === 2 ? { lockedScore: 47 } : {})
    }));

    const validation = validate(response, healthScore);

    assert.ok(
      validation.errors.some((error) =>
        error.includes("gapTrio[2] has unexpected keys")
      )
    );
  });

  it("strips harmless deterministic seed metadata echoed inside cards", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seeds = healthScore.pageContent!.copySeeds;

    response.pageCopy.gapTrio = seeds.gapTrio.map((card, index) => ({
      body: bilingual(card.body),
      headline: bilingual(card.headline),
      tag: `GAP ${index + 1}`,
      value: `${index + 1}`
    }));
    response.pageCopy.findings = seeds.findings.map((card, index) => ({
      body: bilingual(card.body),
      headline: bilingual(card.headline),
      code: `FINDING_${index + 1}`,
      icon: "*"
    }));

    const validation = validate(response, healthScore);

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.response);
    assert.equal(
      (validation.response.pageCopy.gapTrio?.[0]?.headline as { en: string }).en,
      seeds.gapTrio[0]?.headline
    );
    assert.equal(
      "tag" in (validation.response.pageCopy.gapTrio?.[0] ?? {}),
      false
    );
  });

  it("rejects score numbers injected into unrelated rewritable fields", () => {
    const healthScore = scoreFor("en");
    assert.equal(healthScore.score, 47);

    const response = mutableResponse(healthScore);
    const seedHero = healthScore.pageContent!.copySeeds.heroBody;
    // heroBody seed has no "47"; global seed still has it via bandLine/score.
    assert.equal(/\b47\b/.test(seedHero), false);

    const injected =
      "Your 47 score shows up even though this hero sentence never had that number.";
    response.pageCopy.heroBody = bilingual(injected);

    const validation = validate(response, healthScore, "en");

    assert.ok(
      validation.errors.some(
        (error) =>
          error.includes("pageCopy.heroBody") &&
          error.includes("integer literal 47") &&
          error.includes("that field's engine seed")
      ),
      `expected per-field numeric rejection, got: ${validation.errors.join(" | ")}`
    );
  });

  it("rejects polished copy outside the 0.5x–1.5x seed length band", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seedHero = healthScore.pageContent!.copySeeds.heroBody;
    assert.ok(seedHero.length > 100);

    const bloated = `${seedHero} ${"x".repeat(2100)}`;
    assert.ok(bloated.length > seedHero.length * 1.5);
    response.pageCopy.heroBody = bilingual(bloated);

    const validation = validate(response, healthScore, "en");

    assert.ok(
      validation.errors.some(
        (error) =>
          error.includes("pageCopy.heroBody") &&
          error.includes("outside 0.5x–1.5x")
      ),
      `expected length sanity rejection, got: ${validation.errors.join(" | ")}`
    );
  });

  it("allows dropping a seed number but not moving it into another field", () => {
    const healthScore = scoreFor("en");
    const response = mutableResponse(healthScore);
    const seeds = healthScore.pageContent!.copySeeds;

    // Dropping the score from bandLine is allowed; introducing it into heroBody is not.
    response.pageCopy.bandLine = bilingual(
      seeds.bandLine.replace(/\b47\b/g, "score").replace(/\s+/g, " ").trim()
    );

    const validationOk = validate(response, healthScore, "en");
    assert.deepEqual(validationOk.errors, []);

    response.pageCopy.heroBody = bilingual(`${seeds.heroBody} Score 47.`);
    const validationBad = validate(response, healthScore, "en");
    assert.ok(
      validationBad.errors.some((error) =>
        error.includes("pageCopy.heroBody introduced integer literal 47")
      )
    );
  });
});
