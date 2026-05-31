import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";

type FinanceDb = postgres.Sql | postgres.TransactionSql;

export type FinanceCategory =
  | "ai"
  | "hosting"
  | "other"
  | "payment_fee"
  | "payout"
  | "refund"
  | "revenue";
export type FinanceEntryType = "actual" | "nominal";

export const FINANCE_ACCOUNT_IDS = {
  digitalOcean: "22222222-2222-4222-8222-222222222222",
  mattanutraBank: "66666666-6666-4666-8666-666666666666",
  mattanutraRevenue: "44444444-4444-4444-8444-444444444444",
  stripe: "33333333-3333-4333-8333-333333333333",
  stripeClearing: "55555555-5555-4555-8555-555555555555",
  xai: "11111111-1111-4111-8111-111111111111"
} as const;

export type FinanceTransactionInput = Readonly<{
  amount: number;
  category: FinanceCategory;
  currency: string;
  description: string;
  entryType?: FinanceEntryType | null;
  from: string;
  fromAccountId?: string | null;
  fxRateId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date | string | null;
  provider?: string | null;
  sql?: FinanceDb;
  source: string;
  sourceRef?: string | null;
  taskId?: string | null;
  to: string;
  toAccountId?: string | null;
  usdRate: number;
}>;

type XaiUsageCostInput = Readonly<{
  description?: string;
  metadata?: Record<string, unknown>;
  model: string;
  occurredAt?: Date | string | null;
  purpose: string;
  reasoningEffort?: string | null;
  responseId?: string | null;
  sql?: FinanceDb;
  taskId?: string | null;
  usage: unknown;
}>;

export type DigitalOceanInvoiceItem = Record<string, unknown>;

type DigitalOceanInvoicePreview = Readonly<{
  invoice_items?: DigitalOceanInvoiceItem[];
}>;

export type DigitalOceanBillingSyncResult = Readonly<{
  error?: string;
  reason?: "missing_project_name" | "missing_token";
  skipped: boolean;
  synced: number;
}>;

export type DigitalOceanBillingCostEntry = Omit<
  FinanceTransactionInput,
  "taskId"
> & Readonly<{
  category: "hosting";
  entryType: "nominal";
  provider: "digitalocean";
  source: "digitalocean";
}>;

type DigitalOceanBillingSyncOptions = Readonly<{
  fetcher?: typeof fetch;
  recorder?: (input: FinanceTransactionInput) => Promise<string | null>;
  taskId?: string | null;
}>;

const AMOUNT_MICROS_PER_UNIT = 1_000_000;
const DEFAULT_USD_RATE = 1;
const DIGITALOCEAN_INVOICE_PREVIEW_URL =
  "https://api.digitalocean.com/v2/customers/my/invoices/preview";
