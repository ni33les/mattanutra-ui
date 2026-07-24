import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import visualKnowledge from "../content/library/visual-knowledge.json" with {
  type: "json"
};

const bodyCss = readFileSync(
  new URL("../app/library-article-body.css", import.meta.url),
  "utf8"
);
const localeLayout = readFileSync(
  new URL("../app/[locale]/layout.tsx", import.meta.url),
  "utf8"
);
const renderer = readFileSync(
  new URL("../components/library-visual-page.tsx", import.meta.url),
  "utf8"
);

const CRITICAL_CSS_TOKENS = [
  ".mn-library-visual",
  "dose-grid",
  "dose-card",
  "check-wrap",
  ".mini",
  "nong-card",
  "hero-art",
  "font-synthesis: none",
  "datarow",
  ".ring",
  "cost-card",
  "package-card",
  "missing-card",
  "analysis-visual",
  "three > .mn-library-fragment",
  "max-width: none",
  "money-hero",
  "brain-hero",
  "joint-hero",
  "coffee-hero",
  "creatine-hero",
  "curcumin-hero",
  "stress-hero",
  "sleep-hero",
  "mn-cta-nong",
  "nong-card .tt"
] as const;

/** Modules checked in zip body markup → JSON (not <style>-only tokens). */
const STRUCTURE_MODULES = [
  "dose-grid",
  "check-wrap",
  "mini",
  "missing-card",
  "cost-card",
  "package-card",
  "datarow",
  "insights",
  "own-grid",
  "benefits",
  "nong-card",
  "cta",
  "quiz",
  "analysis-visual",
  "spice-table",
  "local-note",
  "hero",
  "three",
  "ownable",
  "details",
  "trust",
  "ai"
] as const;

const CANONICAL_ZIP_STEM: Record<string, string> = {
  "coq10-who-is-it-actually-for": "coq10-who-is-it-for",
  "health-check-leave-out-biomarkers": "expensive-health-check-leave-out"
};

type Article = {
  slug: string;
  translations: Record<
    string,
    { page?: { nodes?: unknown } } | undefined
  >;
};

function zipEnDir() {
  return fileURLToPath(new URL("../files/ttf-ws1-tl/library/en/", import.meta.url));
}

function zipBodyClassSet(html: string) {
  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const classes = new Set<string>();
  for (const match of body.matchAll(/class="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) classes.add(token);
    }
  }
  return classes;
}

function walkIcons(node: unknown, icons: Array<Record<string, unknown>>) {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record.type === "icon") {
    icons.push(record);
  }
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) walkIcons(child, icons);
  }
}

