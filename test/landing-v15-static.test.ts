import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { content, getLandingPageCopy } from "../components/landing-page-copy.ts";
import { publicLocales } from "../lib/i18n.ts";
import {
  launchLibraryArticles,
  libraryCategories,
  nongPoseAsset
} from "../lib/library.ts";
import {
  staticLibraryArticleCount,
  staticLibraryArticles,
  visualKnowledgeLibrary
} from "../lib/library-static.ts";
import { getNamespace } from "../lib/i18n-messages.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const landingPage = source("../components/landing-page.tsx");
const landingCopy = source("../components/landing-page-copy.ts");
const customerCss = source("../app/customer.css");
const titleBar = source("../components/title-bar.tsx");
const footer = source("../components/site-footer.tsx");
const homepage = source("../app/[locale]/page.tsx");
const libraryIndexPage = source("../app/[locale]/library/page.tsx");
const libraryArticlePage = source("../app/[locale]/library/[slug]/page.tsx");
const libraryIndex = source("../components/library-index.tsx");
const libraryIndexClient = source("../components/library-index-client.tsx");
const legacyBlogArticlePage = source("../app/[locale]/blog/[slug]/page.tsx");
const librarySource = source("../lib/library.ts");
const visualKnowledgeArticle = source("../components/visual-knowledge-article.tsx");
const libraryVisualPage = source("../components/library-visual-page.tsx");
const blogSource = source("../lib/blog.ts");
const nextConfig = source("../next.config.ts");
const seoSource = source("../lib/seo.ts");
const sitemapSource = source("../app/sitemap.ts");
const robotsSource = source("../app/robots.ts");
const bpmTracker = source("../components/bpm-tracker.tsx");
const adminContentView = source("../components/admin/content-view.tsx");
const seedScript = source("../scripts/seed-landing-v15-content.ts");

