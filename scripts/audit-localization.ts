import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { getLandingPageCopy } from "@/components/landing-page-copy";
import { closeSqlPool, getSql } from "@/lib/db";
import { publicLocales, siteLocaleRegistry } from "@/lib/i18n";
import { catalogIntegrityReport } from "@/lib/i18n-messages";
import {
  getSeoRouteCopy,
  indexableSeoRouteKeys,
  localizedRouteMetadata,
  localizedSeoStaticSitemapEntries,
  seoRouteKeys
} from "@/lib/seo";

const SOURCE_DIRS = ["app", "components", "lib"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const LOCALE_BRANCH_PATTERN =
  /\b(?:locale|row\.locale|context\.customer\.locale|result\.locale|input\.locale)\s*(?:={2,3}|!==)\s*["'](?:th|zh-CN)["']|["'](?:th|zh-CN)["']\s*={2,3}\s*(?:locale|row\.locale|context\.customer\.locale|result\.locale|input\.locale)\b/g;
const LEGACY_NAMESPACE_PATTERN =
  /\b(?:registerMessageNamespace|defineLocaleBundle|resolveLocaleCopy|getMessages)\b/g;
const DOCUMENTED_LOCALE_BRANCH_ALLOWLIST: Readonly<Record<string, string>> = {
  "app/[locale]/nutrition/payment/checkout/page.tsx":
    "Locale branch selects Intl currency formatting locale; visible checkout labels resolve through catalog IDs.",
  "app/[locale]/order/track/[token]/page.tsx":
    "Locale branch is typography-only for private order tracking labels.",
  "components/admin/content-view.tsx":
    "Locale branches classify content rows and filters; visible content labels come from admin copy.",
  "components/admin/dashboard-shared.tsx":
    "Locale branches choose typography, Intl locale codes, and route-safe formatting.",
  "components/admin/product-view-helpers.ts":
    "Locale branches choose Intl locale codes and legacy DB fallback fields.",
  "components/admin/product-view-ui.tsx":
    "Locale branches update locale-specific DB translation fields.",
  "components/admin/recommendation-insights-view.tsx":
    "Locale branch selects an Intl locale code for numeric display.",
  "components/admin/review-queue-helpers.ts":
    "Locale branches build localized DB draft maps rather than render copy directly.",
  "components/formulation-results-panels.tsx":
    "Locale branch is English-only emphasis/presentation around already-localized reveal copy.",
  "components/formulation-reveal-copy.ts":
    "Remaining locale branches validate script fit and count formatting; reveal copy and labels resolve through catalog IDs.",
  "components/formulation-support-helpers.ts":
    "Locale branches normalize Chinese dosage terms and script fit, with visible fallbacks namespaced.",
  "components/healthspan-logo.tsx":
    "Locale branch changes logo typography only.",
  "components/nutrition-flow/healthscore-panel.tsx":
    "Locale branches validate script fit for AI/page copy.",
  "lib/admin-localized-display.ts":
    "Locale branches are fallback metadata/source-locale resolution; missing-translation label is namespaced.",
  "lib/access-principal.ts":
    "Locale branches normalize stored person and organisation locale preferences.",
  "lib/blog.ts":
    "Locale branches perform compatibility cleanup for existing Thai DB-published content.",
  "lib/example-email.ts":
    "Locale branch selects CJK email typography only.",
  "lib/health-score/v4-copy.ts":
    "Remaining locale branch controls list punctuation only; deterministic HealthScore text resolves through catalog IDs.",
  "lib/health-score/v4.ts":
    "Remaining locale branches control casing and grammar values passed into catalog messages.",
  "lib/i18n.ts":
    "Locale branches are locale registry and normalizer internals.",
  "lib/i18n-messages.ts":
    "Locale branches are internal catalog resolver mechanics; visible copy is loaded by stable catalog ID.",
  "lib/product-copy-translation.ts":
    "Locale branches map AI translation output into legacy product translation columns.",
  "lib/reassessment-email.ts":
    "Locale branch selects CJK email typography only.",
  "lib/retail-product-checkout.ts":
    "Locale branch maps app locale to checkout provider language codes.",
  "lib/task-result-payloads.ts":
    "Locale branches infer reply locale from user message script before resolving outbound namespace copy."
};
const MACHINE_ONLY_ALLOWLIST = [
  "DB enum values",
  "logs and diagnostics",
  "test names",
  "CSS class names",
  "event names",
  "route paths",
  "SQL identifiers",
  "model prompts that are internal instructions"
] as const;

type StaticFinding = Readonly<{
  file: string;
  issue: string;
}>;

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function localeValuesSql() {
  return publicLocales.map((locale) => `(${sqlLiteral(locale)})`).join(", ");
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      return entry.isDirectory() ? filesUnder(path) : [path];
    })
  );

  return groups
    .flat()
    .filter((file) => SOURCE_EXTENSIONS.has(extname(file)));
}

