import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";

type Db = NonNullable<ReturnType<typeof getSql>>;
type ProductIdentifierDb = Db | postgres.TransactionSql;

export const PRODUCT_IDENTIFIER_TYPES = [
  "ean13",
  "internal_sku",
  "manufacturer_sku",
  "retailer_local_code",
  "supplier_code"
] as const;

export type ProductIdentifierType = (typeof PRODUCT_IDENTIFIER_TYPES)[number];
export type ProductIdentifierStatus = "active" | "deleted" | "disabled";
export type ProductIdentifierCandidateStatus =
  | "approved"
  | "conflict"
  | "pending"
  | "rejected";
export type ProductIdentifierConfidence = "high" | "low" | "medium" | "trusted";

export type ProductIdentifier = Readonly<{
  confidence: ProductIdentifierConfidence;
  evidenceUrl: string | null;
  id: string;
  normalizedValue: string;
  source: string;
  status: ProductIdentifierStatus;
  type: ProductIdentifierType;
  updatedAt: string | null;
  value: string;
}>;

export type ProductIdentifierCandidate = Readonly<{
  confidence: ProductIdentifierConfidence;
  conflictProductIds: string[];
  evidenceUrl: string | null;
  id: string;
  normalizedValue: string;
  source: string;
  status: ProductIdentifierCandidateStatus;
  type: ProductIdentifierType;
  updatedAt: string | null;
  value: string;
}>;

export type ProductIdentifierInput = Readonly<{
  confidence?: ProductIdentifierConfidence | null;
  evidenceUrl?: string | null;
  source?: string | null;
  type: ProductIdentifierType;
  value: string;
}>;

type IdentifierEvidence = ProductIdentifierInput & Readonly<{
  autoApprove?: boolean;
  metadata?: Record<string, unknown>;
}>;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function isoOrNull(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

export function isProductIdentifierType(value: unknown): value is ProductIdentifierType {
  return PRODUCT_IDENTIFIER_TYPES.includes(value as ProductIdentifierType);
}

export function normalizeEan13(value: unknown) {
  const text = cleanText(value, 80);

  if (!text) {
    return null;
  }

  const compact = text.replace(/[\s-]/g, "");

  return /^\d{13}$/.test(compact) ? compact : null;
}

export function ean13ChecksumValid(value: unknown) {
  const normalized = normalizeEan13(value);

  if (!normalized) {
    return false;
  }

  const digits = normalized.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3),
    0
  );

  return check === (10 - (sum % 10)) % 10;
}

export function normalizeIdentifierValue(
  type: ProductIdentifierType,
  value: unknown
) {
  if (type === "ean13") {
    const normalized = normalizeEan13(value);

    return normalized && ean13ChecksumValid(normalized) ? normalized : null;
  }

  const text = cleanText(value, 180);

  return text ? text.replace(/\s+/g, " ").toUpperCase() : null;
}

function identifierConfidence(value: unknown): ProductIdentifierConfidence {
  return value === "trusted" || value === "high" || value === "low"
    ? value
    : "medium";
}

function identifierStatus(value: unknown): ProductIdentifierStatus {
  return value === "deleted" || value === "disabled" ? value : "active";
}

function candidateStatus(value: unknown): ProductIdentifierCandidateStatus {
  return value === "approved" || value === "conflict" || value === "rejected"
    ? value
    : "pending";
}

function identifierFromPayload(value: unknown): ProductIdentifier | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const type = isProductIdentifierType(record?.type) ? record.type : null;
  const normalizedValue = typeof record?.normalizedValue === "string"
    ? record.normalizedValue
    : null;
  const rawValue = typeof record?.value === "string" ? record.value : null;
  const id = typeof record?.id === "string" ? record.id : null;

  if (!record || !type || !normalizedValue || !rawValue || !id) {
    return null;
  }

  return {
    confidence: identifierConfidence(record.confidence),
    evidenceUrl: cleanText(record.evidenceUrl, 2000),
    id,
    normalizedValue,
    source: cleanText(record.source, 200) ?? "admin",
    status: identifierStatus(record.status),
    type,
    updatedAt: isoOrNull(record.updatedAt),
    value: rawValue
  };
}

