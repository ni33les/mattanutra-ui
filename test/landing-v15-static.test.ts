import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { content } from "../components/landing-page-copy.ts";
import { publicLocales } from "../lib/i18n.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const landingPage = source("../components/landing-page.tsx");
const landingCopy = source("../components/landing-page-copy.ts");
const customerCss = source("../app/customer.css");
const titleBar = source("../components/title-bar.tsx");
const footer = source("../components/site-footer.tsx");
const homepage = source("../app/[locale]/page.tsx");
const blogArticlePage = source("../app/[locale]/blog/[slug]/page.tsx");
const blog = source("../lib/blog.ts");
const seedScript = source("../scripts/seed-landing-v15-content.ts");

describe("landing page v15 rebuild", () => {
  it("renders the v15 homepage sections without the old pricing section", () => {
    for (const marker of [
      "copy.proof",
      "copy.clarity.cards",
      'id="how-it-works"',
      'id="living-protocol"',
      'id="start-free"',
      'id="journal"',
      'id="faq"',
      'id="assessment"'
    ]) {
      assert.match(landingPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.doesNotMatch(landingPage, /PricingCard/);
    assert.doesNotMatch(landingPage, /id="pricing"/);
    assert.doesNotMatch(landingPage, /mn-v14-/);
    assert.doesNotMatch(source("../app/customer.css"), /mn-v14-/);
  });

  it("keeps homepage navigation and footer off old pricing anchors", () => {
    assert.match(homepage, /variant="landing"/);
    assert.match(blogArticlePage, /variant="landing"/);
    assert.match(
      blogArticlePage,
      /<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">\s*<BlogArticle[\s\S]*?\/>\s*<\/div>\s*<SiteFooter/
    );
    assert.match(titleBar, /mn-titlebar--landing/);
    assert.match(titleBar, /\/v15\/logo\.png/);
    assert.match(titleBar, /#living-protocol/);
    assert.match(titleBar, /#how-it-works/);
    assert.match(titleBar, /#promises/);
    assert.match(titleBar, /#journal/);
    assert.match(titleBar, /const titleCtaHref = assessmentPath/);
    assert.doesNotMatch(titleBar, /Free questionnaire/);
    assert.match(footer, /#start-free/);
    assert.doesNotMatch(titleBar, /#pricing/);
    assert.doesNotMatch(footer, /#pricing/);
  });

  it("sends primary homepage CTAs straight to the questionnaire", () => {
    assert.match(landingPage, /assessmentPath:\s*string/);
    assert.match(landingPage, /href=\{assessmentPath\}/);

    const intermediateAssessmentLinks = landingPage.match(/href="#assessment"/g) ?? [];
    assert.equal(intermediateAssessmentLinks.length, 0);
    assert.match(landingPage, /<section className="mn-v15-final-cta" id="assessment">/);
  });

  it("keeps mobile hero ingredient pills visible and positioned", () => {
    const defaultRule =
      /\.mn-v15-float-pill\s*\{([\s\S]*?)\n  \}/.exec(customerCss)?.[1] ?? "";
    const floatStart = customerCss.indexOf(".mn-v15-float-pill {");
    const desktopStart = customerCss.indexOf(
      "@media (min-width: 768px)",
      customerCss.indexOf('.mn-v15-float-pill[data-pill-index="4"]')
    );
    const mobileRules = customerCss.slice(floatStart, desktopStart);

    assert.match(defaultRule, /display:\s*inline-flex/);
    assert.doesNotMatch(defaultRule, /display:\s*none/);
    assert.match(defaultRule, /max-width:\s*min\(9\.5rem,\s*42vw\)/);

    for (const index of ["0", "1", "2", "3", "4"]) {
      assert.match(
        mobileRules,
        new RegExp(`\\.mn-v15-float-pill\\[data-pill-index="${index}"\\]`),
        `mobile pill ${index} is positioned before desktop overrides`
      );
    }
  });

  it("keeps the English visible copy faithful to the uploaded v15 page", () => {
    const en = content.en;

    assert.equal(en.clarity.eyebrow, "From overwhelm to clarity");
    assert.deepEqual(
      en.clarity.cards.map((card) => card.body),
      [
        "Hundreds of options, no clear answer.",
        "Guidance built around you.",
        "Only what your body actually needs.",
        "The Right Amount — in hand."
      ]
    );
    assert.deepEqual(
      en.how.steps.map(([, label]) => label),
      [
        "Detailed, not tedious",
        "120+ ingredients",
        "Dispensed by pharmacists",
        "Part of Living Protocol"
      ]
    );
    assert.match(landingPage, /copy\.promises\.cards/);
    assert.equal(en.results.eyebrow, "Stories like these");
    assert.equal(en.questionnaire.eyebrow, "The free questionnaire");
    assert.equal(en.bridge.note, "Free to start — no credit card required.");
    assert.match(
      landingPage,
      /assets\.foodBowl[\s\S]*copy\.food\.eyebrow[\s\S]*copy\.food\.title[\s\S]*copy\.food\.cards/
    );
  });

  it("has complete localized v15 copy for every public locale", () => {
    for (const locale of publicLocales) {
      const copy = content[locale];

      assert.equal(copy.proof.length, 3, `${locale} proof strip`);
      assert.equal(copy.clarity.cards.length, 4, `${locale} clarity cards`);
      assert.equal(copy.how.steps.length, 4, `${locale} flow steps`);
      assert.equal(copy.results.fallback.length, 4, `${locale} testimonials`);
      assert.equal(
        copy.results.fallback.filter((testimonial) => testimonial.imageAlt).length,
        4,
        `${locale} testimonial image alt text`
      );
      assert.equal(copy.journal.fallback.length, 3, `${locale} journal cards`);
      assert.equal(copy.questionnaire.sections.length, 6, `${locale} questionnaire sections`);
      assert.ok(copy.food.imageAlt, `${locale} food image alt`);
    }

    assert.doesNotMatch(landingCopy, /"zh-CN"\s*:\s*baseContent\.en/);
  });

  it("commits all extracted v15 image assets", () => {
    for (const asset of [
      "logo.png",
      "hero-emblem.png",
      "clarity-overwhelmed.jpg",
      "clarity-path.jpg",
      "clarity-narrowed.jpg",
      "clarity-enough.jpg",
      "food-bowl.jpg",
      "testimonial-daniel.jpg",
      "testimonial-meilin.jpg",
      "testimonial-wanida.jpg",
      "testimonial-malee.jpg",
      "origin-stage-1.png",
      "origin-stage-2.png",
      "origin-stage-3.png",
      "origin-stage-4.png",
      "origin-stage-5.png"
    ]) {
      assert.equal(
        existsSync(new URL(`../public/v15/${asset}`, import.meta.url)),
        true,
        `missing ${asset}`
      );
    }
  });

  it("loads homepage blog posts and testimonials deterministically by v15 metadata", () => {
    assert.match(blog, /export async function getHomepageBlogPosts/);
    assert.match(blog, /export async function getHomepageTestimonials/);
    assert.match(blog, /metadata->>'homepageVersion' = 'v15'/);
    assert.match(blog, /metadata->>'homepageSortOrder'/);
    assert.match(blog, /order by[\s\S]*sort_order/);
  });

  it("seeds v15 homepage content idempotently for all locales", () => {
    assert.match(seedScript, /homepageVersion:\s*"v15"/);
    assert.match(seedScript, /source_agent[\s\S]*'landing_v15_seed'/);
    assert.match(seedScript, /on conflict \(translation_group_id, locale\) do update/);
    assert.match(seedScript, /\$\{testimonial\.imageAlt\}/);
    assert.match(seedScript, /public\.testimonials/);
    assert.match(seedScript, /public\.blog_posts/);
    assert.match(seedScript, /for \(const locale of publicLocales\)/);
  });
});
