/**
 * Shared admin-access primitives used by the facade and split modules.
 * Keep pure mappers / scope helpers here so auth/session/agent slices stay free of cycles.
 */
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  normalizeAdminRole,
  type AdminOrganisationType,
  type AdminRole
} from "@/lib/admin-rbac";
import { configuredGrokModel, configuredGrokValue } from "@/lib/grok-client";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  organisationDispatchCity
} from "@/lib/organisation-dispatch";
import {
  flatRateShippingAmountFromMetadata
} from "@/lib/shipping-fees";
import type {
  AdminMembership,
  AdminOrganisation,
  AdminPasskeyCredentialSummary,
  AdminPerson,
  AdminSessionContext
} from "@/lib/admin-access-types";

export type Db = NonNullable<ReturnType<typeof getSql>>;

export const registrationChallengeMinutes = 10;
export const loginChallengeMinutes = 5;
export const inviteDays = 7;
export const recoveryInviteMinutes = 60;
export const defaultPlatformOrgSlug = "mattanutra";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function displayNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}

export function base64Url(value: Uint8Array | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function bytesFromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function originFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function isNonEmptyString(value: string | null): value is string {
  return Boolean(value);
}

export function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      return metadataRecord(parsed);
    } catch {
      return {};
    }
  }

  return {};
}

export function metadataText(
  metadata: Record<string, unknown>,
  keys: readonly string[],
  options: Readonly<{ allowStructured?: boolean }> = {}
) {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (options.allowStructured && value && typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function configuredAgentGrokModel(model: string | null, metadata: Record<string, unknown>) {
  const explicit = metadataText(metadata, [
    "actualGrokModel",
    "grokModel",
    "modelName",
    "xaiModel"
  ]);

  if (explicit) {
    return explicit;
  }

  if (!model) {
    return null;
  }

  if (model.startsWith("grok-")) {
    return model;
  }

  if (model === "grok:healthscore") {
    return configuredGrokModel(process.env.HEALTHSCORE_COPY_MODEL, process.env.GROK_MODEL);
  }

  if (model.startsWith("grok:")) {
    return configuredGrokModel(process.env.GROK_MODEL);
  }

  return null;
}

export function configuredAgentReasoningLevel(
  model: string | null,
  metadata: Record<string, unknown>
) {
  const explicit = metadataText(metadata, [
    "reasoningLevel",
    "reasoningEffort",
    "reasoning_effort"
  ]);

  if (explicit) {
    return explicit;
  }

  if (model === "grok:formulation") {
    return configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) || "low";
  }

  if (model === "grok:food-guidance") {
    return (
      configuredGrokValue(process.env.FOOD_GUIDANCE_REASONING_EFFORT) ||
      configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) ||
      "low"
    );
  }

  if (model === "grok:healthscore") {
    return configuredGrokValue(process.env.HEALTHSCORE_REASONING_EFFORT) || "none";
  }

  if (model === "grok:nutrition-advisor") {
    return configuredGrokValue(process.env.NUTRITION_ADVISOR_REASONING_EFFORT) || null;
  }

  return null;
}

export function configuredAgentPrompt(metadata: Record<string, unknown>) {
  return metadataText(
    metadata,
    [
      "systemPrompt",
      "system_prompt",
      "prompt",
      "promptText",
      "promptMessages",
      "messages"
    ],
    { allowStructured: true }
  );
}

export function toJsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

export function requestForwardedOrigin(request: Request) {
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstForwardedValue(request.headers.get("host"));

  if (!host) {
    return null;
  }

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProto ||
    originFromUrl(request.url)?.split(":")[0] ||
    "https";

  return `${protocol}://${host}`;
}

export function configuredPasskeyOrigin() {
  return (
    originFromUrl(process.env.ADMIN_PASSKEY_ORIGIN) ||
    originFromUrl(process.env.APP_BASE_URL) ||
    originFromUrl(process.env.NEXT_PUBLIC_SITE_URL)
  );
}