async function sourceFiles() {
  const groups = await Promise.all(
    SOURCE_DIRS.map(async (dir) => {
      try {
        return await filesUnder(dir);
      } catch {
        return [];
      }
    })
  );

  return groups.flat().sort();
}

function documentedLocaleBranchAllowlist() {
  return Object.entries(DOCUMENTED_LOCALE_BRANCH_ALLOWLIST)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([file, reason]) => ({ file, reason }));
}

async function staticVisibleCopyAudit() {
  const findings: StaticFinding[] = [];

  for (const file of await sourceFiles()) {
    const relativePath = relative(process.cwd(), file);
    const source = await readFile(file, "utf8");
    const hasLocaleBranch = LOCALE_BRANCH_PATTERN.test(source);
    LOCALE_BRANCH_PATTERN.lastIndex = 0;

    if (
      hasLocaleBranch &&
      !Object.hasOwn(DOCUMENTED_LOCALE_BRANCH_ALLOWLIST, relativePath)
    ) {
      findings.push({
        file: relativePath,
        issue:
          "Locale-specific branch must move visible copy into a registered i18n namespace or be documented as internal formatting/routing/DB mechanics."
      });
    }
  }

  return {
    documentedLocaleBranchFiles: documentedLocaleBranchAllowlist(),
    machineOnlyAllowlist: MACHINE_ONLY_ALLOWLIST,
    findings,
    status: findings.length > 0 ? "needs_attention" : "ok"
  };
}

async function legacyNamespaceAudit() {
  const findings: StaticFinding[] = [];

  for (const file of await sourceFiles()) {
    const relativePath = relative(process.cwd(), file);

    if (relativePath === "lib/i18n-messages.ts") {
      continue;
    }

    const source = await readFile(file, "utf8");
    const hasLegacyNamespaceHelper = LEGACY_NAMESPACE_PATTERN.test(source);
    LEGACY_NAMESPACE_PATTERN.lastIndex = 0;

    if (hasLegacyNamespaceHelper) {
      findings.push({
        file: relativePath,
        issue:
          "Runtime visible copy must resolve through catalog IDs, not legacy locale bundle helpers."
      });
    }
  }

  return {
    findings,
    status: findings.length > 0 ? "needs_attention" : "ok"
  };
}

async function generatedTypesAudit() {
  const expected = `import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };

export type SourceMessageCatalog = typeof sourceCatalog;
export type MessageId = keyof SourceMessageCatalog;
export type MessageDescriptor = SourceMessageCatalog[MessageId];
export type MessageNamespace = MessageDescriptor["namespace"];
export type MessageAudience = MessageDescriptor["audience"];
export type MessageSurface = MessageDescriptor["surface"];

export type MessageValue = string | number | bigint | boolean | Date | null | undefined;
export type MessageValues = Readonly<Record<string, MessageValue>>;

export const sourceMessageCatalog = sourceCatalog;
export const messageIds = Object.keys(sourceCatalog).sort() as MessageId[];
`;
  const actual = await readFile("content/i18n/generated.ts", "utf8");
  const findings =
    actual === expected
      ? []
      : [{
          file: "content/i18n/generated.ts",
          issue: "Generated i18n types are out of date. Run npm run i18n:generate."
        }];

  return {
    findings,
    status: findings.length > 0 ? "needs_attention" : "ok"
  };
}

