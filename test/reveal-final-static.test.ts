import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const reveal = readFileSync(
  new URL("../components/reveal-final-results.tsx", import.meta.url),
  "utf8",
);
const wrapper = readFileSync(
  new URL("../components/formulation-results.tsx", import.meta.url),
  "utf8",
);
const copy = readFileSync(
  new URL("../components/formulation-reveal-copy.ts", import.meta.url),
  "utf8",
);
const i18nSource = readFileSync(
  new URL("../content/i18n/source/en.json", import.meta.url),
  "utf8",
);
const i18nThai = readFileSync(
  new URL("../content/i18n/locales/th.json", import.meta.url),
  "utf8",
);
const i18nChinese = readFileSync(
  new URL("../content/i18n/locales/zh-CN.json", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../app/customer.css", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../app/[locale]/layout.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/[locale]/nutrition/reveal/page.tsx", import.meta.url),
  "utf8",
);
const formulationAnalysis = readFileSync(
  new URL("../lib/formulation-analysis.ts", import.meta.url),
  "utf8",
);
const formulationTypes = readFileSync(
  new URL("../lib/formulation-types.ts", import.meta.url),
  "utf8",
);
const khunDream = new URL(
  "../public/reveal/khun_dream.webp",
  import.meta.url,
);

function assertOrder(source: string, labels: readonly string[]) {
  let cursor = -1;

  for (const label of labels) {
    const index = source.indexOf(label);

    assert.ok(index > cursor, `${label} should appear after prior section`);
    cursor = index;
  }
}