export function requestOrigin(request: Request) {
  return (
    configuredPasskeyOrigin() ||
    requestForwardedOrigin(request) ||
    new URL(request.url).origin
  );
}

export function requestRpId(request: Request) {
  return process.env.ADMIN_PASSKEY_RP_ID?.trim() || new URL(requestOrigin(request)).hostname;
}

export function allowedOrigins(request: Request) {
  const configured = (process.env.ADMIN_PASSKEY_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const forwardedOrigin = requestForwardedOrigin(request);

  return Array.from(
    new Set([
      requestOrigin(request),
      forwardedOrigin,
      new URL(request.url).origin,
      ...configured
    ].filter(isNonEmptyString))
  );
}

export function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

export function roleValue(
  value: unknown,
  organisationType: AdminOrganisationType = "platform"
): AdminRole {
  return typeof value === "string"
    ? normalizeAdminRole(value, organisationType)
    : normalizeAdminRole(null, organisationType);
}

export function isoDateValue(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

export function passkeyDisplayId(value: unknown) {
  const credentialId = typeof value === "string" ? value : "";

  if (credentialId.length <= 14) {
    return credentialId || "passkey";
  }

  return `${credentialId.slice(0, 8)}...${credentialId.slice(-6)}`;
}

export function passkeyCredentialSummary(
  value: unknown
): AdminPasskeyCredentialSummary | null {
  const row = metadataRecord(value);
  const id = typeof row.id === "string" ? row.id : "";

  if (!id) {
    return null;
  }

  return {
    createdAt: isoDateValue(row.createdAt) ?? new Date(0).toISOString(),
    displayId: passkeyDisplayId(row.credentialId),
    id,
    label: typeof row.label === "string" && row.label.trim()
      ? row.label.trim()
      : null,
    lastUsedAt: isoDateValue(row.lastUsedAt),
    status: row.status === "revoked" ? "revoked" : "active"
  };
}

export function passkeyCredentialSummaries(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(passkeyCredentialSummary)
        .filter((item): item is AdminPasskeyCredentialSummary => Boolean(item))
    : [];
}

export function platformBootstrapEmail() {
  return normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL || "");
}

export function person(row: {
  active_passkey_count?: number | string | null;
  display_name: string;
  email: string;
  id: string;
  last_passkey_used_at?: Date | string | null;
  passkeys?: unknown;
  preferred_locale: string;
  status: string;
}): AdminPerson {
  return {
    activePasskeyCount: Number(row.active_passkey_count ?? 0) || 0,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    lastPasskeyUsedAt: row.last_passkey_used_at
      ? new Date(row.last_passkey_used_at).toISOString()
      : null,
    passkeys: passkeyCredentialSummaries(row.passkeys),
    preferredLocale: localeValue(row.preferred_locale),
    status:
      row.status === "active" || row.status === "disabled" || row.status === "invited"
        ? row.status
        : "disabled"
  };
}

export function organisation(row: {
  country_code?: string | null;
  currency?: string | null;
  default_locale: string;
  id: string;
  metadata?: unknown;
  name: string;
  organisation_type: string;
  slug: string;
  status: string;
}): AdminOrganisation {
  const organisationType = row.organisation_type === "platform" ? "platform" : "tenant";
  const currency = row.currency?.trim().toUpperCase() ?? "";

  return {
    countryCode:
      normalizeProductCountryCode(row.country_code) ?? defaultProductCountryCode,
    currency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : organisationType === "platform"
        ? "USD"
        : "THB",
    defaultLocale: localeValue(row.default_locale),
    dispatchCity: organisationDispatchCity({
      metadata: row.metadata,
      name: row.name,
      slug: row.slug
    }),
    flatRateShippingAmount: flatRateShippingAmountFromMetadata(row.metadata),
    id: row.id,
    name: row.name,
    slug: row.slug,
    status:
      row.status === "active" || row.status === "archived" || row.status === "disabled"
        ? row.status
        : "disabled",
    type: organisationType
  };
}

export function normalOrganisationCurrency(
  value: string | null | undefined,
  type: AdminOrganisationType
) {
  const fallback = type === "platform" ? "USD" : "THB";
  const currency = value?.trim().toUpperCase() || fallback;

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a three-letter ISO-4217 code");
  }

  return currency;
}

