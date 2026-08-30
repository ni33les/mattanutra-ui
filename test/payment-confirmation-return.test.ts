import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const assessmentReturnPage = readFileSync(
  new URL(
    "../app/[locale]/nutrition/payment/return/page.tsx",
    import.meta.url
  ),
  "utf8"
);
const basketReturnPage = readFileSync(
  new URL("../app/[locale]/basket/return/page.tsx", import.meta.url),
  "utf8"
);

describe("assessment payment confirmation page", () => {
  it("uses the redesigned dynamic confirmation stack", () => {
    assert.match(assessmentReturnPage, /Your formula is being built/);
    assert.match(assessmentReturnPage, /What happens next/);
    assert.match(assessmentReturnPage, /Your plan is ready now/);
    assert.match(assessmentReturnPage, /Review your formula/);
    assert.match(assessmentReturnPage, /Start your Right Amount Formula/);
    assert.match(assessmentReturnPage, /See my formula/);
    assert.match(assessmentReturnPage, /Catalogue matching/);
    assert.match(assessmentReturnPage, /A copy was sent to your email/);
    assert.match(assessmentReturnPage, /data-bpm-event="payment_confirmation_cta_clicked"/);
  });

  it("implements the mockup as first-class Tailwind JSX inside the platform customer shell", () => {
    assert.match(assessmentReturnPage, /rounded-\[18px\] bg-white px-8 py-10/);
    assert.match(assessmentReturnPage, /bg-\[#1a3c34\] px-8 py-5/);
    assert.match(assessmentReturnPage, /mn-customer-shell/);
    assert.match(assessmentReturnPage, /<TitleBar/);
    assert.match(assessmentReturnPage, /variant="landing"/);
    assert.match(assessmentReturnPage, /className="w-full max-w-\[520px\] mn-font-body"/);
    assert.doesNotMatch(assessmentReturnPage, /from "next\/font\/google"/);
    assert.doesNotMatch(assessmentReturnPage, /Playfair_Display|Inter\(/);
    assert.doesNotMatch(assessmentReturnPage, /--mn-payment-font-/);
    assert.match(assessmentReturnPage, /font-serif text-\[30px\]/);
    assert.doesNotMatch(assessmentReturnPage, /<style>|<\/style>|class="hero-card"|class="steps-card"|class="cta-btn"/i);
    assert.doesNotMatch(assessmentReturnPage, /function PaymentConfirmationHeader|logoSubtitle|Free Assessment|Pricing/);
    assert.doesNotMatch(assessmentReturnPage, /SiteFooter|getDictionary/);
    assert.doesNotMatch(assessmentReturnPage, /font-\[family:var\(--mn-font-display\),serif\]/);
  });

  it("loads real payment and formula data for the receipt", () => {
    assert.match(assessmentReturnPage, /fulfillCheckoutSession/);
    assert.match(assessmentReturnPage, /getStoredAssessmentPrefill/);
    assert.match(assessmentReturnPage, /getStoredFormulationResult/);
    assert.match(assessmentReturnPage, /computeHealthScore/);
    assert.match(assessmentReturnPage, /visibleSupplementRecommendationCount/);
    assert.match(assessmentReturnPage, /marketingCoveragePercentFromNeedCoverage/);
    assert.match(assessmentReturnPage, /productRecommendations\?\.stackCoveragePercent/);
    assert.match(assessmentReturnPage, /AMOUNT_MICROS_PER_UNIT/);
    assert.match(assessmentReturnPage, /formatCurrencyAmount/);
    assert.doesNotMatch(
      assessmentReturnPage,
      /input\.formula[\s\S]*\? formulaSelectedCount[\s\S]*: healthSelectedCount/
    );
    assert.match(assessmentReturnPage, /input\.formula \? formulaSelectedCount : 0/);
    assert.match(assessmentReturnPage, /readyMessage/);
    assert.doesNotMatch(assessmentReturnPage, /formula\.recommendations\.length/);
  });

  it("does not present HealthScore subtraction counts as selected nutrients before formulation exists", () => {
    assert.doesNotMatch(assessmentReturnPage, /const healthSelectedCount/);
    assert.doesNotMatch(
      assessmentReturnPage,
      /displaySelectedCount[\s\S]*healthScore\?\.selectedIngredientCount/
    );
    assert.match(
      assessmentReturnPage,
      /displaySelectedCount > 0[\s\S]*labels\.states\.paid\.readyMessage[\s\S]*labels\.states\.paid\.message/
    );
  });

  it("keeps reservation, pending, expired, and error states explicit", () => {
    assert.match(assessmentReturnPage, /paid_reservation/);
    assert.match(assessmentReturnPage, /Payment processing/);
    assert.match(assessmentReturnPage, /Payment expired/);
    assert.match(assessmentReturnPage, /Payment needs attention/);
    assert.match(assessmentReturnPage, /Return to checkout/);
  });

  it("localizes the new confirmation copy", () => {
    assert.match(assessmentReturnPage, /ดูสูตรของฉัน/);
    assert.match(assessmentReturnPage, /ขั้นตอนถัดไป/);
    assert.match(assessmentReturnPage, /แผนของคุณพร้อมแล้ว/);
    assert.match(assessmentReturnPage, /查看我的配方/);
    assert.match(assessmentReturnPage, /接下来会发生什么/);
    assert.match(assessmentReturnPage, /你的计划已准备好/);
  });

  it("does not introduce standalone mockup assets or retired homepage language", () => {
    assert.doesNotMatch(assessmentReturnPage, /FontAwesome|font-awesome|cdnjs/i);
    assert.doesNotMatch(assessmentReturnPage, /design annotations?/i);
  });

  it("keeps product basket return as a redirect-only compatibility endpoint", () => {
    assert.match(basketReturnPage, /redirect\(result\.destination\)/);
    assert.match(basketReturnPage, /fulfillRetailCheckoutSession/);
    assert.doesNotMatch(basketReturnPage, /Your formula is being built/);
    assert.doesNotMatch(basketReturnPage, /Product payment status/);
    assert.doesNotMatch(basketReturnPage, /<TitleBar/);
    assert.doesNotMatch(basketReturnPage, /LivingProtocolLineCta/);
    assert.doesNotMatch(basketReturnPage, /payment_confirmation_cta_clicked/);
  });
});
