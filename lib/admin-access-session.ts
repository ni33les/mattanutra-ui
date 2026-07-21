/**
 * Admin session create/resolve and cookie helpers.
 * Imported by the admin-access facade so call sites stay stable.
 */
import type {
  AdminClientSessionContext,
  AdminMembership,
  AdminPerson,
  AdminSessionContext
} from "@/lib/admin-access-types";
import {
  membership,
  organisation,
  person,
  platformOrganisation,
  sqlOrThrow
} from "@/lib/admin-access-shared";
import { permissionsForRole } from "@/lib/admin-rbac";
import {
  adminSessionMaxAgeSeconds,
  hashAdminToken,
  randomAdminToken,
  signAdminSession,
  verifySignedAdminSession
} from "@/lib/admin-session-cookie";

async function sessionContextFor({
  assumedOrganisationId,
  assumedPersonId,
  csrfToken,
  isLegacy,
  organisationId,
  personId,
  sessionCookie,
  sessionId
}: Readonly<{
  assumedOrganisationId?: string | null;
  assumedPersonId?: string | null;
  csrfToken?: string | null;
  isLegacy: boolean;
  organisationId: string;
  personId: string;
  sessionCookie?: string | null;
  sessionId?: string | null;
}>): Promise<AdminSessionContext | null> {
  const sql = await sqlOrThrow();
  const actorRows = await sql<Array<{
    default_locale: string;
    display_name: string;
    email: string;
    membership_id: string;
    membership_status: string;
    organisation_id: string;
    organisation_name: string;
    organisation_slug: string;
    organisation_status: string;
    organisation_type: string;
    person_id: string;
    preferred_locale: string;
    role: string;
    title: string | null;
    user_status: string;
  }>>`
    select
      people.id::text as person_id,
      people.email,
      people.display_name,
      people.preferred_locale,
      people.status as user_status,
      organisations.id::text as organisation_id,
      organisations.slug as organisation_slug,
      organisations.name as organisation_name,
      organisations.organisation_type,
      organisations.status as organisation_status,
      organisations.default_locale,
      organisation_memberships.id::text as membership_id,
      organisation_memberships.role,
      organisation_memberships.status as membership_status,
      organisation_memberships.title
    from public.organisation_memberships
    join public.people on people.id = organisation_memberships.person_id
    join public.organisations on organisations.id = organisation_memberships.organisation_id
    where people.id = ${personId}::uuid
      and organisations.id = ${organisationId}::uuid
      and people.status = 'active'
      and organisations.status = 'active'
      and organisation_memberships.principal_type = 'person'
      and organisation_memberships.status = 'active'
    limit 1
  `;
  const actor = actorRows[0];

  if (!actor) {
    return null;
  }

  let assumed: typeof actor | null = null;

  if (assumedPersonId && assumedOrganisationId) {
    const assumedRows = await sql<typeof actorRows>`
      select
        people.id::text as person_id,
        people.email,
        people.display_name,
        people.preferred_locale,
        people.status as user_status,
        organisations.id::text as organisation_id,
        organisations.slug as organisation_slug,
        organisations.name as organisation_name,
        organisations.organisation_type,
        organisations.status as organisation_status,
        organisations.default_locale,
        organisation_memberships.id::text as membership_id,
        organisation_memberships.role,
        organisation_memberships.status as membership_status,
        organisation_memberships.title
      from public.organisation_memberships
      join public.people on people.id = organisation_memberships.person_id
      join public.organisations on organisations.id = organisation_memberships.organisation_id
      where people.id = ${assumedPersonId}::uuid
        and organisations.id = ${assumedOrganisationId}::uuid
        and people.status = 'active'
        and organisations.status = 'active'
        and organisation_memberships.principal_type = 'person'
        and organisation_memberships.status = 'active'
      limit 1
    `;
    assumed = assumedRows[0] ?? null;
  }

  const actorPerson = person({
    display_name: actor.display_name,
    email: actor.email,
    id: actor.person_id,
    preferred_locale: actor.preferred_locale,
    status: actor.user_status
  });
  const actorOrganisation = organisation({
    default_locale: actor.default_locale,
    id: actor.organisation_id,
    name: actor.organisation_name,
    organisation_type: actor.organisation_type,
    slug: actor.organisation_slug,
    status: actor.organisation_status
  });
  const actorMembership = membership({
    id: actor.membership_id,
    organisation_id: actor.organisation_id,
    organisation_type: actor.organisation_type,
    person_id: actor.person_id,
    role: actor.role,
    status: actor.membership_status,
    title: actor.title
  });
  const assumedPerson = assumed
    ? person({
        display_name: assumed.display_name,
        email: assumed.email,
        id: assumed.person_id,
        preferred_locale: assumed.preferred_locale,
        status: assumed.user_status
      })
    : null;
  const assumedOrganisation = assumed
    ? organisation({
        default_locale: assumed.default_locale,
        id: assumed.organisation_id,
        name: assumed.organisation_name,
        organisation_type: assumed.organisation_type,
        slug: assumed.organisation_slug,
        status: assumed.organisation_status
      })
    : null;
  const assumedMembership = assumed
    ? membership({
        id: assumed.membership_id,
        organisation_id: assumed.organisation_id,
        organisation_type: assumed.organisation_type,
        person_id: assumed.person_id,
        role: assumed.role,
        status: assumed.membership_status,
        title: assumed.title
      })
    : null;
  const effectiveMembership = assumedMembership ?? actorMembership;

  return {
    actorMembership,
    actorOrganisation,
    actorPerson,
    assumedMembership,
    assumedOrganisation,
    assumedPerson,
    csrfToken: csrfToken ?? null,
    effectiveMembership,
    effectiveOrganisation: assumedOrganisation ?? actorOrganisation,
    effectivePerson: assumedPerson ?? actorPerson,
    expiresAt: new Date(Date.now() + adminSessionMaxAgeSeconds * 1000).toISOString(),
    isLegacy,
    permissions: [...permissionsForRole(effectiveMembership.role)],
    role: effectiveMembership.role,
    sessionCookie: sessionCookie ?? null,
    sessionId: sessionId ?? null
  };
}

