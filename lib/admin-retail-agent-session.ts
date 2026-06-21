import type {
  AdminMembership,
  AdminOrganisation,
  AdminPerson,
  AdminSessionContext
} from "@/lib/admin-access";
import { permissionsForRole } from "@/lib/admin-rbac";
import { isLocale } from "@/lib/i18n";
import type { StockDb } from "@/lib/admin-retail-stock-types";

export async function retailAgentSessionContext(
  sql: StockDb,
  input: Readonly<{ organisationId: string; taskId: string }>
): Promise<AdminSessionContext> {
  const organisationRows = await sql<Array<{
    country_code: string;
    currency: string;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    select
      id::text,
      slug,
      name,
      organisation_type,
      status,
      default_locale,
      country_code,
      currency
    from public.organisations
    where id = ${input.organisationId}::uuid
      and status = 'active'
    limit 1
  `;
  const row = organisationRows[0];

  if (!row) {
    throw new Error("Retail command organisation not found");
  }

  const organisation: AdminOrganisation = {
    countryCode: row.country_code,
    currency: row.currency,
    defaultLocale: isLocale(row.default_locale) ? row.default_locale : "en",
    id: row.id,
    name: row.name,
    slug: row.slug,
    status:
      row.status === "archived" || row.status === "disabled"
        ? row.status
        : "active",
    type: row.organisation_type === "platform" ? "platform" : "tenant"
  };
  const actorPerson: AdminPerson = {
    displayName: "Retail workflow agent",
    email: "retail-agent@mattanutra.local",
    id: "00000000-0000-4000-8000-000000000003",
    preferredLocale: organisation.defaultLocale,
    status: "active"
  };
  const actorMembership: AdminMembership = {
    id: "00000000-0000-4000-8000-000000000004",
    organisationId: organisation.id,
    personId: actorPerson.id,
    role: "retail_agent",
    status: "active",
    title: "Retail workflow agent"
  };

  return {
    actorMembership,
    actorOrganisation: organisation,
    actorPerson,
    assumedMembership: null,
    assumedOrganisation: null,
    assumedPerson: null,
    csrfToken: null,
    effectiveMembership: actorMembership,
    effectiveOrganisation: organisation,
    effectivePerson: actorPerson,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    isLegacy: false,
    permissions: [...permissionsForRole("retail_agent")],
    role: "retail_agent",
    sessionCookie: null,
    sessionId: `task:${input.taskId}`
  };
}