const DIGITALOCEAN_REQUEST_TIMEOUT_MS = 15_000;

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberFromUsage(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJsonValue(value: unknown): postgres.JSONValue {
  if (value === undefined) {
    return {};
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    return {};
  }

  return JSON.parse(serialized) as postgres.JSONValue;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function amountMicrosFromDecimal(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  return Math.round(Math.abs(parsed) * AMOUNT_MICROS_PER_UNIT);
}

function usdPerMillionTokens(name: string, fallback: number) {
  const configuredRate = positiveNumber(process.env[name]);

  return configuredRate ?? fallback;
}

function xaiPricingForModel(model: string) {
  const normalized = model.toLowerCase();
  const fast = normalized.includes("fast");
  const fallback = fast
    ? { cachedInput: 0.05, input: 0.2, output: 0.5 }
    : { cachedInput: 0.2, input: 1.25, output: 2.5 };

  return {
    cachedInput: usdPerMillionTokens(
      "XAI_CACHED_INPUT_USD_PER_MILLION_TOKENS",
      fallback.cachedInput
    ),
    input: usdPerMillionTokens(
      "XAI_INPUT_USD_PER_MILLION_TOKENS",
      fallback.input
    ),
    output: usdPerMillionTokens(
      "XAI_OUTPUT_USD_PER_MILLION_TOKENS",
      fallback.output
    )
  };
}

function usageTokens(usage: unknown) {
  const record = objectValue(usage);
  const promptDetails = objectValue(
    record.prompt_tokens_details ?? record.input_tokens_details
  );
  const promptTokens =
    numberFromUsage(record, "prompt_tokens") ||
    numberFromUsage(record, "input_tokens");
  const completionTokens =
    numberFromUsage(record, "completion_tokens") ||
    numberFromUsage(record, "output_tokens");
  const cachedPromptTokens =
    numberFromUsage(promptDetails, "cached_tokens") ||
    numberFromUsage(record, "cached_prompt_tokens") ||
    numberFromUsage(record, "cached_input_tokens");

  return {
    cachedPromptTokens: Math.min(promptTokens, cachedPromptTokens),
    completionTokens,
    promptTokens
  };
}

function hashSourceRef(parts: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(parts.map((part) => part ?? null)))
    .digest("hex")
    .slice(0, 32);
}

export async function recordFinanceTransaction(input: FinanceTransactionInput) {
  const sql = input.sql ?? (await import("./db.ts")).getSql();

  if (!sql) {
    return null;
  }

  const amount = Math.round(input.amount);
  const category: FinanceCategory =
    input.category === "ai" ||
    input.category === "hosting" ||
    input.category === "payment_fee" ||
    input.category === "payout" ||
    input.category === "refund" ||
    input.category === "revenue" ||
    input.category === "other"
      ? input.category
      : "other";
  const entryType: FinanceEntryType =
    input.entryType === "actual" ? "actual" : "nominal";
  const currency = input.currency.trim().toUpperCase();
  const description = input.description.trim();
  const from = input.from.trim();
  const to = input.to.trim();
  const source = input.source.trim();
  const usdRate = Number(input.usdRate);

  if (
    amount <= 0 ||
    !Number.isInteger(amount) ||
    !/^[A-Z]{3}$/.test(currency) ||
    !description ||
    !from ||
    !to ||
    !source ||
    !Number.isFinite(usdRate) ||
    usdRate <= 0
  ) {
    return null;
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.finance_transactions (
      id,
      occurred_at,
      category,
      entry_type,
      source,
      source_ref,
      provider,
      fx_rate_id,
      task_id,
      from_account_id,
      to_account_id,
      "from",
      "to",
      amount,
      amount_unit,
      currency,
      usd_rate,
      description,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.occurredAt ? new Date(input.occurredAt) : new Date()},
      ${category},
      ${entryType},
      ${source},
      ${input.sourceRef?.trim() || null},
      ${input.provider?.trim() || null},
      ${input.fxRateId?.trim() || null}::uuid,
      ${input.taskId?.trim() || null}::uuid,
      ${input.fromAccountId?.trim() || null}::uuid,
      ${input.toAccountId?.trim() || null}::uuid,
      ${from},
      ${to},
      ${amount},
      'micros',
      ${currency},
      ${usdRate},
      ${description},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      now(),
      now()
    )
    on conflict (source, source_ref) where source_ref is not null
    do update set
      occurred_at = excluded.occurred_at,
      category = excluded.category,
      entry_type = excluded.entry_type,
      provider = excluded.provider,
      fx_rate_id = excluded.fx_rate_id,
      task_id = excluded.task_id,
      from_account_id = excluded.from_account_id,
      to_account_id = excluded.to_account_id,
      "from" = excluded."from",
      "to" = excluded."to",
      amount = excluded.amount,
      amount_unit = excluded.amount_unit,
      currency = excluded.currency,
      usd_rate = excluded.usd_rate,
      description = excluded.description,
      metadata = excluded.metadata,
      updated_at = now()
    returning id::text
  `;

  return rows[0]?.id ?? null;
}

export async function recordXaiUsageCost(input: XaiUsageCostInput) {
  try {
    const usage = objectValue(input.usage);
    const tokens = usageTokens(usage);

    if (tokens.promptTokens <= 0 && tokens.completionTokens <= 0) {
      return null;
    }

    const pricing = xaiPricingForModel(input.model);
    const billablePromptTokens = Math.max(
      0,
      tokens.promptTokens - tokens.cachedPromptTokens
    );
    const amount = Math.max(
      1,
      Math.round(
        billablePromptTokens * pricing.input +
          tokens.cachedPromptTokens * pricing.cachedInput +
          tokens.completionTokens * pricing.output
      )
    );
    const sourceRef = input.responseId
      ? `xai:${input.responseId}`
      : `xai:${hashSourceRef([
          input.purpose,
          input.model,
          tokens.promptTokens,
          tokens.completionTokens,
          new Date().toISOString()
        ])}`;

    return await recordFinanceTransaction({
      amount,
      category: "ai",
      currency: "USD",
      description:
        input.description ??
        `Accrued xAI ${input.purpose} cost using ${input.model} (${tokens.promptTokens} input, ${tokens.completionTokens} output tokens)`,
      from: "mattanutra:platform",
      metadata: {
        ...input.metadata,
        accountingBasis: "cost_accrual",
        model: input.model,
        pricingUsdPerMillionTokens: pricing,
        purpose: input.purpose,
        reasoningEffort: input.reasoningEffort,
        settlement: "monthly_provider_invoice",
        taskId: input.taskId,
        tokens,
        usage
      },
      occurredAt: input.occurredAt,
      provider: "xai",
      source: "xai",
      sourceRef,
      sql: input.sql,
      taskId: input.taskId,
      to: "xai:grok",
      toAccountId: FINANCE_ACCOUNT_IDS.xai,
      usdRate: DEFAULT_USD_RATE
    });
  } catch (error) {
    console.warn("Unable to record xAI usage cost", error);
    return null;
  }
}

function digitalOceanToken() {
  return configured(process.env.DIGITALOCEAN_ACCESS_TOKEN);
}

export function parseDigitalOceanProjectNames(raw: string | null | undefined) {
  return configured(raw ?? undefined)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function selectedDigitalOceanProjects() {
  return parseDigitalOceanProjectNames(process.env.DIGITALOCEAN_PROJECT_NAME);
}

export function digitalOceanBillingSyncConfiguration() {
  const token = digitalOceanToken();
  const projects = selectedDigitalOceanProjects();

  if (!token) {
    return {
      configured: false,
      projects,
      reason: "missing_token" as const
    };
  }

  if (projects.length < 1) {
    return {
      configured: false,
      projects,
      reason: "missing_project_name" as const
    };
  }

  return {
    configured: true,
    projects,
    reason: null
  } as const;
}

export async function fetchDigitalOceanInvoicePreview(
  fetcher: typeof fetch = fetch
) {
  const token = digitalOceanToken();

  if (!token) {
    return {
      reason: "missing_token" as const,
      skipped: true,
      invoiceItems: [] as DigitalOceanInvoiceItem[]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DIGITALOCEAN_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetcher(DIGITALOCEAN_INVOICE_PREVIEW_URL, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      throw new Error(
        `DigitalOcean billing sync failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    const body = (await response.json()) as DigitalOceanInvoicePreview;

    return {
      invoiceItems: Array.isArray(body.invoice_items) ? body.invoice_items : [],
      skipped: false
    };
  } finally {
    clearTimeout(timeout);
  }
}

