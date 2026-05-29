import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON
} from "@simplewebauthn/server";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  adminSessionMaxAgeSeconds,
  hashAdminToken,
  randomAdminToken,
  signAdminSession,
  verifySignedAdminSession
} from "@/lib/admin-session-cookie";
import {
  adminRoleLabels,
  isAdminRole,
  permissionsForRole,
  type AdminPermission,
  type AdminRole
} from "@/lib/admin-rbac";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";

type Db = NonNullable<ReturnType<typeof getSql>>;

export type AdminOrganisationType = "platform" | "tenant";
export type AdminAccessStatus = "active" | "disabled" | "invited";

export type AdminOrganisation = Readonly<{
  defaultLocale: Locale;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "disabled";
  type: AdminOrganisationType;
}>;

export type AdminPerson = Readonly<{
  displayName: string;
  email: string;
  id: string;
  preferredLocale: Locale;
  status: AdminAccessStatus;
}>;

export type AdminMembership = Readonly<{
  id: string;
  organisationId: string;
  personId: string;
  role: AdminRole;
  status: AdminAccessStatus;
  title: string | null;
}>;

export type AdminInvitation = Readonly<{
  email: string;
  expiresAt: string;
  id: string;
  organisationId: string;
  preferredLocale: Locale;
  role: AdminRole;
  status: "accepted" | "expired" | "pending" | "revoked";
}>;

export type AdminAuditEvent = Readonly<{
  action: string;
  actorPersonId: string | null;
  assumedPersonId: string | null;
  createdAt: string;
  id: string;
  organisationId: string | null;
  resourceId: string | null;
  resourceType: string | null;
}>;

export type AdminAccessAgent = Readonly<{
  capabilities: string[];
  id: string;
  name: string;
  organisationId: string | null;
  personId: string | null;
  status: string;
  type: string;
}>;

export type AdminAccessData = Readonly<{
  agents: AdminAccessAgent[];
  auditEvents: AdminAuditEvent[];
  invitations: AdminInvitation[];
  memberships: AdminMembership[];
  organisations: AdminOrganisation[];
  people: AdminPerson[];
  roleLabels: Record<AdminRole, string>;
  roles: AdminRole[];
}>;

export type AdminSessionContext = Readonly<{
  actorMembership: AdminMembership;
  actorOrganisation: AdminOrganisation;
  actorPerson: AdminPerson;
  assumedMembership: AdminMembership | null;
  assumedOrganisation: AdminOrganisation | null;
  assumedPerson: AdminPerson | null;
  csrfToken: string | null;
  effectiveMembership: AdminMembership;
  effectiveOrganisation: AdminOrganisation;
  effectivePerson: AdminPerson;
  expiresAt: string;
  isLegacy: boolean;
  permissions: AdminPermission[];
  role: AdminRole;
  sessionCookie: string | null;
  sessionId: string | null;
}>;

type ChallengeRow = Readonly<{
  challenge: string;
  email: string | null;
  id: string;
  metadata: Record<string, unknown>;
  person_id: string | null;
}>;

type RawChallengeRow = Omit<ChallengeRow, "metadata"> & Readonly<{
  metadata: unknown;
}>;

type CredentialRow = Readonly<{
  backed_up: boolean;
  counter: number | string;
  credential_id: string;
  credential_public_key: string;
  device_type: string | null;
  id: string;
  person_id: string;
  transports: AuthenticatorTransportFuture[];
}>;

const registrationChallengeMinutes = 10;
const loginChallengeMinutes = 5;
const inviteDays = 7;
const defaultPlatformOrgSlug = "mattanutra";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}