export function normalOrganisationCountry(value: string | null | undefined) {
  const countryCode =
    normalizeProductCountryCode(value) ?? defaultProductCountryCode;

  if (!countryCode) {
    throw new Error("Country must be a supported two-letter country code");
  }

  return countryCode;
}

export function membership(row: {
  id: string;
  organisation_id: string;
  organisation_type?: string;
  person_id: string;
  role: string;
  status: string;
  title: string | null;
}): AdminMembership {
  const organisationType: AdminOrganisationType =
    row.organisation_type === "tenant" ? "tenant" : "platform";

  return {
    id: row.id,
    organisationId: row.organisation_id,
    personId: row.person_id,
    role: roleValue(row.role, organisationType),
    status:
      row.status === "active" ||
      row.status === "deleted" ||
      row.status === "disabled" ||
      row.status === "invited"
        ? row.status
        : "disabled",
    title: row.title
  };
}


export async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required for admin access");
  }

  return sql;
}

export async function personHasPlatformOwnerMembership(sql: Db, personId: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.organisation_memberships
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where organisation_memberships.person_id = ${personId}::uuid
        and organisation_memberships.principal_type = 'person'
        and organisation_memberships.role = 'platform_owner'
        and organisation_memberships.status <> 'deleted'
        and not (organisation_memberships.metadata ? 'deletedAt')
        and organisations.organisation_type = 'platform'
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

export async function expirePendingAdminInvitations(
  sql: Db,
  organisationId?: string | null
) {
  if (organisationId) {
    await sql`
      update public.admin_invitations
      set status = 'expired', updated_at = now()
      where status = 'pending'
        and expires_at <= now()
        and organisation_id = ${organisationId}::uuid
    `;

    return;
  }

  await sql`
    update public.admin_invitations
    set status = 'expired', updated_at = now()
    where status = 'pending'
      and expires_at <= now()
  `;
}

export function hasPlatformAccessScope(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
}

export function scopedAccessOrganisationId(context?: AdminSessionContext | null) {
  if (!context || hasPlatformAccessScope(context)) {
    return null;
  }

  return context.effectiveOrganisation.id;
}

export function canAccessOrganisation(
  context: AdminSessionContext,
  organisationId: string
) {
  return hasPlatformAccessScope(context) || context.effectiveOrganisation.id === organisationId;
}

export async function personBelongsToOrganisation(
  sql: Db,
  personId: string,
  organisationId: string
) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.organisation_memberships
      where person_id = ${personId}::uuid
        and organisation_id = ${organisationId}::uuid
        and principal_type = 'person'
        and status <> 'deleted'
        and not (metadata ? 'deletedAt')
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

export async function platformOrganisation(sql: Db) {
  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    insert into public.organisations (
      slug,
      name,
      organisation_type,
      status,
      default_locale,
      country_code,
      currency
    )
    values (
      ${defaultPlatformOrgSlug},
      'MattaNutra',
      'platform',
      'active',
      'en',
      ${defaultProductCountryCode},
      'USD'
    )
    on conflict do nothing
    returning id::text, slug, name, organisation_type, status, default_locale, country_code, currency
  `;

  if (rows[0]) {
    return organisation(rows[0]);
  }

  const existing = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    select id::text, slug, name, organisation_type, status, default_locale, country_code, currency
    from public.organisations
    where lower(slug) = ${defaultPlatformOrgSlug}
    limit 1
  `;

  if (!existing[0]) {
    throw new Error("Unable to create platform organisation");
  }

  return organisation(existing[0]);
}