function seoMetadataAudit() {
  const findings: StaticFinding[] = [];
  const indexableRouteSet = new Set<string>(indexableSeoRouteKeys);
  const sitemapUrls = new Set(
    localizedSeoStaticSitemapEntries(new Date("2026-01-01T00:00:00.000Z"))
      .map((entry) => entry.url)
  );

  for (const locale of publicLocales) {
    for (const routeKey of seoRouteKeys) {
      const route = getSeoRouteCopy(routeKey, locale);

      if (!route.title.trim() || !route.description.trim()) {
        findings.push({
          file: "lib/seo.ts",
          issue: `${locale}.${routeKey} is missing a localized SEO title or description.`
        });
      }

      const metadata = localizedRouteMetadata({ locale, routeKey });
      const shouldIndex = route.indexable && indexableRouteSet.has(routeKey);

      if (shouldIndex) {
        if (!metadata.alternates) {
          findings.push({
            file: "lib/seo.ts",
            issue: `${locale}.${routeKey} is indexable but has no alternates/hreflang metadata.`
          });
        }

        if (
          metadata.alternates &&
          !sitemapUrls.has(new URL(String(metadata.alternates.canonical)).href)
        ) {
          findings.push({
            file: "app/sitemap.ts",
            issue: `${locale}.${routeKey} canonical URL is missing from the static localized sitemap.`
          });
        }
      } else {
        const robots = metadata.robots;

        if (
          typeof robots !== "object" ||
          robots === null ||
          !("index" in robots) ||
          robots.index !== false
        ) {
          findings.push({
            file: "lib/seo.ts",
            issue: `${locale}.${routeKey} should be noindex but did not resolve robots.index=false.`
          });
        }
      }
    }
  }

  const forbiddenSitemapFragments = [
    "/admin",
    "/basket/checkout",
    "/basket/return",
    "/nutrition/payment",
    "/order/track"
  ];
  for (const url of sitemapUrls) {
    if (forbiddenSitemapFragments.some((fragment) => url.includes(fragment))) {
      findings.push({
        file: "app/sitemap.ts",
        issue: `Sitemap contains private or non-canonical route ${url}.`
      });
    }
  }

  return {
    findings,
    indexableRouteKeys: indexableSeoRouteKeys,
    routeKeys: seoRouteKeys,
    status: findings.length > 0 ? "needs_attention" : "ok"
  };
}

function homepageSeedAudit() {
  return publicLocales.map((locale) => {
    const copy = getLandingPageCopy(locale);

    return {
      blogCards: copy.journal.fallback.length,
      locale,
      questionnaireSections: copy.questionnaire.sections.length,
      testimonialCards: copy.results.fallback.length
    };
  });
}