function candidateFromPayload(value: unknown): ProductIdentifierCandidate | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const type = isProductIdentifierType(record?.type) ? record.type : null;
  const normalizedValue = typeof record?.normalizedValue === "string"
    ? record.normalizedValue
    : null;
  const rawValue = typeof record?.value === "string" ? record.value : null;
  const id = typeof record?.id === "string" ? record.id : null;

  if (!record || !type || !normalizedValue || !rawValue || !id) {
    return null;
  }

  return {
    confidence: identifierConfidence(record.confidence),
    conflictProductIds: Array.isArray(record.conflictProductIds)
      ? record.conflictProductIds.filter((item): item is string => typeof item === "string")
      : [],
    evidenceUrl: cleanText(record.evidenceUrl, 2000),
    id,
    normalizedValue,
    source: cleanText(record.source, 200) ?? "unknown",
    status: candidateStatus(record.status),
    type,
    updatedAt: isoOrNull(record.updatedAt),
    value: rawValue
  };
}

export function productIdentifiersFromPayload(value: unknown) {
  return Array.isArray(value)
    ? value.map(identifierFromPayload).filter((item): item is ProductIdentifier => Boolean(item))
    : [];
}

export function productIdentifierCandidatesFromPayload(value: unknown) {
  return Array.isArray(value)
    ? value.map(candidateFromPayload).filter((item): item is ProductIdentifierCandidate => Boolean(item))
    : [];
}

export function productIdentifiersFromBody(value: unknown): ProductIdentifierInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ProductIdentifierInput[] => {
    const record = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : null;
    const type = isProductIdentifierType(record?.type) ? record.type : null;
    const valueText = cleanText(record?.value, 180);

    if (!record || !type || !valueText) {
      return [];
    }

    const normalized = normalizeIdentifierValue(type, valueText);

    return normalized
      ? [{
          confidence: identifierConfidence(record.confidence),
          evidenceUrl: cleanText(record.evidenceUrl, 2000),
          source: cleanText(record.source, 200) ?? "admin",
          type,
          value: valueText
        }]
      : [];
  });
}

export function primaryIdentifierValue(
  identifiers: readonly ProductIdentifier[],
  type: ProductIdentifierType
) {
  return identifiers.find((item) => item.type === type && item.status === "active")
    ?.value ?? null;
}

export async function replaceApprovedProductIdentifiers(
  sql: ProductIdentifierDb,
  input: Readonly<{
    actor?: string | null;
    identifiers: readonly ProductIdentifierInput[];
    productId: string;
    replaceTypes?: readonly ProductIdentifierType[];
  }>
) {
  const productId = input.productId.trim();
  const nextIdentifiers = input.identifiers.flatMap((identifier) => {
    const normalizedValue = normalizeIdentifierValue(identifier.type, identifier.value);

    return normalizedValue
      ? [{
          confidence: identifierConfidence(identifier.confidence),
          evidenceUrl: cleanText(identifier.evidenceUrl, 2000),
          normalizedValue,
          source: cleanText(identifier.source, 200) ?? "admin",
          type: identifier.type,
          value: identifier.type === "ean13" ? normalizedValue : identifier.value.trim()
        }]
      : [];
  });
  const types = input.replaceTypes
    ? [...new Set(input.replaceTypes)]
    : [...new Set(nextIdentifiers.map((identifier) => identifier.type))];

  if (types.length === 0) {
    return;
  }

  await sql`
    update public.product_identifiers
    set status = 'disabled', updated_at = now()
    where product_id = ${productId}::uuid
      and identifier_type = any(${types}::text[])
      and status = 'active'
  `;

  for (const identifier of nextIdentifiers) {
    const conflictRows = await sql<Array<{ product_id: string }>>`
      select product_id::text
      from public.product_identifiers
      where identifier_type = ${identifier.type}
        and normalized_value = ${identifier.normalizedValue}
        and status = 'active'
        and product_id <> ${productId}::uuid
      limit 1
    `;

    if (conflictRows.length > 0) {
      throw new Error(
        `Identifier ${identifier.normalizedValue} is already assigned to another product`
      );
    }

    await sql`
      insert into public.product_identifiers (
        product_id,
        identifier_type,
        identifier_value,
        normalized_value,
        source,
        confidence,
        evidence_url,
        status,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${identifier.type},
        ${identifier.value},
        ${identifier.normalizedValue},
        ${identifier.source},
        ${identifier.confidence},
        ${identifier.evidenceUrl},
        'active',
        ${sql.json(toJsonValue({
          actor: cleanText(input.actor, 200) ?? "admin",
          approvedAt: new Date().toISOString()
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (product_id, identifier_type, normalized_value) do update set
        identifier_value = excluded.identifier_value,
        source = excluded.source,
        confidence = excluded.confidence,
        evidence_url = excluded.evidence_url,
        status = 'active',
        metadata = public.product_identifiers.metadata || excluded.metadata,
        updated_at = now()
    `;
  }
}