function base64Url(value: Uint8Array | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function bytesFromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function originFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function isNonEmptyString(value: string | null): value is string {
  return Boolean(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
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

function toJsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

function requestForwardedOrigin(request: Request) {
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

function configuredPasskeyOrigin() {
  return (
    originFromUrl(process.env.ADMIN_PASSKEY_ORIGIN) ||
    originFromUrl(process.env.APP_BASE_URL) ||
    originFromUrl(process.env.NEXT_PUBLIC_SITE_URL)
  );
}

function requestOrigin(request: Request) {
  return (
    configuredPasskeyOrigin() ||
    requestForwardedOrigin(request) ||
    new URL(request.url).origin
  );
}

function requestRpId(request: Request) {
  return process.env.ADMIN_PASSKEY_RP_ID?.trim() || new URL(requestOrigin(request)).hostname;
}

function allowedOrigins(request: Request) {
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

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

function roleValue(value: unknown): AdminRole {
  return isAdminRole(value) ? value : "viewer";
}

function platformBootstrapEmail() {
  return normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL || "");
}

function person(row: {
  display_name: string;
  email: string;
  id: string;
  preferred_locale: string;
  status: string;
}): AdminPerson {
  return {
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    preferredLocale: localeValue(row.preferred_locale),
    status:
      row.status === "active" || row.status === "disabled" || row.status === "invited"
        ? row.status
        : "disabled"
  };
}

function organisation(row: {
  default_locale: string;
  id: string;
  name: string;
  organisation_type: string;
  slug: string;
  status: string;
}): AdminOrganisation {
  return {
    defaultLocale: localeValue(row.default_locale),
    id: row.id,
    name: row.name,
    slug: row.slug,
    status:
      row.status === "active" || row.status === "archived" || row.status === "disabled"
        ? row.status
        : "disabled",
    type: row.organisation_type === "platform" ? "platform" : "tenant"
  };
}

function membership(row: {
  id: string;
  organisation_id: string;
  person_id: string;
  role: string;
  status: string;
  title: string | null;
}): AdminMembership {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    personId: row.person_id,
    role: roleValue(row.role),
    status:
      row.status === "active" || row.status === "disabled" || row.status === "invited"
        ? row.status
        : "disabled",
    title: row.title
  };
}

async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is required for admin access");
  }

  return sql;
}

async function platformOrganisation(sql: Db) {
  const rows = await sql<Array<{
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
      default_locale
    )
    values (
      ${defaultPlatformOrgSlug},
      'MattaNutra',
      'platform',
      'active',
      'en'
    )
    on conflict do nothing
    returning id::text, slug, name, organisation_type, status, default_locale
  `;

  if (rows[0]) {
    return organisation(rows[0]);
  }

  const existing = await sql<Array<{
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    select id::text, slug, name, organisation_type, status, default_locale
    from public.organisations
    where lower(slug) = ${defaultPlatformOrgSlug}
    limit 1
  `;

  if (!existing[0]) {
    throw new Error("Unable to create platform organisation");
  }

  return organisation(existing[0]);
}

export async function hasPlatformOwner() {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.organisation_memberships
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      join public.people on people.id = organisation_memberships.person_id
      where organisations.organisation_type = 'platform'
        and organisation_memberships.role = 'platform_owner'
        and organisation_memberships.status = 'active'
        and people.status = 'active'
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

async function createChallenge({
  challenge,
  challengeType,
  email,
  expiresInMinutes,
  metadata,
  personId
}: Readonly<{
  challenge: string;
  challengeType: "authentication" | "registration";
  email?: string | null;
  expiresInMinutes: number;
  metadata?: Record<string, unknown>;
  personId?: string | null;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{ id: string }>>`
    insert into public.admin_auth_challenges (
      challenge,
      challenge_type,
      person_id,
      email,
      metadata,
      expires_at
    )
    values (
      ${challenge},
      ${challengeType},
      ${personId ?? null},
      ${email ?? null},
      ${sql.json(toJsonValue(metadata ?? {}))}::jsonb,
      now() + (${expiresInMinutes}::text || ' minutes')::interval
    )
    returning id::text
  `;

  return rows[0]?.id;
}

async function consumeChallenge(id: string, challengeType: "authentication" | "registration") {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<RawChallengeRow>>`
    update public.admin_auth_challenges
    set consumed_at = now()
    where id = ${id}::uuid
      and challenge_type = ${challengeType}
      and consumed_at is null
      and expires_at > now()
    returning
      id::text,
      challenge,
      person_id::text,
      email,
      metadata
  `;
  const row = rows[0];

  return row ? { ...row, metadata: metadataRecord(row.metadata) } : null;
}

async function credentialsForPerson(personId: string) {
  const sql = await sqlOrThrow();

  return sql<Array<CredentialRow>>`
    select
      id::text,
      person_id::text,
      credential_id,
      credential_public_key,
      counter,
      transports,
      device_type,
      backed_up
    from public.admin_passkey_credentials
    where person_id = ${personId}::uuid
    order by updated_at desc
  `;
}

export async function createRegistrationOptions({
  accessToken,
  displayName,
  email,
  inviteToken,
  locale,
  request
}: Readonly<{
  accessToken?: string | null;
  displayName?: string | null;
  email: string;
  inviteToken?: string | null;
  locale: Locale;
  request: Request;
}>) {
  const normalizedEmail = normalizeEmail(email);
  const sql = await sqlOrThrow();
  const rpID = requestRpId(request);
  const rpName = "MattaNutra Admin";
  let metadata: Record<string, unknown> = {
    displayName: displayName?.trim() || displayNameFromEmail(normalizedEmail),
    email: normalizedEmail,
    locale,
    mode: "bootstrap"
  };

  if (inviteToken) {
    const inviteRows = await sql<Array<{
      email: string;
      id: string;
      organisation_id: string;
      preferred_locale: string;
      role: string;
    }>>`
      select
        id::text,
        organisation_id::text,
        email,
        role,
        preferred_locale
      from public.admin_invitations
      where token_hash = ${hashAdminToken(inviteToken)}
        and status = 'pending'
        and expires_at > now()
      limit 1
    `;
    const invite = inviteRows[0];

    if (!invite || normalizeEmail(invite.email) !== normalizedEmail) {
      throw new Error("This invite is not valid for that email address");
    }

    metadata = {
      ...metadata,
      invitationId: invite.id,
      locale: localeValue(invite.preferred_locale),
      mode: "invite",
      organisationId: invite.organisation_id,
      role: invite.role
    };
  } else {
    const ownerExists = await hasPlatformOwner();
    const bootstrapEmail = platformBootstrapEmail();

    if (ownerExists) {
      throw new Error("Admin bootstrap is closed. Ask an owner for an invite.");
    }

    if (bootstrapEmail && bootstrapEmail !== normalizedEmail) {
      throw new Error("This email is not allowed to bootstrap admin access");
    }

    if (!accessToken) {
      throw new Error("The legacy admin token is required for first-owner bootstrap");
    }

    const { adminDashboardTokenAllowed } = await import("@/lib/admin-auth");

    if (!adminDashboardTokenAllowed(accessToken)) {
      throw new Error("The legacy admin token is not valid");
    }

    const org = await platformOrganisation(sql);
    metadata = {
      ...metadata,
      mode: "bootstrap",
      organisationId: org.id,
      role: "platform_owner"
    };
  }

  const existingPeople = await sql<Array<{ id: string }>>`
    select id::text
    from public.people
    where lower(email) = ${normalizedEmail}
    limit 1
  `;
  const existingCredentials = existingPeople[0]
    ? await credentialsForPerson(existingPeople[0].id)
    : [];
  const options = await generateRegistrationOptions({
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required"
    },
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credential_id,
      transports: credential.transports
    })),
    rpID,
    rpName,
    timeout: 60_000,
    userDisplayName: String(metadata.displayName),
    userID: Buffer.from(normalizedEmail),
    userName: normalizedEmail
  });
  const challengeId = await createChallenge({
    challenge: options.challenge,
    challengeType: "registration",
    email: normalizedEmail,
    expiresInMinutes: registrationChallengeMinutes,
    metadata
  });

  if (!challengeId) {
    throw new Error("Unable to create registration challenge");
  }

  return { challengeId, options };
}