function digitalOceanItemAmount(item: DigitalOceanInvoiceItem) {
  return amountMicrosFromDecimal(item.amount ?? item.total_amount);
}

function digitalOceanItemProject(item: DigitalOceanInvoiceItem) {
  const project = objectValue(item.project);

  return (
    textValue(item.project_name) ||
    textValue(project.name) ||
    textValue(project.slug) ||
    textValue(item.project) ||
    textValue(item.project_uuid)
  );
}

function digitalOceanItemTimestamp(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.end_time) ||
    textValue(item.end) ||
    textValue(item.period_end) ||
    textValue(item.start_time) ||
    textValue(item.start) ||
    textValue(item.period_start) ||
    new Date().toISOString()
  );
}

function digitalOceanItemDescription(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.description) ||
    textValue(item.group_description) ||
    textValue(item.product) ||
    "DigitalOcean hosting cost"
  );
}

function digitalOceanItemProduct(item: DigitalOceanInvoiceItem) {
  return textValue(item.product);
}

function digitalOceanItemGroupDescription(item: DigitalOceanInvoiceItem) {
  return textValue(item.group_description);
}

function digitalOceanItemResourceType(item: DigitalOceanInvoiceItem) {
  return textValue(item.resource_type);
}

function digitalOceanItemRegion(item: DigitalOceanInvoiceItem) {
  return textValue(item.region);
}

function digitalOceanItemLedgerDescription(item: DigitalOceanInvoiceItem) {
  const description = digitalOceanItemDescription(item);
  const product = digitalOceanItemProduct(item);
  const groupDescription = digitalOceanItemGroupDescription(item);
  const resourceType = digitalOceanItemResourceType(item);
  const searchable = [
    description,
    product,
    groupDescription,
    resourceType
  ].join(" ").toLowerCase();

  if (searchable.includes("database")) {
    return "DigitalOcean database usage";
  }

  if (searchable.includes("app platform") || searchable.includes("app")) {
    return "DigitalOcean App Platform usage";
  }

  if (product) {
    return `DigitalOcean ${product} usage`;
  }

  if (groupDescription) {
    return `DigitalOcean ${groupDescription} usage`;
  }

  return description.startsWith("DigitalOcean")
    ? description
    : `DigitalOcean ${description}`;
}

function digitalOceanPeriodStart(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.start_time) ||
    textValue(item.start) ||
    textValue(item.period_start)
  );
}

function digitalOceanPeriodEnd(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.end_time) ||
    textValue(item.end) ||
    textValue(item.period_end)
  );
}

function digitalOceanResourceId(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.resource_uuid) ||
    textValue(item.resource_id) ||
    textValue(item.resource) ||
    textValue(item.uuid) ||
    textValue(item.id)
  );
}