export async function createAdminSession({
  organisationId,
  personId
}: Readonly<{
  organisationId: string;
  personId: string;
}>) {
  const sql = await sqlOrThrow();
  const sessionToken = randomAdminToken();
  const csrfToken = randomAdminToken(24);
  const expiresAt = new Date(Date.now() + adminSessionMaxAgeSeconds * 1000);
  const sessionRows = await sql<Array<{ id: string }>>`
    insert into public.admin_sessions (
      session_hash,
      person_id,
      organisation_id,
      csrf_token_hash,
      expires_at
    )
    values (
      ${hashAdminToken(sessionToken)},
      ${personId}::uuid,
      ${organisationId}::uuid,
      ${hashAdminToken(csrfToken)},
      ${expiresAt}
    )
    returning id::text
  `;
  const sessionId = sessionRows[0]?.id;

  if (!sessionId) {
    throw new Error("Unable to create admin session");
  }

  const context = await sessionContextFor({
    csrfToken,
    isLegacy: false,
    organisationId,
    personId,
    sessionId
  });

  if (!context) {
    throw new Error("Unable to resolve admin session");
  }

  const sessionCookie = signAdminSession({
    expiresAt: expiresAt.getTime(),
    organisationId,
    permissions: context.permissions,
    personId,
    role: context.role,
    sessionId
  });

  return {
    context: {
      ...context,
      expiresAt: expiresAt.toISOString(),
      sessionCookie
    },
    csrfToken,
    expiresAt,
    sessionCookie,
    sessionToken
  };
}