async function upsertPersonAndMembership({
  displayName,
  email,
  locale,
  organisationId,
  role
}: Readonly<{
  displayName: string;
  email: string;
  locale: Locale;
  organisationId: string;
  role: AdminRole;
}>) {
  const sql = await sqlOrThrow();
  await sql`
    insert into public.people (
      email,
      display_name,
      preferred_locale,
      status
    )
    values (
      ${email},
      ${displayName},
      ${locale},
      'active'
    )
    on conflict do nothing
  `;

  const people = await sql<Array<{
    display_name: string;
    email: string;
    id: string;
    preferred_locale: string;
    status: string;
  }>>`
    update public.people
    set
      display_name = ${displayName},
      preferred_locale = ${locale},
      status = 'active',
      updated_at = now()
    where lower(email) = ${email}
    returning id::text, email, display_name, preferred_locale, status
  `;
  const savedPerson = people[0];

  if (!savedPerson) {
    throw new Error("Unable to save admin person");
  }

  await sql`
    insert into public.organisation_memberships (
      organisation_id,
      person_id,
      role,
      status
    )
    values (
      ${organisationId}::uuid,
      ${savedPerson.id}::uuid,
      ${role},
      'active'
    )
    on conflict (person_id, organisation_id) do update set
      role = excluded.role,
      status = 'active',
      updated_at = now()
  `;

  return person(savedPerson);
}

