import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("admin dashboard has a registry-driven locale switcher that preserves dashboard state", () => {
  const shared = source("components/admin/dashboard-shared.tsx");
  const dashboard = source("components/admin-dashboard.tsx");

  assert.match(shared, /export function AdminLocaleSwitcher/);
  assert.match(shared, /publicLocales\.map/);
  assert.match(shared, /adminHref\(localeCode, accessToken, range, view, filters/);
  assert.match(shared, /reviewTaskId/);
  assert.match(shared, /taskId/);
  assert.match(dashboard, /<AdminLocaleSwitcher/);
});

test("legacy admin dashboard URL is an English compatibility alias", () => {
  const page = source("app/admin/dashboard/page.tsx");

  assert.match(page, /redirect\(`\/en\/admin\/dashboard/);
  assert.match(page, /params\.append/);
  assert.match(page, /params\.toString\(\)/);
});

test("bare admin URLs redirect to the localized dashboard", () => {
  const localized = source("app/[locale]/admin/page.tsx");
  const legacy = source("app/admin/page.tsx");

  assert.match(localized, /isLocale\(rawLocale\)/);
  assert.match(localized, /redirect\(dashboardAliasUrl\(rawLocale, query\)\)/);
  assert.match(localized, /`\/\$\{locale\}\/admin\/dashboard/);
  assert.match(legacy, /redirect\(`\/en\/admin\/dashboard/);
  assert.match(legacy, /params\.append/);
});

test("admin Chinese label overrides cover the expanded admin UI contract", () => {
  const zh = JSON.parse(
    source("components/admin/dashboard-content.zh-CN.json")
  ) as {
    adminLanguage?: string;
    communications?: Record<string, string>;
    visibility?: Record<string, string>;
  };

  assert.equal(zh.adminLanguage, "管理语言");
  assert.equal(zh.communications?.retryError, "无法重试此消息。");

  for (const key of [
    "agentSeen",
    "agentSession",
    "disconnected",
    "heartbeatStale",
    "leaseExpired",
    "liveUpdates",
    "noWorkerHeartbeat",
    "reservation",
    "runtime"
  ]) {
    assert.equal(typeof zh.visibility?.[key], "string", key);
    assert.notEqual(zh.visibility?.[key], "");
  }
});

function thaiAdminContentSource() {
  const contentSource = source("components/admin/dashboard-content.tsx");
  const start = contentSource.indexOf("  th: {");

  assert.notEqual(start, -1);

  return contentSource.slice(start);
}

function englishAdminContentSource() {
  const contentSource = source("components/admin/dashboard-content.tsx");
  const start = contentSource.indexOf("  en: {");
  const end = contentSource.indexOf("  th: {");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return contentSource.slice(start, end);
}

test("English admin performance navigation renders English labels", () => {
  const english = englishAdminContentSource();

  assert.match(english, /name: "Dashboard", view: "glance"/);
  assert.match(english, /name: "Conversions", view: "flow"/);
  assert.match(english, /name: "Financials", view: "financials"/);
  assert.match(english, /flowTitle: "Conversions"/);
  assert.match(english, /insightsTitle: "Insights"/);
  assert.doesNotMatch(english, /name: "(แดชบอร์ด|คอนเวอร์ชัน|การเงิน)"/);
  assert.doesNotMatch(english, /flowTitle: "คอนเวอร์ชัน"/);
  assert.doesNotMatch(english, /insightsTitle: "อินไซต์"/);
});

test("Thai admin nav and page titles do not leak English performance labels", () => {
  const thai = thaiAdminContentSource();

  assert.match(thai, /name: "แดชบอร์ด", view: "glance"/);
  assert.match(thai, /name: "คอนเวอร์ชัน", view: "flow"/);
  assert.match(thai, /name: "การเงิน", view: "financials"/);
  assert.match(thai, /financials: "การเงิน"/);
  assert.match(thai, /flow: "คอนเวอร์ชัน"/);
  assert.match(thai, /glance: "แดชบอร์ด"/);
  assert.doesNotMatch(
    thai,
    /name: "(Dashboard|Conversions|Financials)", view: "(glance|flow|financials)"/
  );
  assert.doesNotMatch(thai, /financials: "Financials"/);
  assert.doesNotMatch(thai, /flow: "Conversions"/);
  assert.doesNotMatch(thai, /glance: "Dashboard"/);
});

test("Thai admin navigation labels are localized for all top-level sections", () => {
  const thai = thaiAdminContentSource();

  assert.match(thai, /insightsTitle: "อินไซต์"/);
  assert.match(thai, /name: "งาน", view: "visibility"/);
  assert.match(thai, /name: "เอเจนต์", view: "agents"/);
  assert.match(thai, /agents: "เอเจนต์"/);
  assert.match(thai, /visibility: "งาน"/);
  assert.doesNotMatch(thai, /name: "(Dashboard|Conversions|Financials|Tasks|Agents)"/);
  assert.doesNotMatch(thai, /insightsTitle: "Insights"/);
  assert.doesNotMatch(thai, /agents: "Agents"/);
  assert.doesNotMatch(thai, /visibility: "Tasks"/);
});

test("known admin English literals are routed through locale-aware labels", () => {
  const dashboard = source("components/admin-dashboard.tsx");
  const productView = source("components/admin/product-view.tsx");

  assert.doesNotMatch(dashboard, /Live ·/);
  assert.doesNotMatch(dashboard, /Unable to retry this message\./);
  assert.doesNotMatch(dashboard, /"Human" : "Agent"/);
  assert.doesNotMatch(productView, /label: "Products"/);
  assert.doesNotMatch(productView, /placeholder="Search products, brands, ingredients, aliases"/);
  assert.doesNotMatch(productView, />All states</);
  assert.doesNotMatch(productView, /Source title:/);
  assert.doesNotMatch(productView, /aria-label="Correct facts with AI"/);
  assert.doesNotMatch(productView, />Product name</);
  assert.doesNotMatch(productView, />Parsed facts</);
  assert.doesNotMatch(productView, />Offers</);
  assert.doesNotMatch(productView, />Approve</);
  assert.doesNotMatch(productView, />Save</);
  assert.doesNotMatch(productView, /placeholder="Ingredient"/);
  assert.doesNotMatch(productView, /placeholder="Offer URL"/);

  const reviewQueue = source("components/admin/review-queue-view.tsx");
  assert.doesNotMatch(reviewQueue, />Review nutrition safety for plan</);
  assert.doesNotMatch(reviewQueue, /"Review whether this food can be shown/);
  assert.doesNotMatch(reviewQueue, /placeholder="Ingredient"/);
  assert.doesNotMatch(reviewQueue, />Select product</);
});

test("admin typography has locale-aware spacing for Chinese and Thai labels", () => {
  const shared = source("components/admin/dashboard-shared.tsx");
  const dashboard = source("components/admin-dashboard.tsx");
  const filters = source("components/admin/dashboard-filters.tsx");
  const previewPage = source("app/[locale]/admin/content/preview/[id]/page.tsx");

  assert.match(shared, /adminLocaleTextClass/);
  assert.match(shared, /locale === "zh-CN"/);
  assert.match(shared, /tracking-normal/);
  assert.match(dashboard, /adminLocaleTextClass\(locale, "heading"\)/);
  assert.match(filters, /adminLocaleTextClass\(locale, "label"\)/);
  assert.match(previewPage, /adminContentPreviewCopy/);
  assert.doesNotMatch(previewPage, /function previewCta/);
});

test("admin DB object titles are rendered through localized translation helpers", () => {
  const displayHelper = source("lib/admin-localized-display.ts");
  const productView = source("components/admin/product-view.tsx");
  const supplementView = source("components/admin/supplement-view.tsx");
  const foodView = source("components/admin/safety-views.tsx");
  const reviewQueue = source("components/admin/review-queue-view.tsx");
  const insights = source("lib/admin-recommendation-insights.ts");
  const dashboardPage = source("app/[locale]/admin/dashboard/page.tsx");
  const dashboard = source("components/admin-dashboard.tsx");

  assert.match(displayHelper, /export function adminLocalizedProductText/);
  assert.match(displayHelper, /export function adminLocalizedSupplementText/);
  assert.match(displayHelper, /export function adminLocalizedFoodText/);
  assert.match(displayHelper, /fallbackUsed/);

  assert.match(productView, /adminLocalizedProductText\(row, locale\)/);
  assert.match(productView, /adminLocalizedProductText\(draft, locale\)/);
  assert.match(productView, /LocalizedFallbackBadge/);

  assert.match(supplementView, /adminLocalizedSupplementText\(row, locale\)/);
  assert.match(supplementView, /adminLocalizedSupplementText\(draft, locale\)/);
  assert.match(supplementView, /supplementSearchText\(labels, row, locale\)/);

  assert.match(foodView, /adminLocalizedFoodText\(row, locale\)/);
  assert.match(foodView, /adminLocalizedFoodText\(draft, locale\)/);
  assert.match(foodView, /foodSearchText\(row, locale\)/);

  assert.match(reviewQueue, /function reviewDisplayName/);
  assert.match(reviewQueue, /adminLocalizedProductText\(product, locale\)/);
  assert.match(reviewQueue, /adminLocalizedSupplementText\(supplement, locale\)/);
  assert.match(reviewQueue, /adminLocalizedFoodText\(food, locale\)/);
  assert.match(dashboard, /foodsData=\{foodsData\}/);

  assert.match(dashboardPage, /getAdminRecommendationInsightsData\(\s*range,\s*locale\s*\)/);
  assert.match(insights, /left join public\.product_translations/);
  assert.match(insights, /left join public\.supplement_translations/);
  assert.match(insights, /product_translations\.locale = \$\{locale\}/);
  assert.match(insights, /supplement_translations\.locale = \$\{locale\}/);
});
