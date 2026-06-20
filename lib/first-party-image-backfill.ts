import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJsonValue } from "@/lib/assessment-store";
import { closeSqlPool, getSql } from "@/lib/db";
import {
  imageUrlHost,
  isExternalRuntimeImageUrl,
  isFirstPartyImageUrl,
  normalizeRuntimeImageUrl
} from "@/lib/first-party-image-rules";
import {
  firstPartyImageStorageConfigFromEnv,
  mirrorImageToFirstParty,
  type FirstPartyImageEnvironment,
  type FirstPartyImageMirrorMetadata,
  type FirstPartyImageStorageConfig
} from "@/lib/first-party-image-mirror";

type Sql = NonNullable<ReturnType<typeof getSql>>;

export type FirstPartyImageBackfillRow = Readonly<{
  column: string;
  detail: string | null;
  host: string | null;
  id: string;
  newUrl: string | null;
  oldUrl: string | null;
  status:
    | "dry_run"
    | "failed"
    | "mirrored"
    | "skipped_first_party"
    | "skipped_limit";
  storageKey: string | null;
  table: "blog_posts" | "product_imports" | "products" | "testimonials";
}>;

export type FirstPartyImageBackfillReport = Readonly<{
  applied: boolean;
  byHost: Record<string, number>;
  checked: number;
  dryRun: boolean;
  dryRunCandidates: number;
  environment: FirstPartyImageEnvironment;
  failed: number;
  generatedAt: string;
  mirrored: number;
  rows: FirstPartyImageBackfillRow[];
  skippedFirstParty: number;
  skippedLimit: number;
  updatedRows: number;
}>;

export type RunFirstPartyImageBackfillInput = Readonly<{
  apply?: boolean;
  config?: FirstPartyImageStorageConfig | null;
  delayMs?: number;
  environment: FirstPartyImageEnvironment;
  limit?: number;
  outputPath?: string | null;
}>;

type MutableReport = {
  applied: boolean;
  byHost: Record<string, number>;
  checked: number;
  dryRun: boolean;
  dryRunCandidates: number;
  environment: FirstPartyImageEnvironment;
  failed: number;
  generatedAt: string;
  mirrored: number;
  rows: FirstPartyImageBackfillRow[];
  skippedFirstParty: number;
  skippedLimit: number;
  updatedRows: number;
};

