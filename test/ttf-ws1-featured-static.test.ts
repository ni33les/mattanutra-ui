import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getFeaturedLibraryArticles } from "../lib/library.ts";
import { staticLibraryArticles } from "../lib/library-static.ts";

const authoritative = JSON.parse(
  readFileSync(new URL("../files/ttf-ws1/AUTHORITATIVE.json", import.meta.url), "utf8")
) as { featuredSlugs: string[] };

describe("ttf ws1 featured library selection (step D)", () => {
  it("marks the hand-off featured triple on static articles", () => {
    const featured = staticLibraryArticles
      .filter((article) => article.featured)
      .map((article) => article.slug);

    assert.deepEqual(featured, authoritative.featuredSlugs);
  });

  it("returns curated featured articles for the landing shop window", async () => {
    const articles = await getFeaturedLibraryArticles("en", 3);
    assert.equal(articles.length, 3);
    assert.deepEqual(
      articles.map((article) => article.slug),
      authoritative.featuredSlugs
    );

    const th = await getFeaturedLibraryArticles("th", 3);
    assert.deepEqual(
      th.map((article) => article.slug),
      authoritative.featuredSlugs
    );
  });
});
