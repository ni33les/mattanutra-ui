import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visualKnowledgeLibrary } from "../lib/library-static.ts";

function cjkCount(text: string) {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function latinWordCount(text: string) {
  return (text.match(/[A-Za-z]{3,}/g) || []).length;
}

describe("library zh-CN localization", () => {
  it("keeps every article's zh-CN translation Chinese-majority (not an EN clone)", () => {
    const leaks: string[] = [];

    for (const article of visualKnowledgeLibrary.articles) {
      const zh = article.translations?.["zh-CN"];
      assert.ok(zh, `${article.slug} missing zh-CN`);
      assert.ok(zh.page?.nodes?.length, `${article.slug} missing zh-CN page nodes`);
      assert.ok(zh.quiz?.questions?.length, `${article.slug} missing zh-CN quiz`);

      const payload = JSON.stringify(zh);
      const cjk = cjkCount(payload);
      const latin = latinWordCount(payload);
      if (cjk < 50 || (latin > 30 && cjk < latin * 0.25)) {
        leaks.push(
          `${article.slug} cjk=${cjk} latin=${latin} title=${zh.title ?? ""}`
        );
      }

      assert.match(String(zh.title ?? ""), /[\u4e00-\u9fff]/, `${article.slug} title`);
      assert.match(String(zh.excerpt ?? zh.description ?? ""), /[\u4e00-\u9fff]/, `${article.slug} excerpt`);

      for (const question of zh.quiz.questions) {
        assert.match(question.question, /[\u4e00-\u9fff]/, `${article.slug} quiz question`);
        for (const option of question.options ?? []) {
          // Labels must not remain plain English Yes/No.
          if (option.value === "yes" || option.value === "no") {
            assert.doesNotMatch(option.label, /^(Yes|No)$/i, `${article.slug} ${option.value}`);
            assert.match(option.label, /[\u4e00-\u9fff]/, `${article.slug} ${option.value}`);
          }
        }
      }
    }

    assert.deepEqual(leaks, []);
  });

  it("localizes internal library hrefs to zh-CN for previously EN-cloned articles", () => {
    const slugs = [
      "which-supplements-do-vegans-actually-need",
      "l-carnitine-and-your-energy",
      "spicy-food-thailand-supplement-routine",
      "gut-health-supplements-when-make-sense",
      "gut-absorption-supplements"
    ];

    for (const slug of slugs) {
      const article = visualKnowledgeLibrary.articles.find((row) => row.slug === slug);
      assert.ok(article, slug);
      const hrefs: string[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        const record = node as Record<string, unknown>;
        const attrs = record.attrs as Record<string, unknown> | undefined;
        if (typeof attrs?.href === "string") hrefs.push(attrs.href);
        Object.values(record).forEach(walk);
      };
      walk(article!.translations["zh-CN"]);
      assert.ok(
        hrefs.some((href) => href.startsWith("/zh-CN/")),
        `${slug} expected /zh-CN/ hrefs`
      );
      assert.equal(
        hrefs.filter((href) => href.startsWith("/en/") || href.startsWith("/th/")).length,
        0,
        `${slug} still has foreign-locale hrefs`
      );
    }
  });
});