export async function verifyRegistrationAndCreateSession({
  challengeId,
  request,
  response
}: Readonly<{
  challengeId: string;
  request: Request;
  response: RegistrationResponseJSON;
}>) {
  const challenge = await consumeChallenge(challengeId, "registration");

  if (!challenge) {
    throw new Error("Registration challenge expired");
  }

  const verified = await verifyRegistrationResponse({
    expectedChallenge: challenge.challenge,
    expectedOrigin: allowedOrigins(request),
    expectedRPID: requestRpId(request),
    requireUserVerification: true,
    response
  });

  if (!verified.verified) {
    throw new Error("Passkey registration could not be verified");
  }

  const info = verified.registrationInfo;
  const email = normalizeEmail(String(challenge.metadata.email || challenge.email || ""));
  const displayName = String(challenge.metadata.displayName || displayNameFromEmail(email));
  const locale = localeValue(challenge.metadata.locale);
  const organisationId = String(challenge.metadata.organisationId || "");
  const role = roleValue(challenge.metadata.role);

  if (!email || !organisationId) {
    throw new Error("Registration challenge is missing identity metadata");
  }

  const savedPerson = await upsertPersonAndMembership({
    displayName,
    email,
    locale,
    organisationId,
    role
  });
  const sql = await sqlOrThrow();

  await sql`
    insert into public.admin_passkey_credentials (
      person_id,
      credential_id,
      credential_public_key,
      counter,
      transports,
      device_type,
      backed_up,
      label
    )
    values (
      ${savedPerson.id}::uuid,
      ${info.credential.id},
      ${base64Url(info.credential.publicKey)},
      ${info.credential.counter},
      ${response.response.transports ?? []},
      ${info.credentialDeviceType},
      ${info.credentialBackedUp},
      'Passkey'
    )
    on conflict (credential_id) do update set
      credential_public_key = excluded.credential_public_key,
      counter = excluded.counter,
      transports = excluded.transports,
      device_type = excluded.device_type,
      backed_up = excluded.backed_up,
      updated_at = now()
  `;

  if (challenge.metadata.invitationId) {
    await sql`
      update public.admin_invitations
      set status = 'accepted', accepted_at = now(), updated_at = now()
      where id = ${String(challenge.metadata.invitationId)}::uuid
    `;
  }

  await recordAdminAudit({
    action: "admin.passkey_registered",
    actorPersonId: savedPerson.id,
    organisationId,
    resourceId: savedPerson.id,
    resourceType: "person"
  });

  return createAdminSession({ organisationId, personId: savedPerson.id });
}

