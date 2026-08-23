import { getSql, getWorkerSql } from "@/lib/db";
import {
  hashAdminToken,
  signedAdminSessionFromRequest
} from "@/lib/admin-session-cookie";
import {
  permissionsForAgentRole,
  permissionsForRole,
  type AdminPermission
} from "@/lib/admin-rbac";
import {
  bearerToken,
  legacyTokenMatches,
  type LegacyTokenSource
} from "@/lib/legacy-token-auth";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import { normalizeCapabilities } from "@/lib/task-service-utils";
import type {
  AccessPrincipal,
  AgentPrincipal,
  LegacyTokenPrincipal
} from "@/lib/admin-access-types";

export type {
  AccessPrincipal,
  AgentPrincipal,
  LegacyTokenPrincipal
} from "@/lib/admin-access-types";

type ResolveOptions = Readonly<{
  allowAgent?: boolean;
  allowLegacy?: LegacyTokenSource | "any" | false;
  allowSession?: boolean;
  requiredCapabilities?: readonly string[];
  requiredPermission?: AdminPermission;
}>;

function headerAgentToken(request: Request) {
  return request.headers.get("x-agent-api-key")?.trim() || bearerToken(request);
}

function legacyPrincipal(source: LegacyTokenSource): LegacyTokenPrincipal {
  const permissions: AdminPermission[] =
    source === "worker"
      ? ["tasks.read", "tasks.write"]
      : source === "admin_claw"
        ? [
            "alerts.read",
            "alerts.write",
            "catalogue.read",
            "catalogue.write",
            "communications.read",
            "communications.write",
            "content.read",
            "content.write",
            "marketing.read",
            "performance.read",
            "performance.write",
            "reviews.read",
            "reviews.write",
            "tasks.read",
            "tasks.write"
          ]
        : [...permissionsForRole("platform_owner")];

  return {
    permissions,
    source,
    type: "legacy_token"
  };
}

function legacyTokenFromRequest(
  request: Request,
  allowLegacy: ResolveOptions["allowLegacy"]
) {
  if (!allowLegacy) {
    return null;
  }

  const suppliedBearer = bearerToken(request);
  const candidates: LegacyTokenSource[] =
    allowLegacy === "any"
      ? ["admin_claw", "admin_dashboard", "worker"]
      : [allowLegacy];

  for (const source of candidates) {
    const header =
      source === "admin_claw"
        ? request.headers.get("x-admin-claw-token")
        : source === "admin_dashboard"
          ? request.headers.get("x-admin-dashboard-token")
          : request.headers.get("x-worker-api-token");

    if (
      legacyTokenMatches(source, suppliedBearer) ||
      legacyTokenMatches(source, header)
    ) {
      return legacyPrincipal(source);
    }
  }

  return null;
}

async function auditLegacyTokenUse(request: Request, source: LegacyTokenSource) {
  const sql = getSql();

  if (!sql) {
    return;
  }

  try {
    const url = new URL(request.url);

    await sql`
      insert into public.admin_audit_events (
        organisation_id,
        actor_person_id,
        assumed_person_id,
        action,
        resource_type,
        resource_id,
        metadata,
        created_at
      )
      values (
        null,
        null,
        null,
        'legacy_token_auth.used',
        'legacy_token',
        ${source},
        ${sql.json({
          method: request.method,
          path: url.pathname
        })}::jsonb,
        now()
      )
    `;
  } catch (error) {
    console.warn("Unable to audit legacy token use", error);
  }
}

function hasCapabilities(
  principal: Pick<AgentPrincipal, "capabilities">,
  requiredCapabilities: readonly string[] | undefined
) {
  if (!requiredCapabilities || requiredCapabilities.length < 1) {
    return true;
  }

  const agentCapabilities = new Set(principal.capabilities);

  return requiredCapabilities.every((capability) => agentCapabilities.has(capability));
}

type AgentPrincipalRow = Readonly<{
  agent_id: string;
  agent_name: string;
  agent_type: string;
  capabilities: string[] | null;
  credential_id: string;
  membership_id: string;
  organisation_country_code: string | null;
  organisation_id: string;
  organisation_currency: string | null;
  organisation_default_locale: string;
  organisation_name: string;
  organisation_slug: string;
  organisation_status: string;
  organisation_type: string;
  person_display_name: string | null;
  person_email: string | null;
  person_id: string | null;
  person_preferred_locale: string | null;
  person_status: string | null;
  role: string;
}>;