function digitalOceanSourceIdentity(item: DigitalOceanInvoiceItem) {
  return (
    textValue(item.uuid) ||
    textValue(item.id) ||
    textValue(item.resource_uuid) ||
    textValue(item.resource_id) ||
    textValue(item.resource)
  );
}

function digitalOceanSourceRef(item: DigitalOceanInvoiceItem) {
  return `digitalocean:invoice-preview:${hashSourceRef([
    textValue(item.invoice_uuid) || textValue(item.invoice_id) || "preview",
    digitalOceanSourceIdentity(item),
    digitalOceanItemProject(item).toLowerCase(),
    digitalOceanItemDescription(item),
    textValue(item.product),
    textValue(item.group_description),
    textValue(item.resource_type),
    textValue(item.region),
    digitalOceanPeriodStart(item),
    digitalOceanPeriodEnd(item)
  ])}`;
}

export function buildDigitalOceanBillingCostEntries({
  items,
  projectNames
}: Readonly<{
  items: readonly DigitalOceanInvoiceItem[];
  projectNames: readonly string[];
}>) {
  const selectedProjects = new Set(
    projectNames.map((project) => project.trim().toLowerCase()).filter(Boolean)
  );
  const entries: DigitalOceanBillingCostEntry[] = [];

  if (selectedProjects.size < 1) {
    return entries;
  }

  for (const item of items) {
    const project = digitalOceanItemProject(item);

    if (!project || !selectedProjects.has(project.toLowerCase())) {
      continue;
    }

    const amount = digitalOceanItemAmount(item);

    if (!amount) {
      continue;
    }

    const rawAmount = Number(item.amount ?? item.total_amount);
    const from =
      Number.isFinite(rawAmount) && rawAmount < 0
        ? "digitalocean"
        : "mattanutra:platform";
    const to =
      Number.isFinite(rawAmount) && rawAmount < 0
        ? "mattanutra:platform"
        : "digitalocean";
    const description = digitalOceanItemDescription(item);
    const displayDescription = digitalOceanItemLedgerDescription(item);
    const resourceId = digitalOceanResourceId(item);
    const resourceType = digitalOceanItemResourceType(item);
    const periodStart = digitalOceanPeriodStart(item);
    const periodEnd = digitalOceanPeriodEnd(item);

    entries.push({
      amount,
      category: "hosting",
      currency: "USD",
      description: `Accrued ${displayDescription} (${project})`,
      entryType: "nominal",
      from,
      metadata: {
        accountingBasis: "cost_accrual",
        groupDescription: digitalOceanItemGroupDescription(item) || null,
        item,
        periodEnd: periodEnd || null,
        periodStart: periodStart || null,
        project,
        providerDescription: description,
        providerProduct: digitalOceanItemProduct(item) || null,
        region: digitalOceanItemRegion(item) || null,
        resourceId: resourceId || null,
        resourceType: resourceType || null,
        settlement: "monthly_provider_invoice",
        sourceEndpoint: "invoice_preview"
      },
      occurredAt: digitalOceanItemTimestamp(item),
      provider: "digitalocean",
      source: "digitalocean",
      sourceRef: digitalOceanSourceRef(item),
      to,
      toAccountId:
        to === "digitalocean" ? FINANCE_ACCOUNT_IDS.digitalOcean : null,
      fromAccountId:
        from === "digitalocean" ? FINANCE_ACCOUNT_IDS.digitalOcean : null,
      usdRate: DEFAULT_USD_RATE
    });
  }

  return entries;
}

export async function syncDigitalOceanBillingCosts(
  options: DigitalOceanBillingSyncOptions = {}
): Promise<DigitalOceanBillingSyncResult> {
  const token = digitalOceanToken();

  if (!token) {
    return { reason: "missing_token", skipped: true, synced: 0 };
  }

  const projects = selectedDigitalOceanProjects();

  if (projects.length < 1) {
    return { reason: "missing_project_name", skipped: true, synced: 0 };
  }

  try {
    const preview = await fetchDigitalOceanInvoicePreview(
      options.fetcher ?? fetch
    );
    const items = preview.invoiceItems;
    const entries = buildDigitalOceanBillingCostEntries({
      items,
      projectNames: projects
    });
    const recorder = options.recorder ?? recordFinanceTransaction;
    let synced = 0;

    for (const entry of entries) {
      const id = await recorder({
        ...entry,
        taskId: options.taskId ?? null
      });

      if (id) {
        synced += 1;
      }
    }

    return { skipped: false, synced };
  } catch (error) {
    console.warn("Unable to sync DigitalOcean billing costs", error);

    return {
      error: error instanceof Error ? error.message : "Unknown billing sync error",
      skipped: false,
      synced: 0
    };
  }
}