export async function createAuthenticationOptions({
  email,
  request
}: Readonly<{
  email: string;
  request: Request;
}>) {
  const normalizedEmail = normalizeEmail(email);
  const sql = await sqlOrThrow();
  const people = await sql<Array<{
    display_name: string;
    email: string;
    id: string;
    preferred_locale: string;
    status: string;
  }>>`
    select id::text, email, display_name, preferred_locale, status
    from public.people
    where lower(email) = ${normalizedEmail}
      and status = 'active'
    limit 1
  `;
  const adminPerson = people[0];

  if (!adminPerson) {
    throw new Error("No active admin user exists for that email");
  }

  const credentials = await credentialsForPerson(adminPerson.id);

  if (credentials.length === 0) {
    throw new Error("No passkeys are registered for that admin user");
  }

  const options = await generateAuthenticationOptions({
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: credential.transports
    })),
    rpID: requestRpId(request),
    timeout: 60_000,
    userVerification: "required"
  });
  const challengeId = await createChallenge({
    challenge: options.challenge,
    challengeType: "authentication",
    email: normalizedEmail,
    expiresInMinutes: loginChallengeMinutes,
    personId: adminPerson.id
  });

  if (!challengeId) {
    throw new Error("Unable to create login challenge");
  }

  return { challengeId, options };
}

async function credentialById(credentialId: string, personId: string | null) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<CredentialRow>>`
    select
      id::text,
      person_id::text,
      credential_id,
      credential_public_key,
      counter,
      transports,
      device_type,
      backed_up
    from public.admin_passkey_credentials
    where credential_id = ${credentialId}
      and (${personId}::uuid is null or person_id = ${personId}::uuid)
    limit 1
  `;

  return rows[0] ?? null;
}

export async function verifyAuthenticationAndCreateSession({
  challengeId,
  request,
  response
}: Readonly<{
  challengeId: string;
  request: Request;
  response: AuthenticationResponseJSON;
}>) {
  const challenge = await consumeChallenge(challengeId, "authentication");

  if (!challenge) {
    throw new Error("Login challenge expired");
  }

  const credential = await credentialById(response.id, challenge.person_id);

  if (!credential) {
    throw new Error("This passkey is not registered");
  }

  const verification = await verifyAuthenticationResponse({
    credential: {
      counter: Number(credential.counter) || 0,
      id: credential.credential_id,
      publicKey: bytesFromBase64Url(credential.credential_public_key),
      transports: credential.transports
    },
    expectedChallenge: challenge.challenge,
    expectedOrigin: allowedOrigins(request),
    expectedRPID: requestRpId(request),
    requireUserVerification: true,
    response
  });

  if (!verification.verified) {
    throw new Error("Passkey login could not be verified");
  }

  const sql = await sqlOrThrow();

  await sql`
    update public.admin_passkey_credentials
    set
      counter = ${verification.authenticationInfo.newCounter},
      backed_up = ${verification.authenticationInfo.credentialBackedUp},
      device_type = ${verification.authenticationInfo.credentialDeviceType},
      last_used_at = now(),
      updated_at = now()
    where id = ${credential.id}::uuid
  `;

  const memberships = await sql<Array<{
    membership_id: string;
    organisation_id: string;
    role: string;
  }>>`
    select
      organisation_memberships.id::text as membership_id,
      organisation_memberships.organisation_id::text,
      organisation_memberships.role
    from public.organisation_memberships
    join public.organisations on organisations.id = organisation_memberships.organisation_id
    join public.people on people.id = organisation_memberships.person_id
    where organisation_memberships.person_id = ${credential.person_id}::uuid
      and organisation_memberships.status = 'active'
      and organisations.status = 'active'
      and people.status = 'active'
    order by
      case organisation_memberships.role
        when 'platform_owner' then 0
        when 'platform_admin' then 1
        else 2
      end,
      organisation_memberships.created_at asc
    limit 1
  `;
  const membershipRow = memberships[0];

  if (!membershipRow) {
    throw new Error("This admin user has no active organisation membership");
  }

  await recordAdminAudit({
    action: "admin.login",
    actorPersonId: credential.person_id,
    organisationId: membershipRow.organisation_id,
    resourceId: credential.person_id,
    resourceType: "person"
  });

  return createAdminSession({
    organisationId: membershipRow.organisation_id,
    personId: credential.person_id
  });
}

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
    displayName: "Legacy admin",
    email: "legacy-admin@mattanutra.local",
    id: "00000000-0000-4000-8000-000000000001",
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

