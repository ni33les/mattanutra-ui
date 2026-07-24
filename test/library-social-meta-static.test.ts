import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import visualKnowledge from "../content/library/visual-knowledge.json" with {
  type: "json"
};

const seoSource = readFileSync(new URL("../lib/seo.ts", import.meta.url), "utf8");
const libraryArticlePage = readFileSync(
  new URL("../app/[locale]/library/[slug]/page.tsx", import.meta.url),
  "utf8"
);

describe("library social link-unfurl metadata", () => {
  it("localizedMetadata emits brand, article type, and share image size helpers", () => {
    assert.match(seoSource, /SOCIAL_SITE_NAME\s*=\s*"MattaNutra"/);
    assert.match(seoSource, /SOCIAL_SHARE_IMAGE_WIDTH\s*=\s*1200/);
    assert.match(seoSource, /SOCIAL_SHARE_IMAGE_HEIGHT\s*=\s*630/);
    assert.match(seoSource, /siteName/);
    assert.match(seoSource, /openGraphType/);
    assert.match(seoSource, /width:\s*imageWidth/);
    assert.match(seoSource, /height:\s*imageHeight/);
  });

  it("library article pages request article OG type and 1200×630 share cards", () => {
    assert.match(libraryArticlePage, /openGraphType:\s*"article"/);
    assert.match(libraryArticlePage, /imageWidth:\s*1200/);
    assert.match(libraryArticlePage, /imageHeight:\s*630/);
    assert.match(libraryArticlePage, /imageAlt/);
  });

  it("stores hand-off social fields on EN+TH library translations", () => {
    const articles = visualKnowledge.articles as Array<{
      slug: string;
      shareImage?: string;
      translations: Record<
        string,
        {
          description?: string;
          ogDescription?: string;
          ogTitle?: string;
          seoTitle?: string;
          twitterDescription?: string;
          twitterTitle?: string;
        }
      >;
    }>;

    assert.equal(articles.length, 35);

    for (const article of articles) {
      assert.ok(article.shareImage?.startsWith("/assets/library/share/"));
      for (const loc of ["en", "th"] as const) {
        const tr = article.translations[loc];
        assert.ok(tr, `${article.slug} ${loc}`);
        assert.ok(
          (tr.ogTitle || tr.seoTitle || "").trim().length > 0,
          `${article.slug} ${loc} missing social title`
        );
        assert.ok(
          (tr.ogDescription || tr.description || "").trim().length > 0,
          `${article.slug} ${loc} missing social description`
        );
        assert.ok(
          typeof tr.ogDescription === "string" && tr.ogDescription.trim().length > 0,
          `${article.slug} ${loc} missing explicit ogDescription from zip`
        );
        assert.ok(
          typeof tr.twitterDescription === "string" &&
            tr.twitterDescription.trim().length > 0,
          `${article.slug} ${loc} missing twitterDescription from zip`
        );
      }
    }

    // Citicoline: zip Twitter blurb is shorter and distinct from long SEO description.
    const citicoline = articles.find((a) => a.slug === "citicoline-vs-alpha-gpc");
    assert.ok(citicoline);
    const th = citicoline!.translations.th;
    assert.ok(th.ogDescription);
    assert.ok(th.twitterDescription);
    assert.notEqual(th.twitterDescription, th.description);
    assert.match(th.ogTitle || th.seoTitle || "", /Alpha-GPC|ซิติโคลีน/);
  });
});