export async function resolveAdminSession({
  csrfToken,
  sessionCookie
}: Readonly<{
  csrfToken?: string | null;
  sessionCookie?: string | null;
}>) {
  const signed = verifySignedAdminSession(sessionCookie);

  if (!signed) {
    return null;
  }

  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    assumed_organisation_id: string | null;
    assumed_person_id: string | null;
    csrf_token_hash: string;
    organisation_id: string;
    person_id: string;
    session_hash: string;
  }>>`
    update public.admin_sessions
    set last_seen_at = now()
    where id = ${signed.sessionId}::uuid
      and session_hash = ${hashAdminToken(signed.sessionId)}
      and revoked_at is null
      and expires_at > now()
    returning
      session_hash,
      person_id::text,
      organisation_id::text,
      assumed_person_id::text,
      assumed_organisation_id::text,
      csrf_token_hash
  `;

  // Older signed cookies used the random session token as the cookie id. New DB rows use
  // the uuid primary key in the signed payload and keep the random token hash as a lookup
  // secret, so fall back to id-only verification for newly created rows.
  const row = rows[0] ?? (await sql<Array<{
    assumed_organisation_id: string | null;
    assumed_person_id: string | null;
    csrf_token_hash: string;
    organisation_id: string;
    person_id: string;
    session_hash: string;
  }>>`
    update public.admin_sessions
    set last_seen_at = now()
    where id = ${signed.sessionId}::uuid
      and revoked_at is null
      and expires_at > now()
    returning
      session_hash,
      person_id::text,
      organisation_id::text,
      assumed_person_id::text,
      assumed_organisation_id::text,
      csrf_token_hash
  `)[0];

  if (!row) {
    return null;
  }

  return sessionContextFor({
    assumedOrganisationId: row.assumed_organisation_id,
    assumedPersonId: row.assumed_person_id,
    csrfToken,
    isLegacy: false,
    organisationId: row.organisation_id,
    personId: row.person_id,
    sessionCookie,
    sessionId: signed.sessionId
  });
}

export async function revokeAdminSession(sessionCookie?: string | null) {
  const signed = verifySignedAdminSession(sessionCookie);

  if (!signed) {
    return;
  }

  const sql = await sqlOrThrow();

  await sql`
    update public.admin_sessions
    set revoked_at = coalesce(revoked_at, now())
    where id = ${signed.sessionId}::uuid
  `;
}

export async function legacyAdminContext(accessToken: string | null | undefined) {
  if (!accessToken) {
    return null;
  }

  const { adminDashboardTokenAllowed } = await import("@/lib/admin-auth");

  if (!adminDashboardTokenAllowed(accessToken)) {
    return null;
  }

  const sql = await sqlOrThrow();
  const org = await platformOrganisation(sql);
  const fallbackPerson: AdminPerson = {
    activePasskeyCount: 0,
    displayName: "Legacy admin",
    email: "legacy-admin@mattanutra.local",
    id: "00000000-0000-4000-8000-000000000001",
    lastPasskeyUsedAt: null,
    passkeys: [],
    preferredLocale: "en",
    status: "active"
  };
  const fallbackMembership: AdminMembership = {
    id: "00000000-0000-4000-8000-000000000002",
    organisationId: org.id,
    personId: fallbackPerson.id,
    role: "platform_owner",
    status: "active",
    title: "Legacy token"
  };

  return {
    actorMembership: fallbackMembership,
    actorOrganisation: org,
    actorPerson: fallbackPerson,
    assumedMembership: null,
    assumedOrganisation: null,
    assumedPerson: null,
    csrfToken: null,
    effectiveMembership: fallbackMembership,
    effectiveOrganisation: org,
    effectivePerson: fallbackPerson,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    isLegacy: true,
    permissions: [...permissionsForRole("platform_owner")],
    role: "platform_owner",
    sessionCookie: null,
    sessionId: null
  } satisfies AdminSessionContext;
}

export function clientAdminSessionContext(
  context: AdminSessionContext
): AdminClientSessionContext {
  const { csrfToken, sessionCookie, ...clientContext } =
    context;

  void csrfToken;
  void sessionCookie;

  return clientContext;
}

export function signAdminSessionContext(context: AdminSessionContext) {
  if (!context.sessionId || context.isLegacy) {
    return null;
  }

  return signAdminSession({
    assumedOrganisationId: context.assumedOrganisation?.id ?? null,
    assumedPersonId: context.assumedPerson?.id ?? null,
    expiresAt: new Date(context.expiresAt).getTime(),
    organisationId: context.actorOrganisation.id,
    permissions: context.permissions,
    personId: context.actorPerson.id,
    role: context.role,
    sessionId: context.sessionId
  });
}

export function adminCookieOptions(expires: Date) {
  return {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function adminCsrfCookieOptions(expires: Date) {
  return {
    expires,
    httpOnly: false,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function clearAdminCookieOptions() {
  return {
    expires: new Date(0),
    path: "/"
  };
}

export { adminCsrfCookieName, adminSessionCookieName } from "@/lib/admin-session-cookie";