export type AdminClientSessionContext = Omit<
  AdminSessionContext,
  "csrfToken" | "sessionCookie"
>;

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

export async function getAdminAccessData(): Promise<AdminAccessData> {
  const sql = await sqlOrThrow();
  const [organisations, people, memberships, invitations, auditEvents, agents] =
    await Promise.all([
      sql<Array<{
        default_locale: string;
        id: string;
        name: string;
        organisation_type: string;
        slug: string;
        status: string;
      }>>`
        select id::text, slug, name, organisation_type, status, default_locale
        from public.organisations
        order by organisation_type asc, lower(name) asc
      `,
      sql<Array<{
        display_name: string;
        email: string;
        id: string;
        preferred_locale: string;
        status: string;
      }>>`
        select id::text, email, display_name, preferred_locale, status
        from public.people
        order by lower(display_name), lower(email)
      `,
      sql<Array<{
        id: string;
        organisation_id: string;
        person_id: string;
        role: string;
        status: string;
        title: string | null;
      }>>`
        select id::text, organisation_id::text, person_id::text, role, status, title
        from public.organisation_memberships
        order by created_at desc
      `,
      sql<Array<{
        email: string;
        expires_at: Date | string;
        id: string;
        organisation_id: string;
        preferred_locale: string;
        role: string;
        status: string;
      }>>`
        select
          id::text,
          organisation_id::text,
          email,
          role,
          preferred_locale,
          status,
          expires_at
        from public.admin_invitations
        order by created_at desc
        limit 100
      `,
      sql<Array<{
        action: string;
        actor_person_id: string | null;
        assumed_person_id: string | null;
        created_at: Date | string;
        id: string;
        organisation_id: string | null;
        resource_id: string | null;
        resource_type: string | null;
      }>>`
        select
          id::text,
          organisation_id::text,
          actor_person_id::text,
          assumed_person_id::text,
          action,
          resource_type,
          resource_id,
          created_at
        from public.admin_audit_events
        order by created_at desc
        limit 100
      `,
      sql<Array<{
        capabilities: string[] | null;
        id: string;
        name: string;
        organisation_id: string | null;
        person_id: string | null;
        status: string;
        type: string;
      }>>`
        select
          id::text,
          name,
          agent_type as type,
          status,
          capabilities,
          organisation_id::text,
          person_id::text
        from public.agents
        order by lower(name) asc
      `
    ]);

  return {
    agents: agents.map((agent) => ({
      capabilities: agent.capabilities ?? [],
      id: agent.id,
      name: agent.name,
      organisationId: agent.organisation_id,
      personId: agent.person_id,
      status: agent.status,
      type: agent.type
    })),
    auditEvents: auditEvents.map((event) => ({
      action: event.action,
      actorPersonId: event.actor_person_id,
      assumedPersonId: event.assumed_person_id,
      createdAt: new Date(event.created_at).toISOString(),
      id: event.id,
      organisationId: event.organisation_id,
      resourceId: event.resource_id,
      resourceType: event.resource_type
    })),
    invitations: invitations.map((invite) => ({
      email: invite.email,
      expiresAt: new Date(invite.expires_at).toISOString(),
      id: invite.id,
      organisationId: invite.organisation_id,
      preferredLocale: localeValue(invite.preferred_locale),
      role: roleValue(invite.role),
      status:
        invite.status === "accepted" ||
        invite.status === "expired" ||
        invite.status === "pending" ||
        invite.status === "revoked"
          ? invite.status
          : "expired"
    })),
    memberships: memberships.map(membership),
    organisations: organisations.map(organisation),
    people: people.map(person),
    roleLabels: adminRoleLabels,
    roles: Object.keys(adminRoleLabels) as AdminRole[]
  };
}

