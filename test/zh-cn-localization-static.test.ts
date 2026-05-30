import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ts from "typescript";

const customerCopyFiles = [
  "../components/assessment-flow.tsx",
  "../components/assessment-flow-copy.ts",
  "../components/assessment-flow-copy-en.ts",
  "../components/assessment-flow-copy-th.ts",
  "../components/assessment-flow-copy-zh-cn.ts",
  "../components/formulation-reveal-copy.ts",
  "../components/formulation-results.tsx",
  "../components/formulation-results-copy.ts",
  "../components/formulation-support-helpers.ts",
  "../components/landing-page-copy.ts",
  "../components/landing-page.tsx",
  "../components/nutrition-flow/healthscore-panel.tsx",
  "../components/nutrition-flow/healthscore-panel-copy.ts",
  "../components/product-recommendations-panel-copy.ts",
  "../app/[locale]/order/track/[token]/page.tsx",
  "../lib/i18n.ts",
  "../lib/legal-content.ts"
];

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(node: ts.PropertyName) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }

  return null;
}

function collectStrings(
  node: ts.Expression,
  values: string[]
) {
  const current = unwrap(node);

  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    values.push(current.text);
    return;
  }

  if (ts.isArrayLiteralExpression(current)) {
    for (const item of current.elements) {
      collectStrings(item as ts.Expression, values);
    }
    return;
  }

  if (ts.isObjectLiteralExpression(current)) {
    for (const property of current.properties) {
      if (ts.isPropertyAssignment(property)) {
        collectStrings(property.initializer, values);
      }
    }
  }
}

function zhCnStringValues(path: string) {
  const text = source(path);
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const values: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === "zh-CN"
    ) {
      collectStrings(node.initializer, values);
    }

    ts.forEachChild(node, visit);
  }

  visit(file);

  return values;
}