async function dbCoverageAudit() {
  const sql = getSql();

  if (!sql) {
    return {
      reason: "DB_URL is not configured",
      status: "skipped"
    };
  }

  const localeRows = localeValuesSql();

  try {
    const [
      products,
      supplements,
      blogs,
      testimonials,
      homepageBlogs,
      homepageTestimonials
    ] = await Promise.all([
      sql.unsafe<Array<{
        complete: number;
        locale: string;
        total: number;
        translated: number;
      }>>(`
        with locales(code) as (values ${localeRows})
        select
          locales.code as locale,
          count(products.id)::int as total,
          count(translations.product_id)::int as translated,
          count(*) filter (
            where translations.status = 'complete'
              and nullif(btrim(translations.title), '') is not null
              and nullif(btrim(translations.description), '') is not null
          )::int as complete
        from locales
        cross join public.products products
        left join public.product_translations translations
          on translations.product_id = products.id
         and translations.locale = locales.code
        group by locales.code
        order by locales.code
      `),
      sql.unsafe<Array<{
        complete: number;
        locale: string;
        total: number;
        translated: number;
      }>>(`
        with locales(code) as (values ${localeRows})
        select
          locales.code as locale,
          count(supplements.id)::int as total,
          count(translations.supplement_id)::int as translated,
          count(*) filter (
            where translations.status = 'complete'
              and nullif(btrim(translations.name), '') is not null
          )::int as complete
        from locales
        cross join public.supplements supplements
        left join public.supplement_translations translations
          on translations.supplement_id = supplements.id
         and translations.locale = locales.code
        group by locales.code
        order by locales.code
      `),
      sql.unsafe<Array<{
        locale: string;
        publishedGroups: number;
        translated: number;
      }>>(`
        with locales(code) as (values ${localeRows}),
        groups as (
          select distinct translation_group_id
          from public.blog_posts
          where status = 'published'
        )
        select
          locales.code as locale,
          count(groups.translation_group_id)::int as "publishedGroups",
          count(posts.id)::int as translated
        from locales
        cross join groups
        left join public.blog_posts posts
          on posts.translation_group_id = groups.translation_group_id
         and posts.locale = locales.code
         and posts.status = 'published'
        group by locales.code
        order by locales.code
      `),
      sql.unsafe<Array<{
        locale: string;
        publishedGroups: number;
        translated: number;
      }>>(`
        with locales(code) as (values ${localeRows}),
        groups as (
          select distinct translation_group_id
          from public.testimonials
          where status = 'published'
        )
        select
          locales.code as locale,
          count(groups.translation_group_id)::int as "publishedGroups",
          count(testimonials.id)::int as translated
        from locales
        cross join groups
        left join public.testimonials testimonials
          on testimonials.translation_group_id = groups.translation_group_id
         and testimonials.locale = locales.code
         and testimonials.status = 'published'
        group by locales.code
        order by locales.code
      `),
      sql.unsafe<Array<{
        locale: string;
        rows: number;
      }>>(`
        with locales(code) as (values ${localeRows})
        select
          locales.code as locale,
          count(posts.id)::int as rows
        from locales
        left join public.blog_posts posts
          on posts.locale = locales.code
         and posts.status = 'published'
         and posts.metadata->>'homepageVersion' = 'v15'
        group by locales.code
        order by locales.code
      `),
      sql.unsafe<Array<{
        locale: string;
        rows: number;
      }>>(`
        with locales(code) as (values ${localeRows})
        select
          locales.code as locale,
          count(testimonials.id)::int as rows
        from locales
        left join public.testimonials testimonials
          on testimonials.locale = locales.code
         and testimonials.status = 'published'
         and testimonials.metadata->>'homepageVersion' = 'v15'
        group by locales.code
        order by locales.code
      `)
    ]);

    return {
      blogs,
      homepageBlogs,
      homepageTestimonials,
      products,
      status: "ok",
      supplements,
      testimonials
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      status: "error"
    };
  } finally {
    await closeSqlPool();
  }
}

const staticAudit = await staticVisibleCopyAudit();
const catalogAudit = catalogIntegrityReport();
const generatedTypes = await generatedTypesAudit();
const legacyNamespace = await legacyNamespaceAudit();
const seoAudit = seoMetadataAudit();
const dbCoverage = await dbCoverageAudit();
const report = {
  catalogAudit,
  dbCoverage,
  generatedAt: new Date().toISOString(),
  generatedTypes,
  homepageSeed: homepageSeedAudit(),
  legacyNamespace,
  locales: siteLocaleRegistry,
  seoAudit,
  staticAudit
};

console.log(JSON.stringify(report, null, 2));

if (staticAudit.findings.length > 0) {
  process.exitCode = 1;
}

if (catalogAudit.findings.length > 0) {
  process.exitCode = 1;
}

if (generatedTypes.findings.length > 0) {
  process.exitCode = 1;
}

if (legacyNamespace.findings.length > 0) {
  process.exitCode = 1;
}

if (seoAudit.findings.length > 0) {
  process.exitCode = 1;
}

if (process.argv.includes("--strict-db") && dbCoverage.status === "error") {
  process.exitCode = 1;
}
