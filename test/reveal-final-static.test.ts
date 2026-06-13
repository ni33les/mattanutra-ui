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
  it("routes the existing formulation wrapper into the final reveal surface", () => {
    assert.match(wrapper, /RevealFinalResultsPage/);
    assert.match(wrapper, /productCoveragePending=\{productCoveragePending\}/);
    assert.match(wrapper, /selectedProductStackPreference=/);
    assert.match(wrapper, /onProductStackPollingStart=\{startProductStackPolling\}/);
  });

  it("uses reveal-native chrome for the successful paid reveal route", () => {
    const successReturnStart = route.indexOf(
      "  return (",
      route.indexOf("const initialResult"),
    );
    const successReturnEnd = route.indexOf("</main>", successReturnStart);
    const successReturn = route.slice(successReturnStart, successReturnEnd);

    assert.match(successReturn, /<FormulationResults/);
    assert.doesNotMatch(successReturn, /<TitleBar/);
    assert.match(successReturn, /<SiteFooter/);
    assert.match(reveal, /function RevealBrandBar/);
    assert.match(reveal, /className="mn-reveal-brandbar/);
    assert.match(reveal, /mn-reveal-brand-word/);
    assert.match(reveal, /mn-reveal-brand-tagline/);
    assert.match(reveal, /min-h-\[calc\(100vh-70px\)\]/);
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
    assert.match(css, /\.mn-reveal-final \.mn-reveal-brand-word\s*\{[\s\S]*letter-spacing:\s*-0\.01em/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-brand-tagline\s*\{[\s\S]*letter-spacing:\s*0\.22em/);
    assert.match(reveal, /className="mn-reveal-final mn-reveal-font-body w-full"/);
    assert.match(reveal, /mn-reveal-font-display/);
    assert.match(reveal, /mn-reveal-font-mono/);
    assert.match(reveal, /mn-reveal-track-hero-title/);
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
    assert.match(copy, /khunAlt: "Khun Dream/);
    assert.match(copy, /khunAlt: "คุณดรีม/);
    assert.match(copy, /khunAlt: "Khun Dream，/);
    assert.match(copy, /khunRole: "Licensed Pharmacist/);
    assert.match(copy, /khunRole: "เภสัชกร/);
    assert.match(copy, /khunRole: "执业药师/);
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

  it("keeps Panya as a top-level reveal section with existing LINE behavior", () => {
    assert.match(reveal, /id="panya-support"/);
    assert.match(reveal, /className="mn-reveal-panya border-t/);
    assert.match(reveal, /className="mn-reveal-panya-card/);
    assert.match(reveal, /className="mn-reveal-panya-connect/);
    assert.match(reveal, /<div className="mn-reveal-final-label">\s*\{finalCopy\.panyaSection\}/);
    assert.doesNotMatch(reveal, /panyaSection\}\s*<\/div>[\s\S]{0,120}mn-reveal-final-label-number/);
    assert.match(reveal, /source: "reveal_panya_support"/);
    assert.match(reveal, /\/api\/assessment\/\$\{encodeURIComponent\(planId\)\}\/line-connect/);
    assert.match(reveal, /\/api\/qr\?data=/);
    assert.match(reveal, /copyConnectCode/);
    assert.match(reveal, /void createConnectCode\(false, true\)/);
  });

  it("keeps final counts tied to visible formulation rows", () => {
    assert.match(reveal, /visibleFormulaIngredients\(ingredients\)/);
    assert.match(reveal, /visibleSupplementRecommendationCount\(result\)/);
    assert.doesNotMatch(reveal, /lockedSupplementCount/);
    assert.doesNotMatch(reveal, /nutrientsChosen/);
  });

  it("matches the handoff product shelf instead of the old dark reveal band", () => {
    assert.match(reveal, /className="mn-reveal-products border-t border-\[var\(--mn-line\)\] py-24"/);
    assert.doesNotMatch(reveal, /className="ink-section[^"]*"\s+id="products"/);
    assert.match(reveal, /mn-reveal-concierge-banner/);
    assert.match(reveal, /mn-reveal-selected-pharmacy/);
    assert.match(reveal, /mn-reveal-retailer-choices/);
    assert.match(reveal, /mn-reveal-pharmacy-card/);
    assert.match(reveal, /className="products-grid grid grid-cols-1 gap-5/);
    assert.match(reveal, /className="summary-card mt-8 rounded-2xl border border-\[var\(--mn-line\)\] bg-\[var\(--mn-paper\)\] px-8 py-7/);
    assert.match(reveal, /className="checkout-card mt-6 grid gap-6 rounded-2xl border border-\[var\(--mn-line\)\] bg-\[var\(--mn-paper\)\] px-8 py-6/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-products\s*\{[\s\S]*var\(--mn-cream-deep\)/);
    assert.match(css, /\.mn-reveal-final \.mn-reveal-selected-pharmacy/);
  });
});
