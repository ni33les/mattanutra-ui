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
