import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel.tsx", import.meta.url),
  "utf8"
);
const copySource = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel-copy.ts", import.meta.url),
  "utf8"
);
const routeSource = readFileSync(
  new URL("../app/[locale]/nutrition/healthscore/page.tsx", import.meta.url),
  "utf8"
);
const layoutSource = readFileSync(
  new URL("../app/[locale]/layout.tsx", import.meta.url),
  "utf8"
);
const engineSource = readFileSync(
  new URL("../lib/health-score/v4.ts", import.meta.url),
  "utf8"
);
const cssSource = readFileSync(
  new URL("../app/customer.css", import.meta.url),
  "utf8"
);

function assertOrdered(source: string, tokens: string[]) {
  let previous = -1;

  for (const token of tokens) {
    const next = source.indexOf(token);

    assert.ok(next > previous, `Expected ${token} after previous section`);
    previous = next;
  }
}

describe("HealthScore panel static guardrails", () => {
  it("renders locked score, pillar, and HealthScore subtraction preview values from deterministic content", () => {
    assert.match(panelSource, /buildHealthScoreViewModel/);
    assert.match(panelSource, /page\?\.locked\.score\s*\?\?\s*result\.score/);
    assert.match(panelSource, /normalizedPillars\(result\)/);
    assert.match(panelSource, /page\?\.locked\.subtraction/);
    assert.match(panelSource, /subtractionSeed\?\.labelChosen/);
    assert.match(panelSource, /subtraction\.chosen/);
  });

  it("keeps V3 pricing labels and Thai static fallbacks in the panel", () => {
    assert.match(copySource, /Right Amount Formula/);
    assert.match(copySource, /Living Protocol/);
    assert.match(copySource, /คะแนนสุขภาพของคุณคือ/);
    assert.match(copySource, /สูตรของคุณถูกสร้างอย่างไร/);
  });

  it("renders the successful localized route as a direct v7 HealthScore page", () => {
    assert.match(routeSource, /HealthScorePaymentPanel/);
    assert.doesNotMatch(routeSource, /AssessmentFlow/);
    assert.match(routeSource, /TitleBar/);
    assert.match(routeSource, /SiteFooter/);
    assert.match(
      routeSource,
      /<TitleBar[\s\S]*?<HealthScorePaymentPanel[\s\S]*?<SiteFooter/
    );
    assert.match(routeSource, /nutritionQuizPath\(locale\)/);
  });

  it("loads the exact HealthScore reference font families and weights", () => {
    assert.match(layoutSource, /Fraunces\(\{[\s\S]*style: \["normal", "italic"\]/);
    assert.match(layoutSource, /Fraunces\(\{[\s\S]*weight: "variable"/);
    assert.match(layoutSource, /Fraunces\(\{[\s\S]*axes: \["opsz"\]/);
    assert.match(layoutSource, /DM_Sans\(\{[\s\S]*weight: "variable"/);
    assert.match(layoutSource, /DM_Sans\(\{[\s\S]*axes: \["opsz"\]/);
    assert.match(layoutSource, /JetBrains_Mono\(\{[\s\S]*weight: \["400", "500", "600"\]/);
  });

  it("keeps the v7 section order and extracted image asset", () => {
    assertOrdered(panelSource, [
      "<HealthScoreHero",
      "<GapCards",
      "<PillarBars",
      "<FindingsSection",
      "<SubtractionBeat",
      "<MethodCards",
      "<TrustCard",
      "<PricingSection"
    ]);
    assert.match(panelSource, /mn-healthscore-v7/);
    assert.doesNotMatch(panelSource, /<HealthScoreNav/);
    assert.match(panelSource, /className="priceHero"/);
    assert.match(panelSource, /className="boxFigure"/);
    assert.match(panelSource, /src="\/healthscore\/box-v7\.jpg"/);
    assert.match(panelSource, /<PromiseStrip/);
    assert.match(panelSource, /<DecisionFrame/);
    assert.ok(
      existsSync(new URL("../public/healthscore/box-v7.jpg", import.meta.url)),
      "expected extracted v7 box image"
    );
  });

  it("uses scoped v7 CSS without base64 image blobs or hidden reduced-motion content", () => {
    assert.match(cssSource, /\.mn-healthscore-v7/);
    assert.match(cssSource, /\.priceHero/);
    assert.match(cssSource, /\.mn-healthscore-v7 \.reveal\s*\{[\s\S]*?opacity: 1;/);
    assert.match(cssSource, /\.mn-healthscore-v7\.is-enhanced \.reveal/);
    assert.match(cssSource, /prefers-reduced-motion: reduce/);
    assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML/);
    assert.match(panelSource, /renderInlineMarkup/);
    assert.doesNotMatch(panelSource, /data:image\/jpeg;base64/);
    assert.doesNotMatch(cssSource.match(/HealthScore v7 reference rebuild[\s\S]*?@keyframes/)?.[0] ?? "", /data:image\//);
  });

  it("keeps v7 polish-sensitive CSS decisions scoped to HealthScore", () => {
    assert.match(cssSource, /--hs-ink: #0a2540/);
    assert.match(cssSource, /--hs-paper: #fefcf7/);
    assert.match(cssSource, /--hs-cream: #faf6ec/);
    assert.match(cssSource, /\.mn-healthscore-v7 section\.wrap\s*\{[\s\S]*?padding:/);
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.scorecard::before\s*\{[\s\S]*?height: 4px;[\s\S]*?linear-gradient\(90deg, var\(--hs-teal-deep\), var\(--hs-teal-light\), var\(--hs-gold-soft\)\)/
    );
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.band-pill\s*\{[\s\S]*?background: var\(--hs-gold-tint\);[\s\S]*?color: #8a6d23;/
    );
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.subtract\s*\{[\s\S]*?background: linear-gradient\(160deg, var\(--hs-paper\), var\(--hs-cream-deep\)\)/
    );
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.boxFigure img\s*\{[\s\S]*?filter: none;/
    );
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.tc-ic svg,\s*\.mn-healthscore-v7 \.promise svg\s*\{[\s\S]*?stroke-width: 1\.6;/
    );
    assert.match(cssSource, /grid-template-areas:\s*"name val"\s*"track track"/);
  });

  it("does not let AI copy override locked numeric HealthScore fields", () => {
    assert.doesNotMatch(panelSource, /ai\?\.heroTitle/);
    assert.doesNotMatch(panelSource, /ai\?\.bandLine/);
    assert.doesNotMatch(panelSource, /ai\?\.subtractionBody/);
    assert.doesNotMatch(panelSource, /ai\?\.methodHeadline/);
    assert.doesNotMatch(panelSource, /ai\?\.findingsHeadline/);
    assert.doesNotMatch(panelSource, /ai\?\.pillarHeadline/);
    assert.match(panelSource, /ai\?\.heroBody/);
  });

  it("does not label HealthScore subtraction as a final selected formula count", () => {
    assert.match(copySource, /Shortlisted for your score/);
    assert.doesNotMatch(copySource, /right for your score/);
    assert.doesNotMatch(copySource, /เหมาะกับคะแนนของคุณ/);
    assert.doesNotMatch(copySource, /适合您的分数/);
    assert.doesNotMatch(panelSource, /right for your score/i);
    assert.doesNotMatch(panelSource, /final selected/i);
  });

  it("renders personalized emphasis through deterministic safe markup and scoped CSS", () => {
    assert.match(engineSource, /const highlightedGoals = answers\.goals\.map/);
    assert.match(engineSource, /`<em>\$\{localizedGoalPhrase\(goal, locale\)\}<\/em>`/);
    assert.match(panelSource, /renderInlineMarkup\(headline\)/);
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 \.goalmirror em[\s\S]*?color: var\(--hs-teal-deep\)/
    );
    assert.match(
      cssSource,
      /\.mn-healthscore-v7 b,\s*\.mn-healthscore-v7 strong[\s\S]*?font-weight: 700;/
    );
  });

  it("guards legacy localized copy from leaking into the wrong locale", () => {
    assert.match(panelSource, /textFitsLocale/);
    assert.match(panelSource, /localizedLegacyText/);
  });
});
