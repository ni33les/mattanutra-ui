import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const repoRoot = new URL("..", import.meta.url);
const customerCss = readFileSync(
  new URL("../app/customer.css", import.meta.url),
  "utf8",
);
const localeLayout = readFileSync(
  new URL("../app/[locale]/layout.tsx", import.meta.url),
  "utf8",
);

function sourceFiles(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === ".git" ||
      entry.name === ".next" ||
      entry.name === "coverage" ||
      entry.name === "node_modules"
    ) {
      return [];
    }

    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);

    if (entry.isDirectory()) {
      if (url.pathname.endsWith("/components/admin/")) {
        return [];
      }

      return sourceFiles(url);
    }

    if (!/\.(?:css|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return statSync(url).size < 1_000_000 ? [url] : [];
  });
}

function relativePath(file: URL) {
  return file.pathname.replace(repoRoot.pathname, "");
}

function customerFacingFiles() {
  return [
    ...sourceFiles(new URL("../app/[locale]/", import.meta.url)),
    ...sourceFiles(new URL("../components/", import.meta.url)),
  ].filter((file) => {
    const path = relativePath(file);

    return !path.startsWith("app/[locale]/admin/");
  });
}

describe("customer CSS and font system", () => {
  it("loads the shared customer font stack with real Fraunces italic", () => {
    assert.match(localeLayout, /const displayFont = Fraunces/);
    assert.match(localeLayout, /style:\s*\["normal", "italic"\]/);
    assert.match(localeLayout, /weight:\s*"variable"/);
    assert.match(localeLayout, /axes:\s*\["opsz"\]/);
    assert.match(localeLayout, /variable:\s*"--mn-font-display"/);
  });

  it("keeps customer-facing routes from loading page-local font families", () => {
    for (const file of sourceFiles(new URL("../app/[locale]/", import.meta.url))) {
      const path = relativePath(file);
      const source = readFileSync(file, "utf8");

      if (path === "app/[locale]/layout.tsx" || path.startsWith("app/[locale]/admin/")) {
        continue;
      }

      assert.doesNotMatch(source, /from "next\/font\/google"/, path);
      assert.doesNotMatch(source, /--mn-payment-font-/, path);
      assert.doesNotMatch(source, /Playfair_Display|Inter\(/, path);
    }
  });

  it("uses semantic customer font and card classes instead of legacy aliases", () => {
    for (const file of customerFacingFiles()) {
      const path = relativePath(file);
      const source = readFileSync(file, "utf8");

      assert.doesNotMatch(source, /font-\[family:var\(--mn-font-/, path);
      assert.doesNotMatch(source, /\bmn-v11-/, path);
      assert.doesNotMatch(source, /\bmn-v14-/, path);
    }

    assert.match(customerCss, /\.mn-customer-shell \.mn-font-display\b/);
    assert.match(customerCss, /\.mn-customer-shell \.mn-font-mono\b/);
    assert.match(customerCss, /\.mn-customer-shell \.mn-section-eyebrow\b/);
    assert.match(customerCss, /\.mn-customer-shell \.mn-commerce-card\b/);
  });

  it("does not mask page-specific typography with generic heading font important rules", () => {
    const genericHeadingRegion = customerCss.slice(
      customerCss.indexOf(".mn-customer-shell h1,"),
      customerCss.indexOf(".mn-customer-shell code,"),
    );

    const declarations = genericHeadingRegion.matchAll(
      /(font-family|font-style):\s*([^;]+);/g,
    );

    for (const [, property, value] of declarations) {
      assert.doesNotMatch(value, /!important/, property);
    }
  });
});
