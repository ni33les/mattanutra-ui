import type postgres from "postgres";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";

export const IN_STORE_PHARMACY_ANSWERS_KEY = "inStorePharmacy";

export type PharmacyOrganisation = Readonly<{
  countryCode: string | null;
  currency: string | null;
  id: string;
  name: string;
  slug: string;
}>;

type PharmacyLookupSql = postgres.Sql | postgres.TransactionSql;

export function pharmacyIdFromParam(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (
    !trimmed ||
    trimmed.length > 80 ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    return "";
  }

  return trimmed;
}

export function inStorePharmacyFromAnswers(
  answers: unknown
): PharmacyOrganisation | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }

  const nested = (answers as Record<string, unknown>)[IN_STORE_PHARMACY_ANSWERS_KEY];

  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }

  const record = nested as Record<string, unknown>;
  const id = typeof record.organisationId === "string" ? record.organisationId : "";
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";

  if (!isUuid(id) || !slug) {
    return null;
  }

  return {
    countryCode:
      typeof record.countryCode === "string" ? record.countryCode : null,
    currency: typeof record.currency === "string" ? record.currency : null,
    id,
    name: typeof record.name === "string" ? record.name : "",
    slug
  };
}

export function assessmentSkipsHealthScore(answers: unknown) {
  return inStorePharmacyFromAnswers(answers) !== null;
}

export function mergeInStorePharmacyAnswers(
  answers: unknown,
  pharmacy: PharmacyOrganisation
) {
  const record =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? { ...(answers as Record<string, unknown>) }
      : {};

  return {
    ...record,
    [IN_STORE_PHARMACY_ANSWERS_KEY]: {
      countryCode: pharmacy.countryCode,
      currency: pharmacy.currency,
      name: pharmacy.name,
      organisationId: pharmacy.id,
      slug: pharmacy.slug
    }
  };
}

export async function resolvePharmacyOrganisation(
  pharmacyId: string
): Promise<PharmacyOrganisation | null> {
  const sql = getSql();
  const id = pharmacyIdFromParam(pharmacyId);

  if (!sql || !id) {
    return null;
  }

  const rows = await sql<
    Array<{
      country_code: string | null;
      currency: string | null;
      id: string;
      name: string;
      slug: string;
    }>
  >`
    select
      organisations.id::text,
      organisations.slug,
      organisations.name,
      organisations.country_code,
      organisations.currency
    from public.organisations
    where organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and (
        organisations.slug = ${id}
        or organisations.id::text = ${id}
      )
    limit 1
  `;
  const row = rows[0];

  if (!row?.id || !row.slug) {
    return null;
  }

  return {
    countryCode: row.country_code,
    currency: row.currency,
    id: row.id,
    name: row.name,
    slug: row.slug
  };
}

export async function resolveCapturePharmacy(
  pharmacyId: unknown,
  existingAnswers?: unknown
) {
  if (typeof pharmacyId === "string" && pharmacyId.trim()) {
    const pharmacy = await resolvePharmacyOrganisation(pharmacyId);

    return {
      invalidRequested: !pharmacy,
      pharmacy
    };
  }

  return {
    invalidRequested: false,
    pharmacy: inStorePharmacyFromAnswers(existingAnswers)
  };
}

export async function loadInStorePharmacyOrganisationId(
  sql: PharmacyLookupSql | null | undefined,
  planId: string
) {
  if (!sql || !isUuid(planId)) {
    return null;
  }

  const rows = await sql<Array<{ organisation_id: string | null }>>`
    select answers -> 'inStorePharmacy' ->> 'organisationId' as organisation_id
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const organisationId = rows[0]?.organisation_id;

  return organisationId && isUuid(organisationId) ? organisationId : null;
}