function agentPrincipalFromRow(
  row: AgentPrincipalRow | null | undefined,
  options: ResolveOptions
): AgentPrincipal | null {
  const role =
    row?.role === "platform_agent" || row?.role === "retail_agent"
      ? row.role
      : null;

  if (!row || !role) {
    return null;
  }

  const principal: AgentPrincipal = {
    agentId: row.agent_id,
    agentName: row.agent_name,
    capabilities: normalizeCapabilities(row.capabilities),
    credentialId: row.credential_id,
    membershipId: row.membership_id,
    organisation: {
      countryCode:
        normalizeProductCountryCode(row.organisation_country_code) ??
        defaultProductCountryCode,
      currency:
        typeof row.organisation_currency === "string" &&
        /^[A-Z]{3}$/.test(row.organisation_currency)
          ? row.organisation_currency
          : row.organisation_type === "platform"
            ? "USD"
            : "THB",
      defaultLocale:
        row.organisation_default_locale === "th" ||
        row.organisation_default_locale === "zh-CN"
          ? row.organisation_default_locale
          : "en",
      id: row.organisation_id,
      name: row.organisation_name,
      slug: row.organisation_slug,
      status:
        row.organisation_status === "archived" ||
        row.organisation_status === "disabled"
          ? row.organisation_status
          : "active",
      type: row.organisation_type === "tenant" ? "tenant" : "platform"
    },
    permissions: [...permissionsForAgentRole(role)],
    person: row.person_id
      ? {
          activePasskeyCount: 0,
          displayName: row.person_display_name ?? row.person_email ?? row.agent_name,
          email: row.person_email ?? "",
          id: row.person_id,
          lastPasskeyUsedAt: null,
          passkeys: [],
          preferredLocale:
            row.person_preferred_locale === "th" ||
            row.person_preferred_locale === "zh-CN"
              ? row.person_preferred_locale
              : "en",
          status:
            row.person_status === "disabled" || row.person_status === "invited"
              ? row.person_status
              : "active"
        }
      : null,
    role,
    type: "agent"
  };

  const permissionAllowed = options.requiredPermission
    ? principal.permissions.includes(options.requiredPermission)
    : true;

  return permissionAllowed && hasCapabilities(principal, options.requiredCapabilities)
    ? principal
    : null;
}

const CREDENTIAL_USE_TOUCH_MS = 60_000;
const credentialUseTouchedAt = new Map<string, number>();

function agentAuthSql(options: ResolveOptions) {
  if (options.allowLegacy === "worker") {
    return getWorkerSql() ?? getSql();
  }

  return getSql();
}

async function markAgentCredentialUsed(
  sql: NonNullable<ReturnType<typeof getSql>>,
  credentialId: string
) {
  const lastTouchedAt = credentialUseTouchedAt.get(credentialId) ?? 0;

  if (Date.now() - lastTouchedAt < CREDENTIAL_USE_TOUCH_MS) {
    return;
  }

  credentialUseTouchedAt.set(credentialId, Date.now());
  await sql`
    update public.agent_credentials
    set last_used_at = now(), updated_at = now()
    where id = ${credentialId}::uuid
  `;
}

type AgentAuthFailureRow = Readonly<{
  agent_status: string | null;
  credential_expires_at: string | null;
  credential_id: string | null;
  credential_revoked_at: string | null;
  credential_status: string | null;
  membership_role: string | null;
  membership_status: string | null;
  organisation_status: string | null;
}>;

function authFailureReason(row: AgentAuthFailureRow | null | undefined) {
  if (!row?.credential_id) {
    return "credential_hash_not_found";
  }

  if (row.credential_status !== "active") {
    return "credential_inactive";
  }

  if (row.credential_revoked_at) {
    return "credential_revoked";
  }

  if (
    row.credential_expires_at &&
    new Date(row.credential_expires_at).getTime() <= Date.now()
  ) {
    return "credential_expired";
  }

  if (row.agent_status !== "active") {
    return "agent_inactive";
  }

  if (row.membership_status !== "active") {
    return "membership_inactive";
  }

  if (
    row.membership_role !== "platform_agent" &&
    row.membership_role !== "retail_agent"
  ) {
    return "membership_role_invalid";
  }

  if (row.organisation_status !== "active") {
    return "organisation_inactive";
  }

  return "permission_or_capability_denied";
}

async function logAgentAuthFailure(
  sql: NonNullable<ReturnType<typeof getSql>>,
  credentialHash: string
) {
  try {
    const rows = await sql<AgentAuthFailureRow[]>`
      select
        agent_credentials.id::text as credential_id,
        agent_credentials.status as credential_status,
        agent_credentials.revoked_at::text as credential_revoked_at,
        agent_credentials.expires_at::text as credential_expires_at,
        agents.status as agent_status,
        organisation_memberships.role as membership_role,
        organisation_memberships.status as membership_status,
        organisations.status as organisation_status
      from public.agent_credentials
      left join public.organisation_memberships
        on organisation_memberships.id = agent_credentials.membership_id
        and organisation_memberships.agent_id = agent_credentials.agent_id
        and organisation_memberships.principal_type = 'agent'
      left join public.agents
        on agents.id = agent_credentials.agent_id
      left join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where agent_credentials.credential_hash = ${credentialHash}
      order by agent_credentials.created_at desc
      limit 1
    `;

    console.warn(
      `[worker-auth] agent credential rejected reason=${authFailureReason(rows[0])}`
    );
  } catch {
    console.warn("[worker-auth] agent credential rejected reason=diagnostic_failed");
  }
}

