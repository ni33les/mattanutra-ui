import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panelSource = read("components/nutrition-flow/healthscore-panel.tsx");
const routeSource = read("app/[locale]/nutrition/healthscore/page.tsx");

describe("HealthScore presentation boundaries", () => {
  it("takes scores, pillars and nutrient counts from deterministic assessment content", () => {
    assert.match(panelSource, /buildHealthScoreViewModel/);
    assert.match(panelSource, /page\?\.locked\.score\s*\?\?\s*result\.score/);
    assert.match(panelSource, /normalizedPillars\(result\)/);
    assert.match(panelSource, /page\?\.locked\.subtraction/);
    assert.doesNotMatch(panelSource, /ai\?\.(?:score|percentile|nutrientsChosen)/);
    assert.doesNotMatch(panelSource, /locked\.score\s*=/);
  });

  it("keeps personalized narratives in localized AI copy rather than demonstration profiles", () => {
    for (const field of ["heroTitle", "bandLine", "strengthNote", "highestLeverageBody", "subtractionBody"]) {
      assert.match(panelSource, new RegExp(`localize\\(ai\\?\\.${field}, locale\\)`));
    }
    assert.match(panelSource, /ai\?\.findings/);
    assert.doesNotMatch(panelSource, /MN_PROFILES|profilePicker|demoProfile/);
    assert.doesNotMatch(panelSource, /copySeeds\.(?:heroBody|bandLine|strengthNote|pillarHeadline)/);
  });

  it("preserves safe inline emphasis and the locale boundary for legacy content", () => {
    assert.match(panelSource, /renderInlineMarkup/);
    assert.match(panelSource, /textFitsLocale/);
    assert.match(panelSource, /localizedLegacyText/);
    assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(panelSource, /data:(?:image|video)\//);
  });

  it("keeps the site shell and direct-page readiness and metadata contracts", () => {
    assert.match(routeSource, /<TitleBar[\s\S]*?<HealthScorePaymentPanel[\s\S]*?<SiteFooter/);
    assert.match(routeSource, /PublicNutritionShell/);
    assert.match(routeSource, /HealthScoreCopyGate/);
    assert.match(routeSource, /readyForHealthScore/);
    assert.match(routeSource, /chosenNutrients === null/);
    assert.match(routeSource, /hasHealthScoreAiCopy/);
    assert.match(routeSource, /routeKey: "nutritionHealthScore"/);
    assert.match(routeSource, /indexable: !plan/);
    assert.match(routeSource, /nutritionQuizPath\(locale, planId\)/);
    assert.doesNotMatch(panelSource, /<TitleBar|<SiteFooter|<HealthScoreNav/);
  });

  it("routes the single offer through the established tracked checkout", () => {
    assert.match(panelSource, /trackMetaEvent\("SelectOffer"/);
    assert.match(panelSource, /paymentCheckoutPath\(locale,/);
    assert.match(panelSource, /plan: "precision"/);
    assert.match(panelSource, /sourceSurface: "healthscore"/);
    assert.doesNotMatch(panelSource, /plan: "pro"|sku: "right_amount_formula"/);
    assert.match(panelSource, /healthscore_viewed/);
  });

  it("uses an isolated v8 presentation with ordinary accessible report and video controls", () => {
    assert.match(panelSource, /mn-healthscore-v8/);
    assert.match(panelSource, /data-testid="healthscore"/);
    assert.match(panelSource, /<details/);
    assert.match(panelSource, /<summary/);
    assert.match(panelSource, /<video/);
    assert.match(panelSource, /preload="none"/);
    assert.doesNotMatch(panelSource, /autoPlay/);
    assert.match(read("components/nutrition-flow/healthscore-v8.css"), /\.mn-healthscore-v8/);
  });
});
