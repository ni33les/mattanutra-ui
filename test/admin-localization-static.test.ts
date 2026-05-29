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

test("admin access management exposes people, organisations, agents, and audit as separate tabs", () => {
  const content = source("components/admin/dashboard-content.tsx");
  const dashboard = source("components/admin-dashboard.tsx");
  const accessView = source("components/admin/access-view.tsx");
  const zh = source("components/admin/dashboard-content.zh-CN.json");

  assert.doesNotMatch(content, /name: "Access", view: "access"/);
  assert.doesNotMatch(content, /name: "สิทธิ์เข้าถึง", view: "access"/);
  assert.doesNotMatch(zh, /"name": "访问",\s*"view": "access"/);
  assert.match(content, /name: "People", view: "people"/);
  assert.match(content, /name: "Organisations", view: "organisations"/);
  assert.match(content, /name: "Agents", view: "access-agents"/);
  assert.match(content, /name: "Audit", view: "audit"/);
  assert.match(content, /name: "Settings", view: "settings"/);
  assert.match(dashboard, /view === "access-agents"/);
  assert.match(dashboard, /view === "audit"/);
  assert.match(dashboard, /view === "settings"/);
  assert.match(accessView, /view === "access-agents"/);
  assert.match(accessView, /view === "audit"/);
});

test("admin settings owns profile and logout controls", () => {
  const dashboard = source("components/admin-dashboard.tsx");
  const settingsView = source("components/admin/settings-view.tsx");

  assert.doesNotMatch(dashboard, /AdminLogoutButton/);
  assert.match(settingsView, /AdminLogoutButton/);
  assert.match(settingsView, /action: "update_self"/);
  assert.match(settingsView, /labels\.settings\.profile/);
  assert.match(settingsView, /labels\.settings\.account/);
});

test("admin organisations hide type controls and expose only platform and retail roles", () => {
  const access = source("lib/admin-access.ts");
  const rbac = source("lib/admin-rbac.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");
  const content = source("components/admin/dashboard-content.tsx");

  assert.match(rbac, /AdminOrganisationType = "platform" \| "tenant"/);
  assert.match(rbac, /rolesForAdminOrganisationType/);
  assert.match(rbac, /platform_owner/);
  assert.match(rbac, /platform_admin/);
  assert.match(rbac, /retail_admin/);
  assert.match(rbac, /retail_agent/);
  assert.match(rbac, /retail_assistant/);
  assert.match(access, /adminRoleAllowedForOrganisationType/);
  assert.match(access, /Platform Admin cannot change Platform Owner users/);
  assert.match(access, /Platform Admin cannot grant Platform Owner access/);
  assert.match(access, /Platform Admin cannot change Platform Owner access/);
  assert.match(route, /type: "tenant"/);
  assert.match(view, /rolesForAdminOrganisationType/);
  assert.match(view, /platform_owner: "Platform Owner"/);
  assert.match(view, /platform_admin: "Platform Admin"/);
  assert.match(view, /retail_admin: "Retail Admin"/);
  assert.match(view, /retail_agent: "Retail Agent"/);
  assert.match(view, /retail_assistant: "Retail Assistant"/);

  assert.doesNotMatch(access, /metadata = jsonb_set/);
  assert.doesNotMatch(route, /body\.category|body\.type/);
  assert.doesNotMatch(view, /name="category"|name="type"|value="retailer"|value="tenant"/);
  assert.doesNotMatch(
    view,
    /Catalogue manager|Agent manager|Content manager|Finance viewer|Operations manager|Tenant admin|Tenant user|labels\.access\.tenant/
  );
  assert.doesNotMatch(content, /tenant: "Tenant"|retailer: "Retailer"/);
});

test("admin sidebar navigation preserves scroll position across menu clicks", () => {
  const shared = source("components/admin/dashboard-shared.tsx");

  assert.match(shared, /import Link from "next\/link"/);
  assert.match(shared, /ADMIN_SIDEBAR_SCROLL_KEY/);
  assert.match(shared, /sessionStorage\.setItem\(ADMIN_SIDEBAR_SCROLL_KEY/);
  assert.match(shared, /sessionStorage\.getItem\(ADMIN_SIDEBAR_SCROLL_KEY\)/);
  assert.match(shared, /scroll=\{false\}/);
  assert.match(shared, /onNavigate=\{rememberSidebarScroll\}/);
});

test("admin login has a working registry-driven locale switcher", () => {
  const login = source("components/admin-login.tsx");

  assert.match(login, /publicLocales\.map/);
  assert.match(login, /href=\{loginHref\(localeCode\)\}/);
  assert.match(login, /localizedAdminNextPath\(targetLocale, nextPath\)/);
  assert.match(login, /params\.set\("access_token", accessToken\)/);
  assert.match(login, /params\.set\("invite", inviteToken\)/);
  assert.match(login, /params\.set\("setup", "1"\)/);
  assert.match(login, /params\.set\("next", localizedAdminNextPath/);
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
    settings?: Record<string, string>;
    communications?: Record<string, string>;
    visibility?: Record<string, string>;
  };

  assert.equal(zh.adminLanguage, "管理语言");
  assert.equal(zh.communications?.retryError, "无法重试此消息。");
  assert.equal(zh.settings?.profile, "个人资料");
  assert.equal(zh.settings?.account, "账户");

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
