import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const formulationResults = readFileSync(
  new URL("../components/formulation-results.tsx", import.meta.url),
  "utf8"
);
const assessmentFlow = readFileSync(
  new URL("../components/assessment-flow.tsx", import.meta.url),
  "utf8"
);
const bpmTracker = readFileSync(
  new URL("../components/bpm-tracker.tsx", import.meta.url),
  "utf8"
);
const titleBar = readFileSync(
  new URL("../components/title-bar.tsx", import.meta.url),
  "utf8"
);
const formulationTypes = readFileSync(
  new URL("../lib/formulation-types.ts", import.meta.url),
  "utf8"
);
const nutritionPaths = readFileSync(
  new URL("../lib/nutrition-paths.ts", import.meta.url),
  "utf8"
);
const siteUrl = readFileSync(
  new URL("../lib/site-url.ts", import.meta.url),
  "utf8"
);
const stripePayments = readFileSync(
  new URL("../lib/stripe-payments.ts", import.meta.url),
  "utf8"
);
const nutritionAdvisor = readFileSync(
  new URL("../lib/nutrition-plan-advisor-analysis.ts", import.meta.url),
  "utf8"
);
const assessmentStore = readFileSync(
  new URL("../lib/assessment-store.ts", import.meta.url),
  "utf8"
);
const taskWorkItems = readFileSync(
  new URL("../lib/task-work-items.ts", import.meta.url),
  "utf8"
);
const taskExecution = readFileSync(
  new URL("../lib/task-execution.ts", import.meta.url),
  "utf8"
);
const revealPage = readFileSync(
  new URL("../app/[locale]/nutrition/reveal/page.tsx", import.meta.url),
  "utf8"
);
const legacyRedirectPage = readFileSync(
  new URL(`../app/[locale]/nutrition/ref${"ine"}/page.tsx`, import.meta.url),
  "utf8"
);
const assessmentResultsRedirect = readFileSync(
  new URL("../app/[locale]/assessment/results/page.tsx", import.meta.url),
  "utf8"
);

const revealSlots = [
  "heroTitle",
  "heroHeadline",
  "heroSub",
  "breadcrumbsTitle",
  "breadcrumbsBody",
  "distillNarrative",
  "distillFoot",
  "formulaTitle",
  "formulaLead",
  "productsTitle",
  "productsLead",
  "safetyHeadline",
  "safetyBody",
  "closingTitle",
  "closingBody"
];

describe("plan reveal V3 migration", () => {
  it("uses the canonical reveal URL and keeps the old paid URL as redirect-only", () => {
    const stalePaidRoute = new RegExp(`nutrition\\\\/ref${"ine"}|nutrition/ref${"ine"}`);

    assert.match(nutritionPaths, /nutritionRevealPath/);
    assert.match(nutritionPaths, /\/nutrition\/reveal/);
    assert.doesNotMatch(nutritionPaths, new RegExp(`nutritionRef${"ine"}Path`));
    assert.match(revealPage, /NutritionRevealPage/);
    assert.match(legacyRedirectPage, /redirect\(nutritionRevealPath\(locale, planId\)\)/);
    assert.doesNotMatch(legacyRedirectPage, /getStoredFormulationResult/);
    assert.match(assessmentFlow, /nutritionRevealPath/);
    assert.match(siteUrl, /nutritionRevealPath/);
    assert.match(stripePayments, /nutritionRevealPath/);
    assert.match(assessmentResultsRedirect, /nutritionRevealPath/);
    assert.match(titleBar, /nutrition\/reveal/);
    assert.match(bpmTracker, /nutrition\\\/reveal/);
    assert.doesNotMatch(assessmentFlow, stalePaidRoute);
    assert.doesNotMatch(siteUrl, stalePaidRoute);
    assert.doesNotMatch(stripePayments, stalePaidRoute);
    assert.doesNotMatch(bpmTracker, stalePaidRoute);
    assert.doesNotMatch(titleBar, stalePaidRoute);
  });

  it("defines every AI-personalized reveal page slot with EN/TH copy", () => {
    for (const slot of revealSlots) {
      assert.match(formulationTypes, new RegExp(`"${slot}"`), slot);
    }

    assert.match(formulationTypes, /revealPageCopy\?: RevealPageCopy/);
    assert.match(formulationTypes, /Readonly<Record<"en" \| "th", string>>/);
    assert.match(nutritionAdvisor, /revealPageCopy is copy-only/);
    assert.match(nutritionAdvisor, /Do not include scores, counts, doses, product names/);
  });

  it("keeps first name optional and exposes it to the paid plan result", () => {
    assert.match(formulationTypes, /firstName\?: string \| null/);
    assert.match(assessmentStore, /assessments\.first_name/);
    assert.match(assessmentStore, /firstNameFromAssessmentAnswers\(row\.answers\)/);
    assert.match(formulationResults, /result\.firstName/);
    assert.match(formulationResults, /copy\.heroFor/);
  });

  it("passes display context and HealthScore seeds into the report worker only as context", () => {
    assert.match(taskWorkItems, /firstName\?: string \| null/);
    assert.match(taskWorkItems, /healthScore\?: HealthScoreResult \| null/);
    assert.match(taskExecution, /firstName: workItem\.firstName/);
    assert.match(taskExecution, /healthScore: workItem\.healthScore/);
    assert.match(nutritionAdvisor, /firstName: input\.firstName \?\? null/);
    assert.match(nutritionAdvisor, /copySeeds: input\.healthScore\.pageContent\?\.copySeeds/);
  });

  it("renders the paid reveal page from locked data with fallback copy", () => {
    assert.match(formulationResults, /<LandingReveal \/>/);
    assert.match(formulationResults, /data-reveal/);
    assert.match(formulationResults, /CountUpNumber/);
    assert.match(formulationResults, /RevealDistillationCard/);
    assert.match(formulationResults, /revealSlotCopy\(result,\s*"heroTitle",\s*locale,\s*copy\.heroTitle\)/);
    assert.match(formulationResults, /revealSlotCopy\(result,\s*"formulaTitle",\s*locale,\s*copy\.formulaTitle\)/);
    assert.match(formulationResults, /localizedPlanText\(result\.nutritionReport\?\.revealPageCopy/);
  });

  it("keeps real product catalogue behavior and stack switching in the reveal design", () => {
    assert.match(formulationResults, /product\.imageUrl/);
    assert.match(formulationResults, /trackMarketplaceClick\(planId, product\)/);
    assert.match(formulationResults, /selectedProductStackPreference/);
    assert.match(formulationResults, /onProductStackPreferenceChange\(option\.id\)/);
    assert.match(formulationResults, /productRecommendations/);
  });

  it("keeps old reports without revealPageCopy readable", () => {
    assert.match(nutritionAdvisor, /record\.revealPageCopy === undefined\s*\?\s*null/);
    assert.match(formulationResults, /fallback: string/);
  });
});