type RemainingBudget = {
  value: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueTextValues(values: readonly (string | null | undefined)[]) {
  return [...new Set(values
    .map((value) => normalizeRuntimeImageUrl(value))
    .filter((value): value is string => Boolean(value)))];
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function appendMirrorArray(
  value: unknown,
  key: string,
  mirrors: readonly FirstPartyImageMirrorMetadata[]
) {
  const record = recordFromUnknown(value);

  return {
    ...record,
    [key]: [
      ...metadataArray(record[key]),
      ...mirrors
    ]
  };
}

function mergeImageMirrors(
  value: unknown,
  mirrors: Record<string, FirstPartyImageMirrorMetadata>
) {
  const record = recordFromUnknown(value);
  const existing = recordFromUnknown(record.imageMirrors);

  return {
    ...record,
    imageMirrors: {
      ...existing,
      ...mirrors
    }
  };
}

function hostKey(value: string | null | undefined) {
  return imageUrlHost(value) ?? (value?.startsWith("/") ? "local" : "invalid");
}

function countUrl(report: MutableReport, value: string | null | undefined) {
  report.checked += 1;
  const host = hostKey(value);

  report.byHost[host] = (report.byHost[host] ?? 0) + 1;
}

function addRow(report: MutableReport, row: FirstPartyImageBackfillRow) {
  report.rows.push(row);

  if (row.status === "dry_run") {
    report.dryRunCandidates += 1;
  } else if (row.status === "failed") {
    report.failed += 1;
  } else if (row.status === "mirrored") {
    report.mirrored += 1;
  } else if (row.status === "skipped_first_party") {
    report.skippedFirstParty += 1;
  } else if (row.status === "skipped_limit") {
    report.skippedLimit += 1;
  }
}

function externalBudgetAvailable(
  report: MutableReport,
  remaining: RemainingBudget,
  row: Omit<FirstPartyImageBackfillRow, "detail" | "newUrl" | "status" | "storageKey">
) {
  if (remaining.value > 0) {
    remaining.value -= 1;
    return true;
  }

  addRow(report, {
    ...row,
    detail: "Skipped because --limit was reached.",
    newUrl: null,
    status: "skipped_limit",
    storageKey: null
  });
  return false;
}

async function mirrorExternalUrl(input: Readonly<{
  column: string;
  config: FirstPartyImageStorageConfig | null;
  delayMs: number;
  entityId: string;
  environment: FirstPartyImageEnvironment;
  evidenceUrl?: string | null;
  namespace: string;
  report: MutableReport;
  table: FirstPartyImageBackfillRow["table"];
  url: string;
}>) {
  try {
    const result = await mirrorImageToFirstParty({
      config: input.config,
      entityId: input.entityId,
      environment: input.environment,
      evidenceUrl: input.evidenceUrl,
      imageUrl: input.url,
      namespace: input.namespace,
      required: true,
      source: `${input.table}.${input.column}`
    });

    if (!result.url || !result.metadata) {
      throw new Error("Mirror did not return a stored first-party URL.");
    }

    addRow(input.report, {
      column: input.column,
      detail: null,
      host: imageUrlHost(input.url),
      id: input.entityId,
      newUrl: result.url,
      oldUrl: input.url,
      status: "mirrored",
      storageKey: result.metadata.storedKey,
      table: input.table
    });
    await sleep(input.delayMs);

    return result;
  } catch (error) {
    addRow(input.report, {
      column: input.column,
      detail: error instanceof Error ? error.message : String(error),
      host: imageUrlHost(input.url),
      id: input.entityId,
      newUrl: null,
      oldUrl: input.url,
      status: "failed",
      storageKey: null,
      table: input.table
    });

    return null;
  }
}

function classifyCandidate(input: Readonly<{
  column: string;
  id: string;
  report: MutableReport;
  table: FirstPartyImageBackfillRow["table"];
  url: string | null | undefined;
}>) {
  const normalized = normalizeRuntimeImageUrl(input.url);
  countUrl(input.report, input.url);

  if (!normalized) {
    addRow(input.report, {
      column: input.column,
      detail: "Image URL is empty or invalid.",
      host: hostKey(input.url),
      id: input.id,
      newUrl: null,
      oldUrl: input.url ?? null,
      status: "failed",
      storageKey: null,
      table: input.table
    });
    return null;
  }

  if (isFirstPartyImageUrl(normalized)) {
    addRow(input.report, {
      column: input.column,
      detail: null,
      host: hostKey(normalized),
      id: input.id,
      newUrl: normalized,
      oldUrl: normalized,
      status: "skipped_first_party",
      storageKey: null,
      table: input.table
    });
    return null;
  }

  if (!isExternalRuntimeImageUrl(normalized)) {
    addRow(input.report, {
      column: input.column,
      detail: "Image URL is not an HTTPS runtime URL.",
      host: hostKey(normalized),
      id: input.id,
      newUrl: null,
      oldUrl: normalized,
      status: "failed",
      storageKey: null,
      table: input.table
    });
    return null;
  }

  return normalized;
}

async function backfillProducts(input: Readonly<{
  config: FirstPartyImageStorageConfig | null;
  delayMs: number;
  environment: FirstPartyImageEnvironment;
  remaining: RemainingBudget;
  report: MutableReport;
  sql: Sql;
}>) {
  const rows = await input.sql<Array<{
    id: string;
    image_url: string | null;
    product_url: string | null;
    source_url: string | null;
    title: string;
  }>>`
    select id::text, title, image_url, product_url, source_url
    from public.products
    where image_url is not null
      and btrim(image_url) <> ''
    order by updated_at desc nulls last, title asc
  `;

  for (const row of rows) {
    const url = classifyCandidate({
      column: "image_url",
      id: row.id,
      report: input.report,
      table: "products",
      url: row.image_url
    });

    if (!url) {
      continue;
    }

    if (!externalBudgetAvailable(input.report, input.remaining, {
      column: "image_url",
      host: imageUrlHost(url),
      id: row.id,
      oldUrl: url,
      table: "products"
    })) {
      continue;
    }

    if (input.report.dryRun) {
      addRow(input.report, {
        column: "image_url",
        detail: null,
        host: imageUrlHost(url),
        id: row.id,
        newUrl: null,
        oldUrl: url,
        status: "dry_run",
        storageKey: null,
        table: "products"
      });
      continue;
    }

    const result = await mirrorExternalUrl({
      column: "image_url",
      config: input.config,
      delayMs: input.delayMs,
      entityId: row.id,
      environment: input.environment,
      evidenceUrl: row.source_url ?? row.product_url,
      namespace: "products",
      report: input.report,
      table: "products",
      url
    });

    if (!result?.url || !result.metadata) {
      continue;
    }

    await input.sql`
      update public.products
      set
        image_url = ${result.url},
        source_snapshot = coalesce(source_snapshot, '{}'::jsonb) ||
          ${input.sql.json(toJsonValue({
            productImageMirror: result.metadata
          }))}::jsonb,
        updated_at = now()
      where id = ${row.id}::uuid
    `;
    input.report.updatedRows += 1;
  }
}

async function backfillProductImports(input: Readonly<{
  config: FirstPartyImageStorageConfig | null;
  delayMs: number;
  environment: FirstPartyImageEnvironment;
  remaining: RemainingBudget;
  report: MutableReport;
  sql: Sql;
}>) {
  const rows = await input.sql<Array<{
    id: string;
    image_urls: string[] | null;
    product_title: string;
    raw_snapshot: unknown;
    source_url: string | null;
  }>>`
    select id::text, product_title, source_url, image_urls, raw_snapshot
    from public.product_imports
    where coalesce(cardinality(image_urls), 0) > 0
    order by updated_at desc nulls last, product_title asc
  `;

  for (const row of rows) {
    const sourceUrls = uniqueTextValues(row.image_urls ?? []);
    const mirroredUrls: string[] = [];
    const mirrors: FirstPartyImageMirrorMetadata[] = [];

    for (const sourceUrl of sourceUrls) {
      const url = classifyCandidate({
        column: "image_urls",
        id: row.id,
        report: input.report,
        table: "product_imports",
        url: sourceUrl
      });

      if (!url) {
        continue;
      }

      if (!externalBudgetAvailable(input.report, input.remaining, {
        column: "image_urls",
        host: imageUrlHost(url),
        id: row.id,
        oldUrl: url,
        table: "product_imports"
      })) {
        continue;
      }

      if (input.report.dryRun) {
        addRow(input.report, {
          column: "image_urls",
          detail: null,
          host: imageUrlHost(url),
          id: row.id,
          newUrl: null,
          oldUrl: url,
          status: "dry_run",
          storageKey: null,
          table: "product_imports"
        });
        continue;
      }

      const result = await mirrorExternalUrl({
        column: "image_urls",
        config: input.config,
        delayMs: input.delayMs,
        entityId: row.id,
        environment: input.environment,
        evidenceUrl: row.source_url,
        namespace: "product-imports",
        report: input.report,
        table: "product_imports",
        url
      });

      if (result?.url && result.metadata) {
        mirroredUrls.push(result.url);
        mirrors.push(result.metadata);
      }
    }

    if (input.report.dryRun || mirroredUrls.length < 1) {
      continue;
    }

    const nextImageUrls = [...new Set([...mirroredUrls, ...sourceUrls])];
    const nextRawSnapshot = appendMirrorArray(
      row.raw_snapshot,
      "productImageMirrors",
      mirrors
    );

    await input.sql`
      update public.product_imports
      set
        image_urls = ${nextImageUrls}::text[],
        raw_snapshot = ${input.sql.json(toJsonValue(nextRawSnapshot))}::jsonb,
        updated_at = now()
      where id = ${row.id}::uuid
    `;
    input.report.updatedRows += 1;
  }
}

async function backfillBlogPosts(input: Readonly<{
  config: FirstPartyImageStorageConfig | null;
  delayMs: number;
  environment: FirstPartyImageEnvironment;
  remaining: RemainingBudget;
  report: MutableReport;
  sql: Sql;
}>) {
  const rows = await input.sql<Array<{
    id: string;
    image_url: string | null;
    metadata: unknown;
    social_image_url: string | null;
    source_ref: string | null;
    title: string;
  }>>`
    select id::text, title, image_url, social_image_url, source_ref, metadata
    from public.blog_posts
    where (image_url is not null and btrim(image_url) <> '')
       or (social_image_url is not null and btrim(social_image_url) <> '')
    order by updated_at desc nulls last, title asc
  `;

  for (const row of rows) {
    let nextImageUrl = row.image_url;
    let nextSocialImageUrl = row.social_image_url;
    const mirrors: Record<string, FirstPartyImageMirrorMetadata> = {};

    for (const field of [
      ["image_url", row.image_url, "imageUrl"],
      ["social_image_url", row.social_image_url, "socialImageUrl"]
    ] as const) {
      if (!field[1]) {
        continue;
      }

      const url = classifyCandidate({
        column: field[0],
        id: row.id,
        report: input.report,
        table: "blog_posts",
        url: field[1]
      });

      if (!url) {
        continue;
      }

      if (!externalBudgetAvailable(input.report, input.remaining, {
        column: field[0],
        host: imageUrlHost(url),
        id: row.id,
        oldUrl: url,
        table: "blog_posts"
      })) {
        continue;
      }

      if (input.report.dryRun) {
        addRow(input.report, {
          column: field[0],
          detail: null,
          host: imageUrlHost(url),
          id: row.id,
          newUrl: null,
          oldUrl: url,
          status: "dry_run",
          storageKey: null,
          table: "blog_posts"
        });
        continue;
      }

      const result = await mirrorExternalUrl({
        column: field[0],
        config: input.config,
        delayMs: input.delayMs,
        entityId: row.id,
        environment: input.environment,
        evidenceUrl: row.source_ref,
        namespace: "blog-posts",
        report: input.report,
        table: "blog_posts",
        url
      });

      if (result?.url && result.metadata) {
        if (field[0] === "image_url") {
          nextImageUrl = result.url;
        } else {
          nextSocialImageUrl = result.url;
        }

        mirrors[field[2]] = result.metadata;
      }
    }

    if (input.report.dryRun || Object.keys(mirrors).length < 1) {
      continue;
    }

    await input.sql`
      update public.blog_posts
      set
        image_url = ${nextImageUrl},
        social_image_url = ${nextSocialImageUrl},
        metadata = ${input.sql.json(toJsonValue(
          mergeImageMirrors(row.metadata, mirrors)
        ))}::jsonb,
        updated_at = now()
      where id = ${row.id}::uuid
    `;
    input.report.updatedRows += 1;
  }
}

async function backfillTestimonials(input: Readonly<{
  config: FirstPartyImageStorageConfig | null;
  delayMs: number;
  environment: FirstPartyImageEnvironment;
  remaining: RemainingBudget;
  report: MutableReport;
  sql: Sql;
}>) {
  const rows = await input.sql<Array<{
    author_handle: string | null;
    author_image_url: string | null;
    author_name: string | null;
    id: string;
    metadata: unknown;
  }>>`
    select id::text, author_name, author_handle, author_image_url, metadata
    from public.testimonials
    where author_image_url is not null
      and btrim(author_image_url) <> ''
    order by updated_at desc nulls last, author_name asc
  `;

  for (const row of rows) {
    const url = classifyCandidate({
      column: "author_image_url",
      id: row.id,
      report: input.report,
      table: "testimonials",
      url: row.author_image_url
    });

    if (!url) {
      continue;
    }

    if (!externalBudgetAvailable(input.report, input.remaining, {
      column: "author_image_url",
      host: imageUrlHost(url),
      id: row.id,
      oldUrl: url,
      table: "testimonials"
    })) {
      continue;
    }

    if (input.report.dryRun) {
      addRow(input.report, {
        column: "author_image_url",
        detail: null,
        host: imageUrlHost(url),
        id: row.id,
        newUrl: null,
        oldUrl: url,
        status: "dry_run",
        storageKey: null,
        table: "testimonials"
      });
      continue;
    }

    const result = await mirrorExternalUrl({
      column: "author_image_url",
      config: input.config,
      delayMs: input.delayMs,
      entityId: row.id,
      environment: input.environment,
      evidenceUrl: row.author_handle,
      namespace: "testimonials",
      report: input.report,
      table: "testimonials",
      url
    });

    if (!result?.url || !result.metadata) {
      continue;
    }

    await input.sql`
      update public.testimonials
      set
        author_image_url = ${result.url},
        metadata = ${input.sql.json(toJsonValue(
          mergeImageMirrors(row.metadata, {
            authorImageUrl: result.metadata
          })
        ))}::jsonb,
        updated_at = now()
      where id = ${row.id}::uuid
    `;
    input.report.updatedRows += 1;
  }
}

async function writeReport(
  report: FirstPartyImageBackfillReport,
  outputPath: string | null | undefined
) {
  if (!outputPath) {
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function runFirstPartyImageBackfill(
  input: RunFirstPartyImageBackfillInput
): Promise<FirstPartyImageBackfillReport> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const config = input.config ?? firstPartyImageStorageConfigFromEnv();

  if (input.apply && !config) {
    throw new Error(
      "First-party image backfill apply mode requires DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_CDN_ENDPOINT."
    );
  }

  const report: MutableReport = {
    applied: Boolean(input.apply),
    byHost: {},
    checked: 0,
    dryRun: !input.apply,
    dryRunCandidates: 0,
    environment: input.environment,
    failed: 0,
    generatedAt: new Date().toISOString(),
    mirrored: 0,
    rows: [],
    skippedFirstParty: 0,
    skippedLimit: 0,
    updatedRows: 0
  };
  const remaining = {
    value: input.limit ? Math.max(0, Math.round(input.limit)) : Number.POSITIVE_INFINITY
  };
  const common = {
    config,
    delayMs: Math.max(0, Math.round(input.delayMs ?? 350)),
    environment: input.environment,
    remaining,
    report,
    sql
  };

  try {
    await backfillProducts(common);
    await backfillProductImports(common);
    await backfillBlogPosts(common);
    await backfillTestimonials(common);
  } finally {
    await closeSqlPool();
  }

  const finalReport = report as FirstPartyImageBackfillReport;

  await writeReport(finalReport, input.outputPath);

  return finalReport;
}

export function defaultFirstPartyImageBackfillReportPath(
  environment: FirstPartyImageEnvironment
) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join("reports", `first-party-image-backfill-${environment}-${stamp}.json`);
}
