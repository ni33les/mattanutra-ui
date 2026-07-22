import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { getFeaturedLibraryArticles } from "../lib/library.ts";
import {
  staticLibraryArticles,
  visualKnowledgeLibrary
} from "../lib/library-static.ts";

const authoritative = JSON.parse(
  readFileSync(new URL("../files/ttf-ws1/AUTHORITATIVE.json", import.meta.url), "utf8")
) as {
  featuredSlugs: string[];
  articleImageMap: Array<{ slug: string; shareImage: string; nongPose: string }>;
};

describe("ttf ws1 integrity gate (step G)", () => {
  it("keeps 35 articles, featured triple, and per-slug share/pose assets", () => {
    assert.equal(visualKnowledgeLibrary.articleCount, 35);
    assert.equal(staticLibraryArticles.length, 35);
    assert.equal(visualKnowledgeLibrary.categories.length, 6);

    const featured = staticLibraryArticles
      .filter((article) => article.featured)
      .map((article) => article.slug);
    assert.deepEqual(featured, authoritative.featuredSlugs);

    const bySlug = new Map(
      authoritative.articleImageMap.map((row) => [row.slug, row])
    );

    for (const article of staticLibraryArticles) {
      const row = bySlug.get(article.slug);
      assert.ok(row, article.slug);
      assert.equal(article.shareImage, row!.shareImage);
      assert.ok(
        existsSync(new URL(`../public${article.shareImage}`, import.meta.url)),
        article.shareImage
      );
      const pose = (article.nongPose ?? article.pose)
        .replace(/^nong[_-]/, "")
        .replaceAll("_", "-");
      assert.ok(
        existsSync(
          new URL(`../public/assets/library/nong/nong-${pose}.webp`, import.meta.url)
        ),
        pose
      );
      assert.ok(article.translations.th.page?.nodes.length, `${article.slug} th nodes`);
      assert.ok(article.translations.th.quiz.questions.length, `${article.slug} th quiz`);
    }
  });

  it("returns curated featured articles for landing", async () => {
    const articles = await getFeaturedLibraryArticles("th", 3);
    assert.deepEqual(
      articles.map((article) => article.slug),
      authoritative.featuredSlugs
    );
  });

  it("passes the offline hand-off integrity verifier", () => {
    const result = spawnSync(
      "python3",
      ["scripts/verify-ttf-ws1-integrity.py"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        encoding: "utf8"
      }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /"status": "ok"/);
  });
});