async function activeIdentifierConflicts(
  sql: ProductIdentifierDb,
  input: Readonly<{
    normalizedValue: string;
    productId: string;
    type: ProductIdentifierType;
  }>
) {
  const rows = await sql<Array<{ product_id: string }>>`
    select product_id::text
    from public.product_identifiers
    where identifier_type = ${input.type}
      and normalized_value = ${input.normalizedValue}
      and status = 'active'
      and product_id <> ${input.productId}::uuid
    order by created_at asc
    limit 20
  `;

  return rows.map((row) => row.product_id);
}

export async function recordProductIdentifierCandidate(
  sql: ProductIdentifierDb,
  input: Readonly<{
    autoApprove?: boolean;
    confidence?: ProductIdentifierConfidence | null;
    evidenceUrl?: string | null;
    metadata?: Record<string, unknown>;
    productId: string;
    source?: string | null;
    type: ProductIdentifierType;
    value: string;
  }>
) {
  const normalizedValue = normalizeIdentifierValue(input.type, input.value);

  if (!normalizedValue) {
    return { approved: false, candidateId: null, reason: "invalid_identifier" };
  }

  const conflicts = await activeIdentifierConflicts(sql, {
    normalizedValue,
    productId: input.productId,
    type: input.type
  });
  const confidence = identifierConfidence(input.confidence);
  const source = cleanText(input.source, 200) ?? "unknown";
  const status: ProductIdentifierCandidateStatus =
    conflicts.length > 0 ? "conflict" : input.autoApprove ? "approved" : "pending";
  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_identifier_candidates (
      product_id,
      identifier_type,
      identifier_value,
      normalized_value,
      source,
      confidence,
      evidence_url,
      status,
      conflict_product_ids,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.productId}::uuid,
      ${input.type},
      ${input.type === "ean13" ? normalizedValue : input.value.trim()},
      ${normalizedValue},
      ${source},
      ${confidence},
      ${cleanText(input.evidenceUrl, 2000)},
      ${status},
      ${conflicts}::uuid[],
      ${sql.json(toJsonValue(input.metadata ?? {}))}::jsonb,
      now(),
      now()
    )
    on conflict (product_id, identifier_type, normalized_value, source) do update set
      identifier_value = excluded.identifier_value,
      confidence = excluded.confidence,
      evidence_url = coalesce(excluded.evidence_url, public.product_identifier_candidates.evidence_url),
      status = case
        when public.product_identifier_candidates.status = 'approved' then 'approved'
        else excluded.status
      end,
      conflict_product_ids = excluded.conflict_product_ids,
      metadata = public.product_identifier_candidates.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;

  if (status === "approved") {
    await replaceApprovedProductIdentifiers(sql, {
      actor: source,
      identifiers: [{
        confidence,
        evidenceUrl: cleanText(input.evidenceUrl, 2000),
        source,
        type: input.type,
        value: input.type === "ean13" ? normalizedValue : input.value.trim()
      }],
      productId: input.productId
    });
  }

  return {
    approved: status === "approved",
    candidateId: rows[0]?.id ?? null,
    reason: status
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pushIdentifierEvidence(
  output: IdentifierEvidence[],
  evidence: IdentifierEvidence
) {
  const normalizedValue = normalizeIdentifierValue(evidence.type, evidence.value);

  if (!normalizedValue) {
    return;
  }

  if (
    output.some((item) =>
      item.type === evidence.type &&
      normalizeIdentifierValue(item.type, item.value) === normalizedValue &&
      item.source === evidence.source
    )
  ) {
    return;
  }

  output.push({
    ...evidence,
    value: evidence.type === "ean13" ? normalizedValue : evidence.value
  });
}

function extractIdentifierEvidenceFromRecord(
  value: unknown,
  output: IdentifierEvidence[],
  source: string,
  evidenceUrl: string | null,
  depth = 0
) {
  if (depth > 8 || !value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) {
      extractIdentifierEvidenceFromRecord(item, output, source, evidenceUrl, depth + 1);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const text = cleanText(raw, 240);

    if (text) {
      if (
        ["gtin", "gtin13", "ean", "ean13", "barcode", "barcodeean13"].includes(normalizedKey)
      ) {
        pushIdentifierEvidence(output, {
          autoApprove: source.includes("structured") || source.includes("snapshot"),
          confidence: source.includes("structured") ? "trusted" : "high",
          evidenceUrl,
          source,
          type: "ean13",
          value: text
        });
      } else if (["sku", "productsku"].includes(normalizedKey)) {
        pushIdentifierEvidence(output, {
          confidence: "medium",
          evidenceUrl,
          source,
          type: "manufacturer_sku",
          value: text
        });
      } else if (["mpn", "manufacturerpartnumber"].includes(normalizedKey)) {
        pushIdentifierEvidence(output, {
          confidence: "medium",
          evidenceUrl,
          source,
          type: "manufacturer_sku",
          value: text
        });
      }
    }

    extractIdentifierEvidenceFromRecord(raw, output, source, evidenceUrl, depth + 1);
  }
}

function jsonLdRecordsFromHtml(html: string) {
  const records: unknown[] = [];

  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      records.push(JSON.parse(raw) as unknown);
    } catch {
      // Ignore malformed site metadata; visible text extraction will still run.
    }
  }

  return records;
}