describe("final reveal UX", () => {
  it("explains Foundation, Add-on, and Targeted in one line each", () => {
    assert.match(i18nSource, /"Take these every day\."/);
    assert.match(i18nSource, /"Good to add if you can afford them\."/);
    assert.match(i18nSource, /"Chosen for your situation right now\."/);
    assert.match(i18nThai, /กินเหล่านี้ทุกวัน/);
    assert.match(i18nChinese, /请每天服用这些。/);
  });

  it("shows a unit price on each recommended product card next to Remove", () => {
    assert.match(reveal, /formatCurrencyAmount/);
    assert.match(reveal, /data-testid="reveal-product-price"/);
    assert.match(reveal, /product-remove-btn/);
    assert.match(
      reveal,
      /product\.price\?\.amount \?\?[\s\S]*product\.retailer\?\.unitPriceAmount/,
    );
  });

  it("routes the existing formulation wrapper into the final reveal surface", () => {
    assert.match(wrapper, /RevealFinalResultsPage/);
    assert.match(wrapper, /productCoveragePending=\{productCoveragePending\}/);
    assert.match(wrapper, /selectedProductStackPreference=/);
    assert.match(wrapper, /onProductStackPollingStart=\{startProductStackPolling\}/);
    assert.match(reveal, /productCoveragePending=\{productCoveragePending\}[\s\S]*productOptions=\{productOptions\}/);
    assert.match(reveal, /products\.length < 1 &&[\s\S]*productCoveragePending[\s\S]*productStackLoading/);
  });

  it("uses the standard site header for the successful paid reveal route", () => {
    const resultsIndex = route.indexOf("<FormulationResults");
    assert.ok(resultsIndex > -1, "paid reveal should render FormulationResults");
    const successReturnStart = route.lastIndexOf("return (", resultsIndex);
    const successReturnEnd = route.indexOf("</main>", resultsIndex);
    const successReturn = route.slice(successReturnStart, successReturnEnd);

    assert.match(successReturn, /<FormulationResults/);
    assert.match(successReturn, /<TitleBar/);
    assert.match(successReturn, /<TitleBar[\s\S]*?<FormulationResults/);
    assert.match(successReturn, /<SiteFooter/);
    assert.doesNotMatch(reveal, /function RevealBrandBar/);
    assert.doesNotMatch(reveal, /mn-reveal-brandbar/);
    assert.doesNotMatch(reveal, /mn-reveal-brand-word/);
    assert.doesNotMatch(reveal, /mn-reveal-brand-tagline/);
    assert.match(reveal, /min-h-\[calc\(100vh-70px\)\]/);
  });

  it("routes missing and unpaid plans before entering paid reveal polling", () => {
    const gateStart = route.indexOf(
      "const assessment = await getStoredAssessmentPrefill(planId);",
    );
    const refreshStart = route.indexOf(
      "void ensureFreshProductRecommendationsForReveal",
    );
    const gate = route.slice(gateStart, refreshStart);

    assert.ok(gateStart > -1, "reveal route should load the assessment gate");
    assert.ok(
      refreshStart > gateStart,
      "assessment gate should run before reveal product refresh work",
    );
    assert.match(route, /import \{ notFound, redirect \} from "next\/navigation"/);
    assert.match(route, /nutritionHealthScorePath/);
    assert.match(gate, /if \(!assessment\) \{[\s\S]*notFound\(\);[\s\S]*\}/);
    assert.match(
      gate,
      /if \(!assessment\.plan\) \{[\s\S]*redirect\(nutritionHealthScorePath\(locale, planId\)\);[\s\S]*\}/,
    );
  });

  it("keeps the final handoff section order", () => {
    assertOrder(reveal, [
      "id=\"assessment\"",
      "function RevealDistillationSection",
      "id=\"formula\"",
      "id=\"products\"",
      "function KhunDreamSection",
      "function RevealFoodSupportFinalSection",
      "id=\"panya-support\"",
      "function RevealSafetyFinalSection",
      "function RevealClosingFinalSection",
    ]);
    assert.doesNotMatch(reveal, /function RevealSafetyClosingSection/);
    assert.doesNotMatch(reveal, />5\.5</);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">01<\/span>/);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">02<\/span>/);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">03<\/span>/);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">04<\/span>/);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">05<\/span>/);
    assert.match(reveal, /<span className="mn-reveal-final-label-number">06<\/span>/);
  });

  it("keeps checkout as the current basket handoff contract", () => {
    assert.match(reveal, /\/basket\/checkout\?\$\{params\.toString\(\)\}/);
    assert.match(reveal, /plan: planId/);
    assert.match(reveal, /selected: selectedBasketIdList\.join\(","\)/);
    assert.match(reveal, /removed: removedBasketIdList\.join\(","\)/);
    assert.match(reveal, /params\.set\("retailer", selectedRetailerOrganisationId\)/);
    assert.doesNotMatch(reveal, /\/api\/orders/);
  });

  it("uses the scoped reveal CSS and no preview-only assets", () => {
    assert.match(css, /\.mn-reveal-final/);
    assert.match(css, /\.mn-reveal-final \.nutrient-toggle/);
    assert.match(css, /@media print/);
    assert.match(css, /\.mn-reveal-final \.pharmacist-portrait img/);
    assert.match(css, /object-position: 50% 12%/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-foodgap-card/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-assessment/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-distillation/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-products/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-products \.product-card/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-assessment-cell/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-distillation-number/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-nutrient-header/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-pharmacist/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-safety/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-closing/);
    assert.doesNotMatch(`${reveal}\n${css}`, /cdn\.tailwindcss\.com/);
    assert.doesNotMatch(`${reveal}\n${css}`, /data:image/);
    assert.doesNotMatch(reveal, /<img\b/);
  });

  it("applies the final reveal type system from the localized route shell", () => {
    assert.match(layout, /DM_Sans/);
    assert.match(layout, /Fraunces/);
    assert.match(layout, /style:\s*\["normal", "italic"\]/);
    assert.match(layout, /weight:\s*"variable"/);
    assert.match(layout, /axes:\s*\["opsz"\]/);
    assert.match(layout, /JetBrains_Mono/);
    assert.match(layout, /Noto_Sans_Thai/);
    assert.match(css, /\.mn-reveal-final\s*\{[\s\S]*font-family:\s*var\(--mn-font-body\)/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-font-body\s*\{[\s\S]*font-family:\s*var\(--mn-font-body\)/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-font-display\s*\{[\s\S]*font-family:\s*var\(--mn-font-display\)/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-font-mono\s*\{[\s\S]*font-family:\s*var\(--mn-font-mono\)/);
    assert.doesNotMatch(css, /\.mn-reveal-final \.mn-reveal-brandbar/);
    assert.doesNotMatch(css, /\.mn-reveal-final \.mn-reveal-brand-word/);
    assert.doesNotMatch(css, /\.mn-reveal-final \.mn-reveal-brand-tagline/);
    assert.match(reveal, /className="mn-reveal-final mn-reveal-font-body w-full"/);
    assert.match(reveal, /mn-reveal-font-display/);
    assert.match(reveal, /mn-reveal-font-mono/);
    assert.match(reveal, /mn-reveal-track-hero-title/);
    assert.match(reveal, /export function revealHeroFirstName/);
    assert.match(reveal, /data-testid="reveal-hero-name"/);
    assert.match(reveal, /result\.assessmentSummary\.firstName/);
    assert.match(reveal, /mn-reveal-track-hero-copy/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-track-hero-title\s*\{[\s\S]*letter-spacing:\s*-0\.03em/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-track-hero-copy\s*\{[\s\S]*letter-spacing:\s*-0\.015em/);
    assert.match(css, /\.mn-reveal-final-label\s*\{[\s\S]*letter-spacing:\s*0\.32em/);
    assert.doesNotMatch(reveal, /font-\[family:var\(--mn-font-/);
    assert.doesNotMatch(css, /\[class\*="font-\[family:var\(--mn-font-/);
    assert.doesNotMatch(css, /\.mn-reveal-final \[class\*="tracking-"\]\s*\{[\s\S]*letter-spacing:\s*0\s*!important/);
    assert.match(css, /\.mn-reveal-final-label\s*\{[\s\S]*font-family:\s*var\(--mn-font-mono\)/);
    assert.match(css, /\.mn-reveal-final-heading\s*\{[\s\S]*font-family:\s*var\(--mn-font-display\)/);
    assert.match(reveal, /renderRevealHeroHeadline/);
    assert.match(reveal, /mn-reveal-hero-headline/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-hero-headline em\s*\{[\s\S]*color:\s*var\(--mn-teal\)/);
    assert.match(css, /:lang\(th\) \.mn-reveal-final/);
    assert.match(css, /:lang\(zh-CN\) \.mn-reveal-final/);
  });

  it("renders the hero eyebrow with CSS-backed horizontal rules", () => {
    assert.match(reveal, /mn-reveal-hero-eyebrow justify-center/);
    assert.match(css, /\.mn-reveal-hero-eyebrow::before/);
    assert.match(css, /\.mn-reveal-hero-eyebrow::after/);
    assert.match(css, /\.mn-reveal-final-label--rule-start::before/);
    assert.doesNotMatch(reveal, /hero-rise hero-rise-d1[\s\S]*inline-block h-px w-7/);
  });

  it("uses a real Khun Dream public asset with localized alt copy", () => {
    assert.ok(existsSync(khunDream), "Khun Dream asset should exist");
    assert.ok(statSync(khunDream).size > 1000, "Khun Dream asset should not be empty");
    assert.match(reveal, /src="\/reveal\/khun_dream\.webp"/);
    assert.match(reveal, /alt=\{finalCopy\.khunAlt\}/);
    assert.match(reveal, /className="ink-section mn-reveal-pharmacist/);
    assert.match(reveal, /finalCopy\.khunName/);
    assert.match(reveal, /finalCopy\.khunRole/);
    assert.match(copy, /getNamespace<RevealCopy>\(locale, "customer\.revealFinalCopy"\)/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.khunAlt"[\s\S]*"defaultMessage": "Khun Dream/);
    assert.match(i18nThai, /"customer\.revealFinalCopy\.khunAlt": "คุณดรีม/);
    assert.match(i18nChinese, /"customer\.revealFinalCopy\.khunAlt": "Khun Dream，/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.khunRole"[\s\S]*"defaultMessage": "Licensed Pharmacist/);
    assert.match(i18nThai, /"customer\.revealFinalCopy\.khunRole": "เภสัชกร/);
    assert.match(i18nChinese, /"customer\.revealFinalCopy\.khunRole": "执业药师/);
  });

  it("uses compact food-gap cards and keeps safety separate from closing", () => {
    assert.match(reveal, /className="mn-reveal-food border-t/);
    assert.match(reveal, /className="mn-reveal-foodgap-card foodgap-card"/);
    assert.match(reveal, /mn-reveal-foodgap-card__header/);
    assert.match(reveal, /mn-reveal-foodgap-card__icon/);
    assert.match(reveal, /function RevealSafetyFinalSection/);
    assert.match(reveal, /function RevealClosingFinalSection/);
    assert.match(reveal, /className="ink-section mn-reveal-safety/);
    assert.match(reveal, /className="ink-section mn-reveal-closing/);
  });

  it("keeps Nong Mata as a top-level reveal section with existing LINE behavior", () => {
    assert.match(reveal, /id="panya-support"/);
    assert.match(reveal, /className="mn-reveal-panya border-t/);
    assert.match(reveal, /className="mn-reveal-panya-card/);
    assert.match(reveal, /className="mn-reveal-panya-connect/);
    assert.match(reveal, /src="\/v11\/brand-mark\.png"/);
    assert.match(reveal, /finalCopy\.panyaSection/);
    assert.match(reveal, /finalCopy\.panyaByline/);
    assert.match(reveal, /finalCopy\.panyaWisdomBody/);
    assert.match(reveal, /connect\?\.code/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.panyaByline"[\s\S]*"defaultMessage": "Your guide/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.panyaWisdomBody"/);
    assert.doesNotMatch(reveal, /panyaSection\}\s*<\/div>[\s\S]{0,120}mn-reveal-final-label-number/);
    assert.match(reveal, /source: "reveal_panya_support"/);
    assert.match(reveal, /\/api\/assessment\/\$\{encodeURIComponent\(planId\)\}\/line-connect/);
    assert.match(reveal, /\/api\/qr\?data=/);
    assert.doesNotMatch(reveal, /copyConnectCode/);
    assert.doesNotMatch(reveal, /navigator\.clipboard/);
    assert.doesNotMatch(reveal, /finalCopy\.panyaCopyCode/);
    assert.match(reveal, /void createConnectCode\(false, true\)/);
  });

  it("keeps final counts tied to visible formulation rows", () => {
    assert.match(reveal, /visibleFormulaIngredients\(ingredients\)/);
    assert.match(reveal, /visibleSupplementRecommendationCount\(result\)/);
    assert.doesNotMatch(reveal, /lockedSupplementCount/);
    assert.doesNotMatch(reveal, /nutrientsChosen/);
  });

  it("keeps the assessment grid compact and paper-backed", () => {
    assert.match(reveal, /mn-reveal-assessment-grid/);
    assert.match(reveal, /mn-reveal-assessment-cell/);
    assert.match(reveal, /mn-reveal-assessment-pill--caution/);
    assert.match(reveal, /mn-reveal-assessment-pill--profile/);
    assert.doesNotMatch(reveal, /min-h-44/);
    assert.doesNotMatch(
      reveal,
      /mn-reveal-assessment-cell[^`]*card\.tone === "caution"[^`]*bg-\[var\(--mn-reveal-caution-bg\)\]/,
    );
    assert.match(css, /\.mn-reveal-final \.mn-reveal-assessment-cell\s*\{[\s\S]*min-height:\s*0/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-assessment-cell\s*\{[\s\S]*background:\s*var\(--mn-paper\)/);
  });

  it("renders the final distillation as the handoff count pair", () => {
    assert.doesNotMatch(reveal, /RevealDistillationCard/);
    assert.match(reveal, /mn-reveal-distillation-pair/);
    assert.match(reveal, /mn-reveal-distillation-number--from/);
    assert.match(reveal, /mn-reveal-distillation-arrow/);
    assert.match(reveal, /mn-reveal-distillation-number--to/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-distillation-number\s*\{[\s\S]*font-family:\s*var\(--mn-font-display\)/);
  });

  it("keeps the formula expander out of the dose and coverage columns", () => {
    assert.match(reveal, /mn-reveal-nutrient-header/);
    assert.match(reveal, /nutrient-dose/);
    assert.match(reveal, /nutrient-coverage/);
    assert.match(reveal, /md:grid-cols-\[36px_minmax\(160px,1\.25fr\)_minmax\(260px,2\.2fr\)_minmax\(96px,auto\)_minmax\(72px,auto\)_36px\]/);
    assert.match(reveal, /<span aria-hidden=\{true\} className="expand-icon" \/>/);
    assert.doesNotMatch(reveal, /expand-icon absolute/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-nutrient-header \.expand-icon::before/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-nutrient-header \.expand-icon::after/);
    assert.match(css, /align-self:\s*center/);
    assert.match(css, /justify-self:\s*center/);
  });

  it("passes AI-generated supplement drawer copy through the formulation result", () => {
    assert.match(formulationTypes, /whyThisIsForYou\?: LocalizedText/);
    assert.match(formulationTypes, /whyThis\?: LocalizedText/);
    assert.match(formulationTypes, /forYou\?: LocalizedText/);
    assert.match(formulationTypes, /decision\?: LocalizedText/);
    assert.match(
      formulationAnalysis,
      /Every item must include id, category, supplement, dailyDose, effectivenessRank, status, rationale, whyThisIsForYou, and decision\./,
    );
    assert.match(formulationAnalysis, /const whyThisIsForYou = readLocalizedText\(\s*item,\s*"whyThisIsForYou"/);
    assert.match(formulationAnalysis, /const whyThis = readOptionalLocalizedText\(item, "whyThis"/);
    assert.match(formulationAnalysis, /const forYou = readOptionalLocalizedText\(item, "forYou"/);
    assert.match(formulationAnalysis, /const decision = readLocalizedText\(item, "decision"/);
    assert.match(reveal, /ingredient\.whyThisIsForYou/);
    assert.match(reveal, /ingredient\.whyThis/);
    assert.match(reveal, /ingredient\.forYou/);
    assert.match(reveal, /ingredient\.decision/);
    assert.match(reveal, /finalCopy\.nutrientWhy/);
    assert.doesNotMatch(reveal, /finalCopy\.nutrientForYou/);
    assert.match(reveal, /finalCopy\.nutrientDecision/);
    assert.match(reveal, /mn-reveal-nutrient-detail/);
    assert.doesNotMatch(reveal, /mn-reveal-nutrient-drawer-card/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.nutrientWhy"[\s\S]*"defaultMessage": "Why this is for you"/);
    assert.doesNotMatch(i18nSource, /"customer\.revealFinalCopy\.nutrientForYou"/);
    assert.match(i18nSource, /"customer\.revealFinalCopy\.nutrientDecision"[\s\S]*"defaultMessage": "Decision"/);
    assert.doesNotMatch(css, /\.mn-reveal-final \.mn-reveal-nutrient-drawer-card/);
  });

  it("keeps product coverage grammar from duplicating the total", () => {
    assert.doesNotMatch(reveal, /function countOfText/);
    assert.match(reveal, /coveredProductNeedText/);
    assert.match(i18nSource, /"customer\.revealCopy\.productsPartialTitleTemplate"[\s\S]*"defaultMessage": "\{productSelectedText\} bottles\. \{coveredProductNeedText\} of \{supplementSelectedTextLower\} nutrients\."/);
    assert.doesNotMatch(i18nSource, /"customer\.revealCopy\.productsPartialTitleTemplate"[\s\S]*"defaultMessage": "\{productSelectedText\}[^"]*\{coveredText\}/);
  });

  it("matches the handoff product shelf instead of the old dark reveal band", () => {
    assert.match(reveal, /className="mn-reveal-products border-t border-\[var\(--mn-line\)\] py-24"/);
    assert.doesNotMatch(reveal, /className="ink-section[^"]*"\s+id="products"/);
    assert.match(reveal, /mn-reveal-concierge-banner/);
    assert.match(reveal, /mn-reveal-selected-pharmacy/);
    assert.match(reveal, /mn-reveal-retailer-choices/);
    assert.match(reveal, /mn-reveal-pharmacy-card/);
    assert.match(reveal, /aria-pressed=\{selected\}/);
    assert.match(reveal, /max-w-\[860px\] flex-col justify-center gap-3\.5 sm:flex-row sm:flex-wrap/);
    assert.match(reveal, /sm:w-\[360px\]/);
    assert.match(reveal, /mb-3\.5 flex items-start justify-between gap-3/);
    assert.match(reveal, /flex shrink-0 flex-wrap justify-end gap-1\.5/);
    assert.match(reveal, /border-l-4 border-\[var\(--mn-teal-deep\)\]/);
    assert.match(reveal, /mn-reveal-font-display text-2xl font-medium italic leading-\[1\.2\]/);
    assert.match(reveal, /amountParts\.currencyText/);
    assert.doesNotMatch(reveal, /mn-reveal-pharmacy-check/);
    assert.match(
      reveal,
      /selected[\s\S]{0,80}\?[\s\S]{0,80}finalCopy\.selectedPharmacy[\s\S]{0,80}:[\s\S]{0,80}finalCopy\.alternatePharmacy/,
    );
    assert.doesNotMatch(reveal, /alternateRetailerOptions/);
    assert.doesNotMatch(reveal, /orderedRetailerOptions/);
    assert.doesNotMatch(reveal, /mn-reveal-pharmacy-card[\s\S]{0,260}hover:-translate-y/);
    assert.doesNotMatch(reveal, /grid max-w-\[960px\]/);
    assert.match(reveal, /className="products-grid grid grid-cols-1 gap-6/);
    assert.match(reveal, /className="summary-card mt-9 rounded-2xl border border-\[var\(--mn-line\)\] bg-\[var\(--mn-paper\)\] px-8 py-8/);
    assert.match(reveal, /className="checkout-card mt-7 grid gap-7 rounded-2xl border border-\[var\(--mn-line\)\] bg-\[var\(--mn-paper\)\] px-8 py-7/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-products\s*\{[\s\S]*var\(--mn-cream-deep\)/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-pharmacy-card\.mn-reveal-selected-pharmacy/);
  });
});