describe("zh-CN localization guardrails", () => {
  it("does not map Chinese admin or customer copy back to English", () => {
    assert.doesNotMatch(
      source("../components/admin/dashboard-content.tsx"),
      /"zh-CN"\s*:\s*baseContent\.en/
    );
    assert.doesNotMatch(
      source("../components/landing-page-copy.ts"),
      /"zh-CN"\s*:\s*baseContent\.en/
    );
    assert.doesNotMatch(
      source("../components/nutrition-flow/healthscore-panel-copy.ts"),
      /"zh-CN"\s*:\s*basePageCopy\.en/
    );
    assert.doesNotMatch(
      [
        source("../components/formulation-results.tsx"),
        source("../components/formulation-reveal-copy.ts"),
        source("../components/formulation-results-copy.ts"),
        source("../components/formulation-support-helpers.ts")
      ].join("\n"),
      /"zh-CN"\s*:\s*base[A-Za-z0-9]+\.en/
    );
    assert.match(
      source("../app/[locale]/order/track/[token]/page.tsx"),
      /"zh-CN":\s*\{[\s\S]*?你的订单正在配送中/
    );
    assert.match(
      source("../app/[locale]/order/track/[token]/page.tsx"),
      /invalidTitle:\s*"无法打开此追踪链接"/
    );
    assert.doesNotMatch(
      source("../app/[locale]/order/track/[token]/page.tsx"),
      /notFound\(\)/
    );
  });

  it("keeps product import review translations first-class for zh-CN", () => {
    const productImportModal = source(
      "../components/admin/product-import-review-modal.tsx"
    );

    assert.match(
      productImportModal,
      /Description 中文/
    );
    assert.match(
      productImportModal,
      /"zh-CN":\s*\{[\s\S]*?description:\s*descriptionZhCn/
    );
    assert.match(
      source("../app/api/admin/review-tasks/[id]/route.ts"),
      /descriptionZhCn:\s*body\.descriptionZhCn/
    );
    assert.match(
      source("../app/api/admin/review-tasks/[id]/route.ts"),
      /titleZhCn:\s*body\.titleZhCn/
    );
    assert.match(
      source("../app/api/admin/review-tasks/[id]/route.ts"),
      /translations:\s*translationsFromBody\(body\.translations\)/
    );
    assert.match(
      source("../app/api/admin/products/[id]/route.ts"),
      /descriptionZhCn:\s*body\.descriptionZhCn/
    );
    assert.match(
      source("../app/api/admin/products/imports/route.ts"),
      /translations:\s*translationsFromBody\(body\.translations\)/
    );
    assert.match(
      source("../lib/admin-product-writes.ts"),
      /\["zh-CN", input\.titleZhCn, input\.descriptionZhCn\]/
    );
    assert.match(
      source("../lib/admin-products.ts"),
      /\["zh-CN", legacy\.titleZhCn, legacy\.descriptionZhCn\]/
    );
    assert.match(
      source("../lib/admin-products.ts"),
      /descriptionZhCn[\s\S]*titleZhCn[\s\S]*update public\.product_imports/
    );
    assert.match(
      source("../lib/admin-product-imports.ts"),
      /descriptionZhCn/
    );
    assert.match(
      source("../scripts/scrape-manufacturer-products.ts"),
      /targetLocale:\s*"zh-CN"/
    );
    assert.match(
      source("../scripts/scrape-manufacturer-products.ts"),
      /translations:\s*product\.translations/
    );
    assert.match(
      source("../lib/product-fact-correction.ts"),
      /Do not generate translated titles or descriptions here/
    );
    assert.match(
      source("../lib/product-fact-correction.ts"),
      /outputLocaleMode:\s*"canonical_internal_only"/
    );
  });

  it("keeps product copy AI output single-locale", () => {
    const productCopy = source("../lib/product-copy-translation.ts");

    assert.match(
      productCopy,
      /Return exactly one root JSON object with keys: title, description, notes/
    );
    assert.match(productCopy, /outputLocaleMode:\s*"single_display_locale"/);
    assert.doesNotMatch(productCopy, /legacy_bilingual_en_th/);
    assert.doesNotMatch(
      productCopy,
      /Return exactly one root JSON object with keys: titleEn, titleTh/
    );
    assert.doesNotMatch(productCopy, /parsed\.titleEn/);
    assert.doesNotMatch(productCopy, /parsed\.titleTh/);
    assert.doesNotMatch(productCopy, /parsed\.descriptionEn/);
    assert.doesNotMatch(productCopy, /parsed\.descriptionTh/);
  });

  it("keeps admin AI prose locale-aware for zh-CN", () => {
    const supplementDose = source("../lib/supplement-dose-suggestion.ts");
    const supplementRoute = source("../app/api/admin/supplements/suggest-dose/route.ts");
    const supplementView = source("../components/admin/supplement-view.tsx");
    const foodReview = source("../lib/food-review-suggestion.ts");

    assert.match(supplementDose, /"zh-CN": "Simplified Chinese"/);
    assert.match(supplementDose, /outputLocaleMode:\s*"single_display_locale"/);
    assert.match(supplementRoute, /locale:\s*localeValue\(body\.locale\)/);
    assert.match(supplementView, /locale,\s*\n\s*primaryUseCase/);
    assert.match(foodReview, /"zh-CN": "Simplified Chinese"/);
    assert.match(
      foodReview,
      /Do not return localized maps or parallel English\/Thai\/Chinese copies/
    );
  });

  it("keeps Thai script out of explicit zh-CN static copy", () => {
    const leaks = customerCopyFiles.flatMap((path) =>
      zhCnStringValues(path)
        .filter((value) => /[\u0E00-\u0E7F]/.test(value))
        .map((value) => `${path}: ${value}`)
    );

    assert.deepEqual(leaks, []);
    assert.doesNotMatch(
      source("../components/admin/dashboard-content.zh-CN.json"),
      /[\u0E00-\u0E7F]/
    );
  });

  it("keeps Chinese formulation fallbacks out of Thai and English branches", () => {
    const formulation = source("../components/formulation-results.tsx");

    assert.match(formulation, /locale === "zh-CN"[\s\S]*?食物层面支持/);
    assert.match(formulation, /locale === "zh-CN"[\s\S]*?copy\.formulaSignedPrefix/);
    assert.doesNotMatch(
      formulation,
      /locale === "en"[\s\S]{0,120}:[\s\n]*`\$\{copy\.formulaSignedPrefix\}สำหรับ/
    );
  });
});