export function extractTrustedIdentifierEvidence(input: Readonly<{
  evidenceUrl?: string | null;
  html?: string | null;
  snapshot?: unknown;
}>) {
  const output: IdentifierEvidence[] = [];
  const evidenceUrl = cleanText(input.evidenceUrl, 2000);

  if (input.snapshot) {
    extractIdentifierEvidenceFromRecord(
      input.snapshot,
      output,
      "manufacturer_snapshot",
      evidenceUrl
    );
  }

  const html = cleanText(input.html, 1_000_000);

  if (html) {
    for (const record of jsonLdRecordsFromHtml(html)) {
      extractIdentifierEvidenceFromRecord(
        record,
        output,
        "manufacturer_structured_data",
        evidenceUrl
      );
    }

    for (const match of html.matchAll(
      /\b(?:EAN(?:-?13)?|GTIN(?:-?13)?|Barcode)\b[^0-9]{0,30}([0-9][0-9\s-]{11,25}[0-9])/gi
    )) {
      pushIdentifierEvidence(output, {
        autoApprove: false,
        confidence: "medium",
        evidenceUrl,
        source: "manufacturer_visible_text",
        type: "ean13",
        value: match[1] ?? ""
      });
    }
  }

  return output;
}

async function fetchTrustedHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9,th;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });

    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sourceProductIdentifiers(input: Readonly<{
  limit?: number;
  productId?: string | null;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const limit = Math.max(1, Math.min(2000, Math.round(input.limit ?? 2000)));
  const rows = await sql<Array<{
    id: string;
    product_url: string;
    source_snapshot: unknown;
    source_url: string | null;
  }>>`
    select
      id::text,
      product_url,
      source_url,
      source_snapshot
    from public.products
    where ${input.productId ? sql`id = ${input.productId}::uuid` : sql`true`}
    order by updated_at desc
    limit ${limit}
  `;
  let approved = 0;
  let candidates = 0;
  let conflicts = 0;
  let failed = 0;
  let missing = 0;

  for (const row of rows) {
    const evidenceUrl = row.source_url ?? row.product_url;
    const html = evidenceUrl ? await fetchTrustedHtml(evidenceUrl) : null;
    const evidence = extractTrustedIdentifierEvidence({
      evidenceUrl,
      html,
      snapshot: row.source_snapshot
    });

    if (evidence.length === 0) {
      missing += 1;
      continue;
    }

    for (const item of evidence) {
      try {
        const result = await recordProductIdentifierCandidate(sql, {
          autoApprove: Boolean(item.autoApprove),
          confidence: item.confidence,
          evidenceUrl: item.evidenceUrl,
          metadata: item.metadata,
          productId: row.id,
          source: item.source,
          type: item.type,
          value: item.value
        });

        if (result.approved) {
          approved += 1;
        } else if (result.reason === "conflict") {
          conflicts += 1;
        } else if (result.candidateId) {
          candidates += 1;
        }
      } catch {
        failed += 1;
      }
    }
  }

  return {
    approved,
    candidates,
    conflicts,
    failed,
    missing,
    scanned: rows.length
  };
}