export async function createOrganisation({
  defaultLocale,
  name,
  slug,
  type
}: Readonly<{
  defaultLocale: Locale;
  name: string;
  slug: string;
  type: AdminOrganisationType;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
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
      default_locale
    )
    values (
      ${slug.trim().toLowerCase()},
      ${name.trim()},
      ${type},
      'active',
      ${defaultLocale}
    )
    returning id::text, slug, name, organisation_type, status, default_locale
  `;

  return rows[0] ? organisation(rows[0]) : null;
}

export async function updateOrganisation({
  defaultLocale,
  id,
  name,
  slug,
  status,
  type
}: Readonly<{
  defaultLocale: Locale;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "disabled";
  type: AdminOrganisationType;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    update public.organisations
    set
      slug = ${slug.trim().toLowerCase()},
      name = ${name.trim()},
      organisation_type = ${type},
      status = ${status},
      default_locale = ${defaultLocale},
      updated_at = now()
    where id = ${id}::uuid
    returning id::text, slug, name, organisation_type, status, default_locale
  `;

  return rows[0] ? organisation(rows[0]) : null;
}

export async function updatePerson({
  displayName,
  id,
  preferredLocale,
  status
}: Readonly<{
  displayName: string;
  id: string;
  preferredLocale: Locale;
  status: AdminAccessStatus;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    display_name: string;
    email: string;
    id: string;
    preferred_locale: string;
    status: string;
  }>>`
    update public.people
    set
      display_name = ${displayName.trim()},
      preferred_locale = ${preferredLocale},
      status = ${status},
      updated_at = now()
    where id = ${id}::uuid
    returning id::text, email, display_name, preferred_locale, status
  `;

  return rows[0] ? person(rows[0]) : null;
}

