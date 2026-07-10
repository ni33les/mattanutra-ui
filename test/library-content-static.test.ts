import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { publicLocales } from "../lib/i18n.ts";
import {
  staticLibraryArticles,
  visualKnowledgeLibrary,
  type VisualKnowledgeNode
} from "../lib/library-static.ts";

const articleSlugs = new Set(staticLibraryArticles.map((article) => article.slug));
const redirectSlugs = new Set(Object.keys(visualKnowledgeLibrary.canonicalRedirects ?? {}));
const resolvableLibrarySlugs = new Set([...articleSlugs, ...redirectSlugs]);
const missingLaunchSlugs = new Set([
  "gut-health-supplements",
  "vitamin-c-daily-essential"
]);

function publicAssetExists(src: string) {
  return existsSync(new URL(`../public${src}`, import.meta.url));
}

function librarySlugFromHref(href: string) {
  const match = /^\/(?:en|th|zh-CN)\/library\/([^/?#]+)/.exec(href);

  return match?.[1] ?? null;
}

function visitNode(
  node: VisualKnowledgeNode,
  visitor: (node: VisualKnowledgeNode) => void
) {
  visitor(node);

  if (node.type === "element" || node.type === "fragment") {
    for (const child of node.children) {
      visitNode(child, visitor);
    }
  }
}

describe("static Library content integrity", () => {
  it("keeps generated zip content resolvable across locales", () => {
    assert.equal(visualKnowledgeLibrary.articleCount, 30);
    assert.equal(staticLibraryArticles.length, 30);
    assert.equal(articleSlugs.size, 30);
    assert.deepEqual(visualKnowledgeLibrary.canonicalRedirects, {
      "coq10-who-is-it-actually-for": "coq10-who-is-it-for",
      "health-check-leave-out-biomarkers": "expensive-health-check-leave-out",
      "omega-3-every-day": "should-you-take-omega-3-every-day",
      "vitamin-d-thailand": "vitamin-d-in-thailand"
    });

    const hrefProblems: string[] = [];
    const assetProblems: string[] = [];

    for (const article of staticLibraryArticles) {
      assert.ok(publicAssetExists(article.shareImage), `${article.slug} share image`);

      for (const locale of publicLocales) {
        const nodes = article.translations[locale].page?.nodes ?? [];
        assert.ok(nodes.length > 0, `${article.slug} ${locale} page nodes`);

        for (const node of nodes) {
          visitNode(node, (item) => {
            if (item.type === "image" && !publicAssetExists(item.src)) {
              assetProblems.push(`${article.slug}:${locale}:${item.src}`);
            }

            if (item.type !== "element" || item.tag !== "a") {
              return;
            }

            const href = item.attrs?.href;
            if (typeof href !== "string") {
              return;
            }

            if (href.includes("/assessment") || /\.html(?:$|[?#])/.test(href)) {
              hrefProblems.push(`${article.slug}:${locale}:${href}`);
            }

            for (const missingSlug of missingLaunchSlugs) {
              if (href.includes(missingSlug)) {
                hrefProblems.push(`${article.slug}:${locale}:${href}`);
              }
            }

            const librarySlug = librarySlugFromHref(href);
            if (librarySlug && !resolvableLibrarySlugs.has(librarySlug)) {
              hrefProblems.push(`${article.slug}:${locale}:${href}`);
            }
          });
        }
      }
    }

    assert.deepEqual(assetProblems, []);
    assert.deepEqual(hrefProblems, []);
  });
});
