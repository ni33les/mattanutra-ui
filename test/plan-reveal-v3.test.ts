import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const formulationResults = readFileSync(
  new URL("../components/formulation-results.tsx", import.meta.url),
  "utf8"
);
const formulationResultsHelpers = readFileSync(
  new URL("../components/formulation-results-helpers.tsx", import.meta.url),
  "utf8"
);
const formulationRevealCopy = readFileSync(
  new URL("../components/formulation-reveal-copy.ts", import.meta.url),
  "utf8"
);
const formulationSupportHelpers = readFileSync(
  new URL("../components/formulation-support-helpers.ts", import.meta.url),
  "utf8"
);
const productClickTracking = readFileSync(
  new URL("../components/product-click-tracking.ts", import.meta.url),
  "utf8"
);
const formulationRevealSources = [
  formulationResults,
  formulationResultsHelpers,
  formulationRevealCopy,
  formulationSupportHelpers
].join("\n");
const productRecommendationSources = [
  formulationResults,
  productClickTracking
].join("\n");
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
const localeLayout = readFileSync(
  new URL("../app/[locale]/layout.tsx", import.meta.url),
  "utf8"
);
const customerCss = readFileSync(
  new URL("../app/customer.css", import.meta.url),
  "utf8"
);
const globalsCss = readFileSync(
  new URL("../app/globals.css", import.meta.url),
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
    assert.match(revealPage, /redirect\(nutritionQuizPath\(locale\)\)/);
    assert.match(legacyRedirectPage, /redirect\(nutritionRevealPath\(locale, planId\)\)/);
    assert.match(legacyRedirectPage, /redirect\(nutritionQuizPath\(locale\)\)/);
    assert.doesNotMatch(legacyRedirectPage, /getStoredFormulationResult/);
    assert.match(assessmentFlow, /nutritionRevealPath/);
    assert.match(siteUrl, /nutritionRevealPath/);
    assert.match(stripePayments, /nutritionRevealPath/);
    assert.match(assessmentResultsRedirect, /nutritionRevealPath/);
    assert.match(assessmentResultsRedirect, /redirect\(nutritionQuizPath\(locale\)\)/);
    assert.match(titleBar, /nutrition\/reveal/);
    assert.match(bpmTracker, /nutrition\\\/reveal/);
    assert.doesNotMatch(assessmentFlow, stalePaidRoute);
    assert.doesNotMatch(siteUrl, stalePaidRoute);
    assert.doesNotMatch(stripePayments, stalePaidRoute);
    assert.doesNotMatch(bpmTracker, stalePaidRoute);
    assert.doesNotMatch(titleBar, stalePaidRoute);
  });

  it("defines every AI-personalized reveal page slot with locale-scalable copy", () => {
    for (const slot of revealSlots) {
      assert.match(formulationTypes, new RegExp(`"${slot}"`), slot);
    }

    assert.match(formulationTypes, /revealPageCopy\?: RevealPageCopy/);
    assert.match(formulationTypes, /LocalizedText = string \| Partial<Record<LocaleCode, string>>/);
    assert.match(formulationTypes, /RevealPageCopySlot,[\s\S]*LocalizedText/);
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
    assert.match(formulationRevealCopy, /Your Right Amount Has Arrived/);
    assert.match(formulationRevealCopy, /A formula built around your body, your goals/);
    assert.match(formulationRevealCopy, /Everything you told us, folded into one plan/);
    assert.match(formulationRevealCopy, /We evaluated \{supplementTotalText\} ingredients/);
    assert.match(formulationRevealCopy, /\{supplementSelectedText\} nutrients\. Exactly enough\./);
    assert.match(formulationRevealCopy, /\{productSelectedText\} bottles\. All \{supplementSelectedTextLower\} nutrients\./);
    assert.match(formulationRevealCopy, /\{productSelectedText\} bottles\. \{coveredText\} of \{supplementSelectedTextLower\} nutrients\./);
    assert.doesNotMatch(formulationResults, /copy\.heroMetaPlan/);
    assert.doesNotMatch(formulationResults, /copy\.heroMetaGenerated/);
    assert.match(formulationRevealCopy, /localizedPlanText\(revealPageCopy\[slot\]/);
  });

  it("gates stale reveal AI copy behind the current template version", () => {
    assert.match(formulationTypes, /revealPageCopyVersion = "reveal:v3-template"/);
    assert.match(formulationRevealCopy, /revealPageCopy\?\.version !== revealPageCopyVersion/);
    assert.match(nutritionAdvisor, /must set version to \$\{revealPageCopyVersion\}/);
  });

  it("keeps real product catalogue behavior and stack switching in the reveal design", () => {
    assert.match(formulationResults, /product\.imageUrl/);
    assert.match(productRecommendationSources, /trackMarketplaceClick\(planId, product\)/);
    assert.match(revealPage, /stack\?: string/);
    assert.match(revealPage, /initialStackPreference/);
    assert.match(formulationRevealSources, /planRevealStackHref/);
    assert.match(formulationResults, /replaceRevealStackUrl\(locale, planId, preference\)/);
    assert.doesNotMatch(formulationResults, /href=\{planRevealStackHref/);
    assert.match(formulationResults, /selectedProductStackPreference/);
    assert.match(formulationResults, /useState<ProductStackPreference \| null>\(\(\) => initialStackPreference\)/);
    assert.match(formulationResults, /onProductStackPreferenceChange\(preference\)/);
    assert.match(formulationResults, /onProductStackPollingStart\(preference\)/);
    assert.match(formulationResults, /productStackLoading/);
    assert.match(formulationResults, /copy\.productsPendingCardTitle/);
    assert.match(productRecommendationSources, /\/product-recommendations/);
    assert.match(formulationResults, /onProductStackRefresh/);
    assert.match(productRecommendationSources, /productRecommendations/);
  });

  it("renders managed food support after products without changing product coverage", () => {
    assert.match(formulationTypes, /foodGapSupport\?: FoodGapSupport/);
    assert.match(assessmentStore, /foodGapSupport: storedFoodGapSupport/);
    assert.match(formulationResults, /<RevealProductsSection/);
    assert.match(formulationResults, /<RevealFoodSupportSection/);
    assert.match(formulationRevealSources, /Food support, after the products/);
    assert.match(formulationResults, /selectedNeedCoverage/);
    assert.match(formulationResults, /item\.imagePath/);
    assert.match(formulationRevealSources, /foodSupportFormulaGapsForItem/);
    assert.match(formulationSupportHelpers, /curcumin/);
    assert.match(formulationSupportHelpers, /green_tea", "holy_basil", "moringa_leaves", "turmeric", "papaya"/);
    assert.match(formulationRevealSources, /safeFoodSupportCopy/);
    assert.match(formulationResults, /copy\.foodSupportFormulaGapLabel/);
    assert.doesNotMatch(formulationResults, /foodSupportProductCoverage/);
    assert.match(formulationRevealSources, /Foods do not change the product coverage score/);
    assert.match(formulationResults, /return null/);
  });

  it("uses V14 public fonts and colour tokens as the site-wide public system", () => {
    assert.match(localeLayout, /DM_Sans/);
    assert.doesNotMatch(localeLayout, /Manrope/);
    assert.match(globalsCss, /--foreground: #0a2540/);
    assert.match(globalsCss, /var\(--mn-font-body, "DM Sans"\)/);
    assert.match(customerCss, /--mn-ink: #0a2540/);
    assert.match(customerCss, /--mn-teal: #2d8f72/);
    assert.match(customerCss, /--mn-paper: #fefcf7/);
  });

  it("keeps old reports without revealPageCopy readable", () => {
    assert.match(nutritionAdvisor, /record\.revealPageCopy === undefined\s*\?\s*null/);
    assert.match(formulationRevealSources, /fallback: string/);
  });
});