export async function createAdminInvitation({
  actor,
  email,
  organisationId,
  preferredLocale,
  role
}: Readonly<{
  actor: AdminSessionContext;
  email: string;
  organisationId: string;
  preferredLocale: Locale;
  role: AdminRole;
}>) {
  const sql = await sqlOrThrow();
  const token = randomAdminToken();
  const normalizedEmail = normalizeEmail(email);
  const rows = await sql<Array<{
    email: string;
    expires_at: Date | string;
    id: string;
    organisation_id: string;
    preferred_locale: string;
    role: string;
    status: string;
  }>>`
    insert into public.admin_invitations (
      organisation_id,
      email,
      role,
      invited_by_person_id,
      token_hash,
      preferred_locale,
      status,
      expires_at
    )
    values (
      ${organisationId}::uuid,
      ${normalizedEmail},
      ${role},
      ${actor.actorPerson.id === "00000000-0000-4000-8000-000000000001" ? null : actor.actorPerson.id}::uuid,
      ${hashAdminToken(token)},
      ${preferredLocale},
      'pending',
      now() + (${inviteDays}::text || ' days')::interval
    )
    returning
      id::text,
      organisation_id::text,
      email,
      role,
      preferred_locale,
      status,
      expires_at
  `;
  const invite = rows[0];

  if (!invite) {
    throw new Error("Unable to create invite");
  }

  const inviteUrl = `${siteBaseUrl()}/${preferredLocale}/admin/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;
  const delivery = await sendTransactionalEmail({
    html: `<p>You have been invited to MattaNutra Admin.</p><p><a href="${inviteUrl}">Accept your invite and create a passkey</a></p>`,
    subject: "Your MattaNutra Admin invite",
    to: normalizedEmail
  });

  await recordAdminAudit({
    action: "admin.invite_created",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId,
    resourceId: invite.id,
    resourceType: "admin_invitation",
    metadata: { email: normalizedEmail, sent: delivery.sent, reason: delivery.reason }
  });

  return {
    invite: {
      email: invite.email,
      expiresAt: new Date(invite.expires_at).toISOString(),
      id: invite.id,
      organisationId: invite.organisation_id,
      preferredLocale: localeValue(invite.preferred_locale),
      role: roleValue(invite.role),
      status: "pending" as const
    },
    inviteUrl,
    sent: delivery.sent
  };
}

export async function updateMembershipRole({
  membershipId,
  role,
  status
}: Readonly<{
  membershipId: string;
  role: AdminRole;
  status: AdminAccessStatus;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    id: string;
    organisation_id: string;
    person_id: string;
    role: string;
    status: string;
    title: string | null;
  }>>`
    update public.organisation_memberships
    set role = ${role}, status = ${status}, updated_at = now()
    where id = ${membershipId}::uuid
    returning id::text, organisation_id::text, person_id::text, role, status, title
  `;

  return rows[0] ? membership(rows[0]) : null;
}

export async function assumeAdminIdentity({
  actor,
  membershipId
}: Readonly<{
  actor: AdminSessionContext;
  membershipId: string;
}>) {
  if (!actor.permissions.includes("impersonation.write")) {
    throw new Error("Impersonation is not allowed");
  }

  if (!actor.sessionId) {
    throw new Error("Impersonation requires a passkey session");
  }

  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    organisation_id: string;
    person_id: string;
  }>>`
    select person_id::text, organisation_id::text
    from public.organisation_memberships
    where id = ${membershipId}::uuid
      and status = 'active'
    limit 1
  `;
  const target = rows[0];

  if (!target) {
    throw new Error("That identity is not active");
  }

  await sql`
    update public.admin_sessions
    set
      assumed_person_id = ${target.person_id}::uuid,
      assumed_organisation_id = ${target.organisation_id}::uuid,
      last_seen_at = now()
    where id = ${actor.sessionId}::uuid
  `;

  await recordAdminAudit({
    action: "admin.impersonation_started",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: target.person_id,
    organisationId: target.organisation_id,
    resourceId: membershipId,
    resourceType: "organisation_membership"
  });
}

export async function stopAdminImpersonation(actor: AdminSessionContext) {
  if (!actor.sessionId) {
    return;
  }

  const sql = await sqlOrThrow();

  await sql`
    update public.admin_sessions
    set
      assumed_person_id = null,
      assumed_organisation_id = null,
      last_seen_at = now()
    where id = ${actor.sessionId}::uuid
  `;

  await recordAdminAudit({
    action: "admin.impersonation_stopped",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: actor.effectiveOrganisation.id,
    resourceType: "admin_session",
    resourceId: actor.sessionId
  });
}

export async function recordAdminAudit({
  action,
  actorPersonId,
  assumedPersonId = null,
  metadata = {},
  organisationId,
  resourceId = null,
  resourceType = null
}: Readonly<{
  action: string;
  actorPersonId?: string | null;
  assumedPersonId?: string | null;
  metadata?: Record<string, unknown>;
  organisationId?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
}>) {
  const sql = getSql();

  if (!sql) {
    return;
  }

  await sql`
    insert into public.admin_audit_events (
      organisation_id,
      actor_person_id,
      assumed_person_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      ${organisationId ?? null}::uuid,
      ${actorPersonId ?? null}::uuid,
      ${assumedPersonId ?? null}::uuid,
      ${action},
      ${resourceType},
      ${resourceId},
      ${sql.json(toJsonValue(metadata))}::jsonb
    )
  `.catch(() => undefined);
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

export { adminCsrfCookieName, adminSessionCookieName };