describe("landing page v16 library-only port", () => {
  it("keeps the v15 homepage sections and replaces Journal with Library", () => {
    for (const marker of [
      "copy.proof",
      "copy.clarity.cards",
      'id="how-it-works"',
      'id="living-protocol"',
      'id="start-free"',
      'id="library"',
      'id="faq"',
      'id="assessment"'
    ]) {
      assert.match(landingPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.doesNotMatch(landingPage, /id="journal"/);
    assert.doesNotMatch(landingPage, /PricingCard/);
    assert.doesNotMatch(landingPage, /id="pricing"/);
    assert.doesNotMatch(landingPage, /mn-v14-/);
    assert.doesNotMatch(source("../app/customer.css"), /mn-v14-/);
  });

  it("keeps homepage navigation, footer, and generated links on Library", () => {
    assert.match(homepage, /variant="landing"/);
    assert.match(homepage, /getFeaturedLibraryArticles\(locale,\s*3\)/);
    assert.match(homepage, /libraryArticles=\{libraryArticles\}/);
    assert.match(landingPage, /data-home-library-card=\{true\}/);
    assert.match(libraryIndexPage, /<LibraryIndex articles=\{articles\} locale=\{locale\}/);
    assert.match(libraryArticlePage, /<VisualKnowledgeArticle article=\{article\}/);
    assert.match(libraryArticlePage, /<BlogArticle cta=\{getArticleCta\(locale\)\} post=\{article\.post\}/);
    assert.match(libraryArticlePage, /permanentRedirect\(`\/\$\{locale\}\/library\/\$\{article\.slug\}`\)/);
    assert.match(legacyBlogArticlePage, /permanentRedirect\(`\/\$\{locale\}\/library\/\$\{slug\}`\)/);
    assert.doesNotMatch(legacyBlogArticlePage, /<BlogArticle/);

    assert.match(titleBar, /mn-titlebar--landing/);
    assert.match(titleBar, /\/v15\/logo\.png/);
    const titleBarCopy = getNamespace<{
      links: readonly (readonly [string, string])[];
    }>("en", "customer.titleBar");
    assert.deepEqual(
      titleBarCopy.links.map(([href]) => href),
      ["#living-protocol", "#how-it-works", "#promises", "/library"]
    );
    assert.match(titleBar, /function titleBarHref/);
    assert.match(titleBar, /`\/\$\{locale\}\$\{href\}`/);
    assert.match(titleBar, /const titleCtaHref = assessmentPath/);
    assert.doesNotMatch(titleBar, /Free questionnaire/);

    const footerCopy = getNamespace<{
      columns: readonly Readonly<{ links: readonly (readonly [string, string])[] }>[];
    }>("en", "customer.footer");
    assert.ok(
      footerCopy.columns.some((column) =>
        column.links.some(([, href]) => href === "/library")
      )
    );
    assert.doesNotMatch(titleBar, /#pricing|#journal/);
    assert.doesNotMatch(footer, /#pricing|#journal/);
    assert.doesNotMatch(JSON.stringify(titleBarCopy), /#pricing|#journal|Journal|Blog/);
    assert.doesNotMatch(JSON.stringify(footerCopy), /#pricing|#journal|Journal|Blog/);
  });

  it("keeps Library index chrome in the first-class i18n catalog", () => {
    const forbiddenHeaderCopy = [
      "Home",
      "Learn the",
      "right amount",
      "Guided by",
      "The MattaNutra Library"
    ];

    for (const phrase of forbiddenHeaderCopy) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      assert.doesNotMatch(libraryIndex, new RegExp(`["'\`]${escaped}["'\`]`));
    }

    assert.match(libraryIndex, /copy\.breadcrumbLabel/);
    assert.match(libraryIndex, /copy\.headerTitle/);
    assert.match(libraryIndex, /copy\.headerIntro/);
    assert.match(libraryIndex, /copy\.headerGuide/);
    assert.match(librarySource, /from "@\/lib\/i18n-messages"/);
    assert.match(librarySource, /customer\.libraryIndex\.headerTitle/);
    assert.match(librarySource, /customer\.libraryCategories\.sleepRecovery/);
    assert.doesNotMatch(librarySource, /localizedLibraryCopy|localizedCategoryLabels/);
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

  it("keeps the unchanged English visible copy faithful to the uploaded v15 page", () => {
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
      assert.equal(copy.questionnaire.sections.length, 6, `${locale} questionnaire sections`);
      assert.ok(copy.food.imageAlt, `${locale} food image alt`);
    }

    assert.doesNotMatch(landingCopy, /"zh-CN"\s*:\s*baseContent\.en/);
  });

  it("commits all v15 and v16 visual assets needed by the landing and Library pages", () => {
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
        `missing v15 ${asset}`
      );
    }

    for (const asset of [
      "logo.png",
      "hero-figure.png",
      "mattanutra-og.png",
      "nong-ask.png",
      "nong-celebrate.png",
      "nong-comparing.png",
      "nong-explaining.png",
      "nong-measuring.png",
      "nong-open.png",
      "nong-reassuring.png",
      "nong-sleep-supine.png",
      "nong-thinking.png",
      "nong-warning.png"
    ]) {
      assert.equal(
        existsSync(new URL(`../public/v16/${asset}`, import.meta.url)),
        true,
        `missing v16 ${asset}`
      );
    }
  });

  it("defines first-class Visual Knowledge Library content for all launch articles", () => {
    const categorySlugs = new Set<string>(
      libraryCategories.map((category) => category.slug)
    );
    const slugs = new Set(launchLibraryArticles.map((article) => article.slug));
    const dates = launchLibraryArticles.map((article) => article.datePublished);

    assert.equal(staticLibraryArticleCount, 35);
    assert.equal(visualKnowledgeLibrary.generatedFrom, "files/ttf.zip#ws1-handoff");
    assert.deepEqual(visualKnowledgeLibrary.canonicalRedirects, {
      "coq10-who-is-it-actually-for": "coq10-who-is-it-for",
      "health-check-leave-out-biomarkers": "expensive-health-check-leave-out",
      "omega-3-every-day": "should-you-take-omega-3-every-day",
      "vitamin-d-thailand": "vitamin-d-in-thailand"
    });
    assert.equal(launchLibraryArticles.length, 35);
    assert.equal(slugs.size, 35);
    assert.deepEqual([...dates], [...dates].sort().reverse());

    for (const article of launchLibraryArticles) {
      assert.ok(categorySlugs.has(article.categorySlug), `${article.slug} category`);
      assert.equal(
        existsSync(new URL(`../public${nongPoseAsset(article.pose)}`, import.meta.url)),
        true,
        `${article.slug} pose asset`
      );
    }

    for (const article of staticLibraryArticles) {
      assert.ok(categorySlugs.has(article.categorySlug), `${article.slug} category`);
      assert.equal(
        existsSync(new URL(`../public${article.shareImage}`, import.meta.url)),
        true,
        `${article.slug} share image`
      );
      assert.equal(article.canonicalSlug, article.slug, `${article.slug} canonical slug`);
      assert.ok(article.sourceHtmlFile, `${article.slug} source HTML file`);
      assert.ok(article.sourcePackage.endsWith(".zip"), `${article.slug} source package`);
      assert.doesNotMatch(
        article.sourcePackage,
        /The MattaNutra Library\.zip/,
        `${article.slug} is not sourced from the stale archive`
      );

      for (const locale of publicLocales) {
        const translation = article.translations[locale];

        assert.ok(translation?.title, `${article.slug} ${locale} title`);
        assert.ok(translation?.description, `${article.slug} ${locale} meta description`);
        assert.ok(translation?.imageAlt, `${article.slug} ${locale} image alt`);
        assert.ok(translation?.blocks.length, `${article.slug} ${locale} body`);
        assert.ok(translation?.page?.nodes.length, `${article.slug} ${locale} page nodes`);
        assert.ok(translation?.faqs.length, `${article.slug} ${locale} FAQs`);
        assert.ok(translation?.quiz.questions.length, `${article.slug} ${locale} quiz`);

        if (locale !== "en") {
          assert.notEqual(
            JSON.stringify(translation.page?.nodes),
            JSON.stringify(article.translations.en.page?.nodes),
            `${article.slug} ${locale} does not use English body fallback`
          );
        }
      }
    }
  });

  it("keeps Library service as the public resolver over static metadata and DB rows", () => {
    assert.match(librarySource, /staticLibraryArticles/);
    assert.match(librarySource, /getStaticLibraryArticle/);
    assert.match(librarySource, /getStaticLibraryCanonicalSlug/);
    assert.match(librarySource, /export async function getLibraryArticles/);
    assert.match(librarySource, /export async function getFeaturedLibraryArticles/);
    assert.match(librarySource, /export async function getRandomLibraryArticles/);
    assert.match(
      librarySource,
      /article\.featured/
    );
    assert.match(
      librarySource,
      /getRandomLibraryArticles[\s\S]*shuffledArticles\(await getLibraryArticles\(locale\)\)/
    );
    assert.match(librarySource, /export async function getLibraryArticle/);
    assert.match(librarySource, /export async function getLibraryArticleLocalePaths/);
    assert.match(librarySource, /metadata\.contentSurface === "library"/);
    assert.match(librarySource, /metadata\.content_surface === "library"/);
    assert.match(librarySource, /getPublishedBlogPosts\(locale,\s*500\)/);
    assert.match(librarySource, /postHasContent/);
    assert.doesNotMatch(librarySource, /getStaticLibraryTranslation\(article,\s*defaultLocale\)/);
    assert.match(blogSource, /return `\/\$\{locale\}\/library\/\$\{slug\}`/);
    assert.match(blogSource, /export async function getHomepageTestimonials/);
  });

  it("renders archive articles through platform React and cached Library images", () => {
    assert.match(libraryArticlePage, /image:\s*article\.shareImage/);
    assert.match(seoSource, /images:\s*imageUrl/);
    assert.match(
      seoSource,
      /card:\s*imageUrl\s*\?\s*"summary_large_image"\s*:\s*"summary"/
    );
    assert.match(visualKnowledgeArticle, /<LibraryVisualPage/);
    assert.match(libraryVisualPage, /from "next\/image"/);
    assert.match(libraryVisualPage, /<Image/);
    assert.match(libraryVisualPage, /width=\{node\.width\}/);
    assert.match(libraryVisualPage, /height=\{node\.height\}/);
    assert.match(libraryVisualPage, /sizes=/);
    assert.match(libraryVisualPage, /priority=\{priority\}/);
    assert.match(libraryVisualPage, /node\.tag === "button"/);
    assert.match(libraryVisualPage, /node\.tag === "a"/);
    assert.match(libraryVisualPage, /data-q/);
    assert.match(libraryVisualPage, /navigator\.share/);
    assert.match(libraryVisualPage, /navigator\.clipboard/);

    for (const sourceText of [
      visualKnowledgeArticle,
      libraryVisualPage,
      libraryIndexPage,
      libraryArticlePage
    ]) {
      assert.doesNotMatch(sourceText, /<img\b/);
      assert.doesNotMatch(sourceText, /fonts\.googleapis\.com/);
      assert.doesNotMatch(sourceText, /<script src=/);
      assert.doesNotMatch(sourceText, /\/assessment/);
    }

    assert.match(
      libraryVisualPage,
      /src=\{node\.src\}[\s\S]*unoptimized=\{node\.src\.startsWith\("\/assets\/library\/"\)\}/
    );
    assert.match(
      libraryIndexClient,
      /src=\{nongPoseAsset\(article\.pose\)\}[\s\S]*unoptimized=\{true\}/
    );
  });

  it("keeps wrapped Library filters separated from the article grid", () => {
    assert.match(libraryIndexClient, /data-library-filters=\{true\}/);
    assert.match(libraryIndexClient, /data-library-grid=\{true\}/);
    assert.match(libraryIndexClient, /data-library-card=\{true\}/);
    assert.match(libraryIndexClient, /showCount \? "mt-0" : "mt-10"/);
  });

  it("caches normalized Library assets with immutable headers", () => {
    assert.match(nextConfig, /minimumCacheTTL:\s*31536000/);
    assert.match(nextConfig, /source:\s*"\/assets\/library\/:path\*"/);
    assert.match(nextConfig, /public,\s*max-age=31536000,\s*immutable/);
    // No-store is scoped to personal/admin funnel segments only, not all locale paths.
    assert.match(nextConfig, /noStoreLocaleRootSegments/);
    assert.match(nextConfig, /localeNoStoreHeaderSources/);
    assert.match(nextConfig, /private,\s*no-store,\s*no-cache/);
    assert.doesNotMatch(
      nextConfig,
      /source:\s*`\/:locale\(\$\{publicLocaleRoutePattern\}\)\/:path\*`/
    );
  });

  it("keeps marketing pages on ISR instead of layout-wide force-dynamic", () => {
    assert.doesNotMatch(homepage, /export const dynamic = "force-dynamic"/);
    assert.match(homepage, /export const revalidate = 300/);
    assert.doesNotMatch(libraryIndexPage, /export const dynamic = "force-dynamic"/);
    assert.match(libraryIndexPage, /export const revalidate = 300/);
    assert.doesNotMatch(libraryArticlePage, /export const dynamic = "force-dynamic"/);
    assert.match(libraryArticlePage, /export const revalidate = 300/);
    assert.doesNotMatch(legacyBlogArticlePage, /export const dynamic = "force-dynamic"/);
  });

  it("keeps sitemap, robots, analytics, and admin preview links Library-oriented", () => {
    assert.match(sitemapSource, /getRenderableLibraryArticles/);
    assert.match(sitemapSource, /`\/\$\{locale\}\/library`/);
    assert.doesNotMatch(sitemapSource, /\/blog\//);
    assert.match(robotsSource, /sitemap:\s*absoluteUrl\("\/sitemap\.xml"\)/);
    assert.match(robotsSource, /robotsDisallowPaths/);
    assert.match(robotsSource, /disallow:\s*robotsDisallowPaths\(\)/);
    assert.match(bpmTracker, /\/library\//);
    assert.match(bpmTracker, /library_article_viewed/);
    assert.match(adminContentView, /\/library\//);
    assert.doesNotMatch(adminContentView, /\/blog\//);
  });

  it("seeds v15 homepage content idempotently for all locales", () => {
    assert.match(seedScript, /homepageVersion:\s*"v15"/);
    assert.match(seedScript, /source_agent[\s\S]*'landing_v15_seed'/);
    assert.match(seedScript, /on conflict \(translation_group_id, locale\) do update/);
    assert.match(seedScript, /\$\{testimonial\.imageAlt\}/);
    assert.match(seedScript, /public\.testimonials/);
    assert.match(seedScript, /public\.blog_posts/);
    assert.match(seedScript, /for \(const locale of publicLocales\)/);
    assert.match(seedScript, /getLandingPageCopy\(locale\)/);
  });

  it("shares resolved landing copy between the app and DB seed", () => {
    assert.deepEqual(getLandingPageCopy("zh-CN"), content["zh-CN"]);
    assert.equal(content["zh-CN"].hero.title, "停止猜测，");
    assert.equal(content["zh-CN"].questionnaire.cta, "免费测我的健康评分");
    assert.equal(content["zh-CN"].final.accent, "开始知量。");
  });
});