describe("library article body visual CSS", () => {
  it("imports zip-scoped body styles in the locale layout after globals", () => {
    assert.match(localeLayout, /library-article-body\.css/);
    const globalsIdx = localeLayout.indexOf("globals.css");
    const bodyIdx = localeLayout.indexOf("library-article-body.css");
    assert.ok(globalsIdx >= 0 && bodyIdx > globalsIdx, "body CSS must load after globals");
  });

  it("scopes critical zip modules under .mn-library-visual", () => {
    for (const token of CRITICAL_CSS_TOKENS) {
      assert.match(
        bodyCss,
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `missing CSS token: ${token}`
      );
    }
    assert.doesNotMatch(bodyCss, /(?:^|\n)\.header\s*\{/);
    assert.doesNotMatch(bodyCss, /(?:^|\n)\.nav\s*\{/);
  });

  it("restores zip card wrappers for grid fragments in the renderer", () => {
    assert.match(renderer, /fragmentCardClass/);
    assert.match(renderer, /parentClassName/);
    assert.match(renderer, /hasClass\(parentClassName,\s*"three"\)/);
    assert.match(renderer, /return "stance"/);
    assert.match(renderer, /mn-cta-nong/);
    assert.match(renderer, /shapes/);
  });

  it("forces white text on purple nong-card quote", () => {
    assert.match(bodyCss, /nong-card \.tt/);
    assert.match(bodyCss, /nong-card \.st/);
    assert.match(bodyCss, /color:\s*#fff\s*!important/);
  });

  it("keeps 35 articles with hero + cta + icon shapes", () => {
    const articles = visualKnowledge.articles as Article[];
    assert.equal(articles.length, 35);

    for (const article of articles) {
      for (const loc of ["en", "th"] as const) {
        const nodes = article.translations[loc]?.page?.nodes ?? [];
        const blob = JSON.stringify(nodes);
        // className may be "hero" or "hero reveal" etc.
        assert.match(blob, /"hero(?:\s|")/, `${article.slug} ${loc} missing hero`);
        assert.match(blob, /"cta(?:\s|")/, `${article.slug} ${loc} missing cta`);

        const icons: Array<Record<string, unknown>> = [];
        for (const node of nodes as unknown[]) walkIcons(node, icons);
        assert.ok(icons.length > 0, `${article.slug} ${loc} has no icons`);
        for (const icon of icons) {
          const shapes = icon.shapes;
          assert.ok(
            Array.isArray(shapes) && shapes.length > 0,
            `${article.slug} ${loc} icon missing shapes`
          );
        }
      }
    }
  });

  it("vegan pilot retains dose-grid + check-wrap (EN+TH)", () => {
    const articles = visualKnowledge.articles as Article[];
    const vegan = articles.find(
      (a) => a.slug === "which-supplements-do-vegans-actually-need"
    );
    assert.ok(vegan, "vegan article missing");
    for (const loc of ["en", "th"] as const) {
      const blob = JSON.stringify(vegan!.translations[loc]?.page?.nodes ?? []);
      assert.match(blob, /dose-grid/, `vegan ${loc} missing dose-grid`);
      assert.match(blob, /check-wrap/, `vegan ${loc} missing check-wrap`);
      assert.match(blob, /dose-card/, `vegan ${loc} missing dose-card`);
    }
  });

  it("true zip body markup modules are present on all 35×2 node trees", () => {
    const enDir = zipEnDir();
    if (!existsSync(enDir)) {
      return;
    }

    const articles = visualKnowledge.articles as Article[];
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    const files = readdirSync(enDir).filter((f) => f.endsWith(".html"));
    assert.ok(files.length >= 30, `expected ~35 zip pages, got ${files.length}`);

    const thDir = join(enDir, "..", "th");

    for (const file of files) {
      const stem = file.replace(/\.html$/, "");
      const slug = CANONICAL_ZIP_STEM[stem] ?? stem;
      const article = bySlug.get(slug);
      assert.ok(article, `no JSON article for zip ${stem} → ${slug}`);

      for (const loc of ["en", "th"] as const) {
        const zipPath =
          loc === "en" ? join(enDir, file) : join(thDir, file);
        if (!existsSync(zipPath) && loc === "th") {
          // coq10 stem may differ; try slug name
          const alt = join(thDir, `${slug}.html`);
          if (!existsSync(alt)) {
            assert.fail(`missing zip ${loc} for ${slug}`);
          }
        }
        const htmlPath = existsSync(zipPath)
          ? zipPath
          : join(thDir, `${slug}.html`);
        const html = readFileSync(htmlPath, "utf8");
        const zipClasses = zipBodyClassSet(html);
        const want = STRUCTURE_MODULES.filter((m) => zipClasses.has(m));
        // stance is optional if articles carry structure under three
        if (zipClasses.has("stance")) {
          // satisfied by stance class or article wrappers
        }

        const nodes = article!.translations[loc]?.page?.nodes ?? [];
        const blob = JSON.stringify(nodes);

        for (const mod of want) {
          if (mod === "stance") {
            const ok =
              blob.includes("stance") ||
              blob.includes('"tag":"article"') ||
              blob.includes('"tag": "article"');
            assert.ok(ok, `${slug} ${loc} missing stance/article for zip stance`);
            continue;
          }
          assert.ok(
            blob.includes(mod),
            `${slug} ${loc} missing zip body module .${mod}`
          );
        }
      }
    }
  });
});
