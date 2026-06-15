import { toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { normalizeProductCountryCode } from "@/lib/product-countries";

type Db = NonNullable<ReturnType<typeof getSql>>;

export const productRegulatoryScopeTypes = ["country", "region"] as const;
export const productRegulatoryApprovalStatuses = [
  "sourced",
  "verified",
  "rejected",
  "expired"
] as const;
export const productRegulatoryApprovalTypes = [
  "product_registration"
] as const;

export type ProductRegulatoryScopeType =
  (typeof productRegulatoryScopeTypes)[number];
export type ProductRegulatoryApprovalStatus =
  (typeof productRegulatoryApprovalStatuses)[number];
export type ProductRegulatoryApprovalType =
  (typeof productRegulatoryApprovalTypes)[number];

export type ProductRegulatoryApproval = Readonly<{
  agencyCode: string;
  agencyName: string;
  approvalNumber: string;
  approvalType: ProductRegulatoryApprovalType;
  createdAt: string | null;
  evidenceUrl: string | null;
  id: string | null;
  metadata: Record<string, unknown>;
  productId: string | null;
  scopeCode: string;
  scopeType: ProductRegulatoryScopeType;
  source: string | null;
  status: ProductRegulatoryApprovalStatus;
  updatedAt: string | null;
}>;

export type ProductRegulatoryApprovalInput = Readonly<{
  agencyCode?: string | null;
  agencyName?: string | null;
  approvalNumber?: string | null;
  approvalType?: string | null;
  evidenceUrl?: string | null;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
  productId?: string | null;
  scopeCode?: string | null;
  scopeType?: string | null;
  source?: string | null;
  status?: string | null;
}>;

export const productRegulatoryRegionCountries: Record<string, readonly string[]> = {
  ASEAN: ["TH", "SG", "MY", "ID", "PH", "VN", "MM"],
  EU: [
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE"
  ]
};

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanCode(value: unknown, max = 40) {
  const text = cleanText(value, max);

  return text
    ? text.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "")
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

export function normalizeRegulatoryScopeType(
  value: unknown
): ProductRegulatoryScopeType {
  return value === "region" ? "region" : "country";
}

export function normalizeRegulatoryApprovalStatus(
  value: unknown
): ProductRegulatoryApprovalStatus {
  return productRegulatoryApprovalStatuses.includes(
    value as ProductRegulatoryApprovalStatus
  )
    ? value as ProductRegulatoryApprovalStatus
    : "verified";
}

export function normalizeRegulatoryApprovalType(
  value: unknown
): ProductRegulatoryApprovalType {
  return productRegulatoryApprovalTypes.includes(
    value as ProductRegulatoryApprovalType
  )
    ? value as ProductRegulatoryApprovalType
    : "product_registration";
}

export function normalizeRegulatoryScopeCode(
  scopeType: ProductRegulatoryScopeType,
  value: unknown
) {
  if (scopeType === "country") {
    return normalizeProductCountryCode(value);
  }

  const code = cleanCode(value, 20);

  return code && /^[A-Z0-9_]{2,20}$/.test(code) ? code : null;
}

export function productRegulatoryApprovalFromPayload(
  value: unknown
): ProductRegulatoryApproval | null {
  const record = isRecord(value) ? value : {};
  const scopeType = normalizeRegulatoryScopeType(record.scopeType);
  const scopeCode = normalizeRegulatoryScopeCode(scopeType, record.scopeCode);
  const approvalNumber = cleanText(record.approvalNumber, 120);
  const agencyCode = cleanCode(record.agencyCode, 40);
  const agencyName = cleanText(record.agencyName, 200);

  if (!scopeCode || !approvalNumber || !agencyCode || !agencyName) {
    return null;
  }

  const metadata = isRecord(record.metadata)
    ? record.metadata
    : {};

  return {
    agencyCode,
    agencyName,
    approvalNumber,
    approvalType: normalizeRegulatoryApprovalType(record.approvalType),
    createdAt: isoOrNull(record.createdAt),
    evidenceUrl: cleanText(record.evidenceUrl, 2000),
    id: cleanText(record.id, 80),
    metadata,
    productId: cleanText(record.productId, 80),
    scopeCode,
    scopeType,
    source: cleanText(record.source, 200),
    status: normalizeRegulatoryApprovalStatus(record.status),
    updatedAt: isoOrNull(record.updatedAt)
  };
}

export function productRegulatoryApprovalsFromPayload(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(productRegulatoryApprovalFromPayload)
    .filter((item): item is ProductRegulatoryApproval => Boolean(item));
}

export function regulatoryApprovalCoversCountry(
  approval: Pick<ProductRegulatoryApproval, "scopeCode" | "scopeType" | "status">,
  countryCode: string
) {
  const code = normalizeProductCountryCode(countryCode);

  if (!code || approval.status === "expired" || approval.status === "rejected") {
    return false;
  }

  if (approval.scopeType === "country") {
    return approval.scopeCode === code;
  }

  return (productRegulatoryRegionCountries[approval.scopeCode] ?? [])
    .includes(code);
}

export function effectiveRegulatoryApprovalsForCountry(
  approvals: readonly ProductRegulatoryApproval[],
  countryCode: string
) {
  return approvals.filter((approval) =>
    regulatoryApprovalCoversCountry(approval, countryCode)
  );
}

export function thaiFdaApprovalInput(
  approvalNumber: unknown,
  input: Readonly<{
    evidenceUrl?: string | null;
    metadata?: Record<string, unknown> | null;
    source?: string | null;
    status?: ProductRegulatoryApprovalStatus;
  }> = {}
): ProductRegulatoryApproval | null {
  const number = cleanText(approvalNumber, 120);

  if (!number) {
    return null;
  }

  return {
    agencyCode: "TH_FDA",
    agencyName: "Thai FDA",
    approvalNumber: number,
    approvalType: "product_registration",
    createdAt: null,
    evidenceUrl: cleanText(input.evidenceUrl, 2000),
    id: null,
    metadata: input.metadata ?? {},
    productId: null,
    scopeCode: "TH",
    scopeType: "country",
    source: cleanText(input.source, 200) ?? "admin",
    status: input.status ?? "verified",
    updatedAt: null
  };
}

export async function replaceProductRegulatoryApprovals(
  sql: Db,
  input: Readonly<{
    approvals: readonly ProductRegulatoryApprovalInput[];
    productId: string;
  }>
) {
  const approvals = input.approvals
    .map(productRegulatoryApprovalFromPayload)
    .filter((item): item is ProductRegulatoryApproval => Boolean(item));

  await sql`
    delete from public.product_regulatory_approvals
    where product_id = ${input.productId}::uuid
  `;

  for (const approval of approvals) {
    await upsertProductRegulatoryApproval(sql, {
      ...approval,
      productId: input.productId
    });
  }

  return approvals;
}

export async function upsertProductRegulatoryApproval(
  sql: Db,
  input: ProductRegulatoryApprovalInput & Readonly<{ productId: string }>
) {
  const approval = productRegulatoryApprovalFromPayload({
    ...input,
    productId: input.productId
  });

  if (!approval) {
    return null;
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_regulatory_approvals (
      product_id,
      scope_type,
      scope_code,
      agency_code,
      agency_name,
      approval_type,
      approval_number,
      status,
      source,
      evidence_url,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.productId}::uuid,
      ${approval.scopeType},
      ${approval.scopeCode},
      ${approval.agencyCode},
      ${approval.agencyName},
      ${approval.approvalType},
      ${approval.approvalNumber},
      ${approval.status},
      ${approval.source},
      ${approval.evidenceUrl},
      ${sql.json(toJsonValue(approval.metadata))}::jsonb,
      now(),
      now()
    )
    on conflict (
      product_id,
      scope_type,
      scope_code,
      agency_code,
      approval_type,
      approval_number
    )
    do update set
      agency_name = excluded.agency_name,
      status = excluded.status,
      source = coalesce(excluded.source, public.product_regulatory_approvals.source),
      evidence_url = coalesce(excluded.evidence_url, public.product_regulatory_approvals.evidence_url),
      metadata = public.product_regulatory_approvals.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;

  return rows[0]?.id ?? null;
}