async function agentPrincipalFromToken(
  request: Request,
  options: ResolveOptions
): Promise<AgentPrincipal | null> {
  if (!options.allowAgent) {
    return null;
  }

  const token = headerAgentToken(request);

  if (!token) {
    return null;
  }

  const sql = agentAuthSql(options);

  if (!sql) {
    return null;
  }

  const credentialHash = hashAdminToken(token);
  const rows = await sql<AgentPrincipalRow[]>`
    select
      agent_credentials.id::text as credential_id,
      organisation_memberships.id::text as membership_id,
      agents.id::text as agent_id,
      agents.name as agent_name,
      agents.agent_type,
      organisation_memberships.role,
      agents.capabilities,
      organisations.id::text as organisation_id,
      organisations.slug as organisation_slug,
      organisations.name as organisation_name,
      organisations.organisation_type,
      organisations.status as organisation_status,
      organisations.default_locale as organisation_default_locale,
      organisations.country_code as organisation_country_code,
      organisations.currency as organisation_currency,
      people.id::text as person_id,
      people.email as person_email,
      people.display_name as person_display_name,
      people.preferred_locale as person_preferred_locale,
      people.status as person_status
    from public.agent_credentials
    join public.organisation_memberships
      on organisation_memberships.id = agent_credentials.membership_id
      and organisation_memberships.agent_id = agent_credentials.agent_id
      and organisation_memberships.principal_type = 'agent'
    join public.agents
      on agents.id = agent_credentials.agent_id
    join public.organisations
      on organisations.id = organisation_memberships.organisation_id
    left join public.people
      on people.id = agents.person_id
    where agent_credentials.credential_hash = ${credentialHash}
      and agent_credentials.status = 'active'
      and agent_credentials.revoked_at is null
      and (agent_credentials.expires_at is null or agent_credentials.expires_at > now())
      and agents.status = 'active'
      and organisation_memberships.status = 'active'
      and organisations.status = 'active'
    limit 1
  `;
  const principal = agentPrincipalFromRow(rows[0], options);

  if (principal) {
    await markAgentCredentialUsed(sql, principal.credentialId);

    return principal;
  }

  await logAgentAuthFailure(sql, credentialHash);

  return null;
}

function sessionPrincipalFromRequest(
  request: Request,
  options: ResolveOptions
): AccessPrincipal | null {
  if (!options.allowSession) {
    return null;
  }

  const session = signedAdminSessionFromRequest(request);

  if (!session) {
    return null;
  }

  if (
    options.requiredPermission &&
    !session.permissions.includes(options.requiredPermission)
  ) {
    return null;
  }

  return {
    context: {
      actorMembership: {
        id: "",
        organisationId: session.organisationId,
        personId: session.personId,
        role: session.role,
        status: "active",
        title: null
      },
      actorOrganisation: {
        countryCode: defaultProductCountryCode,
        currency: "USD",
        defaultLocale: "en",
        id: session.organisationId,
        name: "",
        slug: "",
        status: "active",
        type: "platform"
      },
      actorPerson: {
        activePasskeyCount: 0,
        displayName: "",
        email: "",
        id: session.personId,
        lastPasskeyUsedAt: null,
        passkeys: [],
        preferredLocale: "en",
        status: "active"
      },
      assumedMembership: null,
      assumedOrganisation: null,
      assumedPerson: null,
      csrfToken: null,
      effectiveMembership: {
        id: "",
        organisationId: session.assumedOrganisationId ?? session.organisationId,
        personId: session.assumedPersonId ?? session.personId,
        role: session.role,
        status: "active",
        title: null
      },
      effectiveOrganisation: {
        countryCode: defaultProductCountryCode,
        currency: "USD",
        defaultLocale: "en",
        id: session.assumedOrganisationId ?? session.organisationId,
        name: "",
        slug: "",
        status: "active",
        type: "platform"
      },
      effectivePerson: {
        activePasskeyCount: 0,
        displayName: "",
        email: "",
        id: session.assumedPersonId ?? session.personId,
        lastPasskeyUsedAt: null,
        passkeys: [],
        preferredLocale: "en",
        status: "active"
      },
      expiresAt: new Date(session.expiresAt).toISOString(),
      isLegacy: false,
      permissions: session.permissions,
      role: session.role,
      sessionCookie: null,
      sessionId: session.sessionId
    },
    permissions: session.permissions,
    type: "person"
  };
}

export async function resolveAccessPrincipal(
  request: Request,
  options: ResolveOptions = {}
): Promise<AccessPrincipal | null> {
  const agent = await agentPrincipalFromToken(request, options);

  if (agent) {
    return agent;
  }

  const session = sessionPrincipalFromRequest(request, options);

  if (session) {
    return session;
  }

  const legacy = legacyTokenFromRequest(request, options.allowLegacy);

  if (
    legacy &&
    (!options.requiredPermission ||
      legacy.permissions.includes(options.requiredPermission))
  ) {
    await auditLegacyTokenUse(request, legacy.source);
    return legacy;
  }

  return null;
}

export async function requireAgentPermission(
  request: Request,
  permission: AdminPermission,
  options: Omit<ResolveOptions, "allowAgent" | "requiredPermission"> = {}
) {
  return resolveAccessPrincipal(request, {
    ...options,
    allowAgent: true,
    requiredPermission: permission
  });
}
