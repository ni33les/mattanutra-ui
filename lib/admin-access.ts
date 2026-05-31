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
  adminRoleAllowedForOrganisationType,
  adminRoleLabels,
  adminRoles,
  isAgentRole,
  normalizeAdminRole,
  normalizeAgentRole,
  permissionsForRole,
  type AgentRole,
  type AdminOrganisationType,
  type AdminRole
} from "@/lib/admin-rbac";
import { configuredGrokModel, configuredGrokValue } from "@/lib/grok-client";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";
import { normalizeCapabilities } from "@/lib/task-service-utils";
import type {
  AdminAccessData,
  AdminAccessStatus,
  AdminClientSessionContext,
  AgentCredentialCreated,
  AgentCredentialSummary,
  AdminMembership,
  AdminOrganisation,
  AdminPerson,
  AdminSettingsData,
  AdminSessionContext
} from "@/lib/admin-access-types";

export type {
  AdminAccessAgent,
  AdminAccessData,
  AdminAccessStatus,
  AdminAgentMembership,
  AdminAuditEvent,
  AdminClientSessionContext,
  AdminInvitation,
  AdminInviteExistingAccess,
  AdminInviteMembershipAdded,
  AdminMembership,
  AdminOrganisation,
  AdminPerson,
  AdminSettingsData,
  AdminSettingsPerson,
  AdminSessionContext,
  AgentCredentialCreated,
  AgentCredentialSummary
} from "@/lib/admin-access-types";

type Db = NonNullable<ReturnType<typeof getSql>>;

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

function metadataText(
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

function configuredAgentGrokModel(model: string | null, metadata: Record<string, unknown>) {
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

function configuredAgentReasoningLevel(
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

function configuredAgentPrompt(metadata: Record<string, unknown>) {
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

function roleValue(
  value: unknown,
  organisationType: AdminOrganisationType = "platform"
): AdminRole {
  return typeof value === "string"
    ? normalizeAdminRole(value, organisationType)
    : normalizeAdminRole(null, organisationType);
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
  currency?: string | null;
  default_locale: string;
  id: string;
  name: string;
  organisation_type: string;
  slug: string;
  status: string;
}): AdminOrganisation {
  const organisationType = row.organisation_type === "platform" ? "platform" : "tenant";
  const currency = row.currency?.trim().toUpperCase() ?? "";

  return {
    currency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : organisationType === "platform"
        ? "USD"
        : "THB",
    defaultLocale: localeValue(row.default_locale),
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

function membership(row: {
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

function agentCredentialSummary(row: Record<string, unknown>): AgentCredentialSummary {
  const status =
    row.status === "revoked"
      ? "revoked"
      : row.expiresAt && new Date(String(row.expiresAt)).getTime() <= Date.now()
        ? "expired"
        : "active";

  return {
    createdAt: new Date(String(row.createdAt)).toISOString(),
    displayPrefix: String(row.displayPrefix ?? ""),
    expiresAt: row.expiresAt ? new Date(String(row.expiresAt)).toISOString() : null,
    id: String(row.id ?? ""),
    label: typeof row.label === "string" ? row.label : null,
    lastUsedAt: row.lastUsedAt ? new Date(String(row.lastUsedAt)).toISOString() : null,
    membershipId: typeof row.membershipId === "string" ? row.membershipId : null,
    revokedAt: row.revokedAt ? new Date(String(row.revokedAt)).toISOString() : null,
    status
  };
}

async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is required for admin access");
  }

  return sql;
}

async function personHasPlatformOwnerMembership(sql: Db, personId: string) {
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

async function expirePendingAdminInvitations(
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

function hasPlatformAccessScope(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
}

function scopedAccessOrganisationId(context?: AdminSessionContext | null) {
  if (!context || hasPlatformAccessScope(context)) {
    return null;
  }

  return context.effectiveOrganisation.id;
}

function canAccessOrganisation(
  context: AdminSessionContext,
  organisationId: string
) {
  return hasPlatformAccessScope(context) || context.effectiveOrganisation.id === organisationId;
}

async function personBelongsToOrganisation(
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

async function platformOrganisation(sql: Db) {
  const rows = await sql<Array<{
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
      currency
    )
    values (
      ${defaultPlatformOrgSlug},
      'MattaNutra',
      'platform',
      'active',
      'en',
      'USD'
    )
    on conflict do nothing
    returning id::text, slug, name, organisation_type, status, default_locale, currency
  `;

  if (rows[0]) {
    return organisation(rows[0]);
  }

  const existing = await sql<Array<{
    currency: string | null;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    select id::text, slug, name, organisation_type, status, default_locale, currency
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
        and organisation_memberships.principal_type = 'person'
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
    await expirePendingAdminInvitations(sql);

    const inviteRows = await sql<Array<{
      email: string;
      id: string;
      organisation_id: string;
      organisation_type: string;
      preferred_locale: string;
      role: string;
    }>>`
      select
        admin_invitations.id::text,
        admin_invitations.organisation_id::text,
        organisations.organisation_type,
        admin_invitations.email,
        admin_invitations.role,
        admin_invitations.preferred_locale
      from public.admin_invitations
      join public.organisations
        on organisations.id = admin_invitations.organisation_id
      where token_hash = ${hashAdminToken(inviteToken)}
        and admin_invitations.status = 'pending'
        and admin_invitations.expires_at > now()
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
      role: roleValue(
        invite.role,
        invite.organisation_type === "tenant" ? "tenant" : "platform"
      )
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
      status = case
        when public.people.status = 'disabled' then public.people.status
        else 'active'
      end,
      updated_at = now()
    where lower(email) = ${email}
    returning id::text, email, display_name, preferred_locale, status
  `;
  const savedPerson = people[0];

  if (!savedPerson) {
    throw new Error("Unable to save admin person");
  }

  if (person(savedPerson).status !== "active") {
    throw new Error("This admin person already exists but is not active. Ask an owner to update it.");
  }

  const memberships = await sql<Array<{
    id: string;
    organisation_id: string;
    person_id: string;
    role: string;
    status: string;
    title: string | null;
  }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      person_id,
      role,
      status
    )
    values (
      ${organisationId}::uuid,
      'person',
      ${savedPerson.id}::uuid,
      ${role},
      'active'
    )
    on conflict (person_id, organisation_id)
      where principal_type = 'person' and status <> 'deleted'
    do update set
      updated_at = now()
    returning id::text, organisation_id::text, person_id::text, role, status, title
  `;
  const savedMembership = memberships[0] ? membership(memberships[0]) : null;

  if (!savedMembership) {
    throw new Error("Unable to save admin membership");
  }

  if (savedMembership.status !== "active") {
    throw new Error("This admin membership already exists but is not active. Ask an owner to update it.");
  }

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

  const sql = await sqlOrThrow();

  if (challenge.metadata.invitationId) {
    await expirePendingAdminInvitations(sql);

    const activeInvitations = await sql<Array<{ id: string }>>`
      select id::text
      from public.admin_invitations
      where id = ${String(challenge.metadata.invitationId)}::uuid
        and status = 'pending'
        and expires_at > now()
      limit 1
    `;

    if (!activeInvitations[0]) {
      throw new Error("Registration invite expired or was deleted");
    }
  }

  const savedPerson = await upsertPersonAndMembership({
    displayName,
    email,
    locale,
    organisationId,
    role
  });

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
    const acceptedInvitations = await sql<Array<{ id: string }>>`
      update public.admin_invitations
      set status = 'accepted', accepted_at = now(), updated_at = now()
      where id = ${String(challenge.metadata.invitationId)}::uuid
        and status = 'pending'
        and expires_at > now()
      returning id::text
    `;

    if (!acceptedInvitations[0]) {
      throw new Error("Registration invite expired or was deleted");
    }
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
      and organisation_memberships.principal_type = 'person'
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

export async function getAdminAccessData(
  context?: AdminSessionContext | null
): Promise<AdminAccessData> {
  const sql = await sqlOrThrow();
  const scopeOrganisationId = scopedAccessOrganisationId(context);

  await expirePendingAdminInvitations(sql, scopeOrganisationId);

  const organisationScope = scopeOrganisationId
    ? sql`where organisations.id = ${scopeOrganisationId}::uuid`
    : sql``;
  const peopleScope = scopeOrganisationId
    ? sql`
        where exists (
          select 1
          from public.organisation_memberships scoped_memberships
          where scoped_memberships.person_id = people.id
            and scoped_memberships.principal_type = 'person'
            and scoped_memberships.organisation_id = ${scopeOrganisationId}::uuid
            and scoped_memberships.status <> 'deleted'
            and not (scoped_memberships.metadata ? 'deletedAt')
        )
      `
    : sql``;
  const membershipScope = scopeOrganisationId
    ? sql`
        where organisation_memberships.organisation_id = ${scopeOrganisationId}::uuid
          and organisation_memberships.principal_type = 'person'
          and organisation_memberships.status <> 'deleted'
          and not (organisation_memberships.metadata ? 'deletedAt')
      `
    : sql`
        where organisation_memberships.status <> 'deleted'
          and organisation_memberships.principal_type = 'person'
          and not (organisation_memberships.metadata ? 'deletedAt')
      `;
  const invitationScope = scopeOrganisationId
    ? sql`where admin_invitations.organisation_id = ${scopeOrganisationId}::uuid`
    : sql``;
  const auditScope = scopeOrganisationId
    ? sql`where organisation_id = ${scopeOrganisationId}::uuid`
    : sql``;
  const agentScope = scopeOrganisationId
    ? sql`
        where organisation_memberships.organisation_id = ${scopeOrganisationId}::uuid
          and organisation_memberships.principal_type = 'agent'
          and organisation_memberships.status <> 'deleted'
      `
    : sql`
        where organisation_memberships.principal_type = 'agent'
          and organisation_memberships.status <> 'deleted'
      `;
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
        ${organisationScope}
        order by organisation_type asc, lower(name) asc
      `,
      sql<Array<{
        display_name: string;
        email: string;
        id: string;
        preferred_locale: string;
        status: string;
      }>>`
        select people.id::text, people.email, people.display_name, people.preferred_locale, people.status
        from public.people
        ${peopleScope}
        order by lower(display_name), lower(email)
      `,
      sql<Array<{
        id: string;
        organisation_id: string;
        organisation_type: string;
        person_id: string;
        role: string;
        status: string;
        title: string | null;
      }>>`
        select
          organisation_memberships.id::text,
          organisation_memberships.organisation_id::text,
          organisations.organisation_type,
          organisation_memberships.person_id::text,
          organisation_memberships.role,
          organisation_memberships.status,
          organisation_memberships.title
        from public.organisation_memberships
        join public.organisations
          on organisations.id = organisation_memberships.organisation_id
        ${membershipScope}
        order by organisation_memberships.created_at desc
      `,
      sql<Array<{
        email: string;
        expires_at: Date | string;
        id: string;
        organisation_id: string;
        organisation_type: string;
        preferred_locale: string;
        role: string;
        status: string;
      }>>`
        select
          admin_invitations.id::text,
          admin_invitations.organisation_id::text,
          organisations.organisation_type,
          admin_invitations.email,
          admin_invitations.role,
          admin_invitations.preferred_locale,
          admin_invitations.status,
          admin_invitations.expires_at
        from public.admin_invitations
        join public.organisations
          on organisations.id = admin_invitations.organisation_id
        ${invitationScope}
        order by admin_invitations.created_at desc
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
        ${auditScope}
        order by created_at desc
        limit 100
      `,
      sql<Array<{
        capabilities: string[] | null;
        credential_count: number;
        credentials: unknown;
        id: string;
        metadata: unknown;
        membership_id: string;
        membership_status: string;
        membership_title: string | null;
        model: string | null;
        name: string;
        organisation_id: string;
        person_id: string | null;
        role: string;
        status: string;
        type: string;
      }>>`
        select
          agents.id::text,
          organisation_memberships.id::text as membership_id,
          agents.name,
          agents.agent_type as type,
          organisation_memberships.role,
          agents.status,
          agents.capabilities,
          agents.model,
          agents.metadata,
          organisation_memberships.organisation_id::text,
          organisation_memberships.status as membership_status,
          organisation_memberships.title as membership_title,
          agents.person_id::text,
          count(agent_credentials.id)::int as credential_count,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'createdAt', agent_credentials.created_at,
                'displayPrefix', agent_credentials.display_prefix,
                'expiresAt', agent_credentials.expires_at,
                'id', agent_credentials.id::text,
                'label', agent_credentials.label,
                'lastUsedAt', agent_credentials.last_used_at,
                'membershipId', agent_credentials.membership_id::text,
                'revokedAt', agent_credentials.revoked_at,
                'status', agent_credentials.status
              )
              order by agent_credentials.created_at desc
            ) filter (where agent_credentials.id is not null),
            '[]'::jsonb
          ) as credentials
        from public.agents
        join public.organisation_memberships
          on organisation_memberships.agent_id = agents.id
        left join public.agent_credentials
          on agent_credentials.agent_id = agents.id
          and agent_credentials.membership_id = organisation_memberships.id
        ${agentScope}
        group by agents.id, organisation_memberships.id
        order by lower(agents.name) asc, organisation_memberships.created_at asc
      `
    ]);

  return {
    agents: agents.map((agent) => {
      const metadata = metadataRecord(agent.metadata);

      return {
        capabilities: agent.capabilities ?? [],
        credentialCount: agent.credential_count,
        credentials: Array.isArray(agent.credentials)
          ? agent.credentials.map((credential) =>
              agentCredentialSummary(credential as Record<string, unknown>)
            )
          : [],
        grokModel: configuredAgentGrokModel(agent.model, metadata),
        id: agent.id,
        membershipId: agent.membership_id,
        membershipStatus:
          agent.membership_status === "active" ||
          agent.membership_status === "deleted" ||
          agent.membership_status === "disabled" ||
          agent.membership_status === "invited"
            ? agent.membership_status
            : "disabled",
        membershipTitle: agent.membership_title,
        model: agent.model,
        name: agent.name,
        organisationId: agent.organisation_id,
        personId: agent.person_id,
        prompt: configuredAgentPrompt(metadata),
        reasoningLevel: configuredAgentReasoningLevel(agent.model, metadata),
        role: normalizeAgentRole(
          isAgentRole(agent.role) ? agent.role : null,
          agent.role === "retail_agent" ? "tenant" : "platform"
        ),
        status: agent.status,
        type: agent.type
      };
    }),
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
      role: roleValue(
        invite.role,
        invite.organisation_type === "tenant" ? "tenant" : "platform"
      ),
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
    roles: [...adminRoles]
  };
}

export async function getAdminSettingsData(
  context: AdminSessionContext
): Promise<AdminSettingsData> {
  const sql = await sqlOrThrow();
  const [organisationRows, peopleRows] = await Promise.all([
    sql<Array<{
      currency: string | null;
      default_locale: string;
      id: string;
      name: string;
      organisation_type: string;
      slug: string;
      status: string;
    }>>`
      select id::text, slug, name, organisation_type, status, default_locale, currency
      from public.organisations
      where id = ${context.effectiveOrganisation.id}::uuid
      limit 1
    `,
    sql<Array<{
      display_name: string;
      email: string;
      id: string;
      membership_status: string;
      preferred_locale: string;
      role: string;
      status: string;
      title: string | null;
    }>>`
      select
        people.id::text,
        people.email,
        people.display_name,
        people.preferred_locale,
        people.status,
        organisation_memberships.role,
        organisation_memberships.status as membership_status,
        organisation_memberships.title
      from public.organisation_memberships
      join public.people on people.id = organisation_memberships.person_id
      where organisation_memberships.organisation_id = ${context.effectiveOrganisation.id}::uuid
        and organisation_memberships.principal_type = 'person'
        and organisation_memberships.status <> 'deleted'
        and not (organisation_memberships.metadata ? 'deletedAt')
      order by lower(people.display_name), lower(people.email)
    `
  ]);
  const currentOrganisation = organisationRows[0]
    ? organisation(organisationRows[0])
    : context.effectiveOrganisation;

  return {
    canEditOrganisation:
      !context.isLegacy &&
      (
        context.effectiveMembership.role === "platform_owner" ||
        context.effectiveMembership.role === "platform_admin" ||
        (
          currentOrganisation.type === "tenant" &&
          context.effectiveMembership.role === "retail_admin"
        )
      ),
    organisation: currentOrganisation,
    people: peopleRows.map((row) => ({
      displayName: row.display_name,
      email: row.email,
      id: row.id,
      membershipStatus:
        row.membership_status === "active" ||
        row.membership_status === "deleted" ||
        row.membership_status === "disabled" ||
        row.membership_status === "invited"
          ? row.membership_status
          : "disabled",
      preferredLocale: localeValue(row.preferred_locale),
      role: roleValue(row.role, currentOrganisation.type),
      status:
        row.status === "active" || row.status === "disabled" || row.status === "invited"
          ? row.status
          : "disabled",
      title: row.title
    }))
  };
}

export async function createOrganisation({
  actor,
  defaultLocale,
  name,
  slug,
  type
}: Readonly<{
  actor?: AdminSessionContext | null;
  defaultLocale: Locale;
  name: string;
  slug: string;
  type: AdminOrganisationType;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
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
      currency
    )
    values (
      ${slug.trim().toLowerCase()},
      ${name.trim()},
      ${type},
      'active',
      ${defaultLocale},
      ${type === "platform" ? "USD" : "THB"}
    )
    returning id::text, slug, name, organisation_type, status, default_locale, currency
  `;

  const savedOrganisation = rows[0] ? organisation(rows[0]) : null;

  if (savedOrganisation && actor) {
    await recordAdminAudit({
      action: "admin.organisation_created",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId: savedOrganisation.id,
      resourceId: savedOrganisation.id,
      resourceType: "organisation",
      metadata: {
        currency: savedOrganisation.currency,
        defaultLocale,
        name: savedOrganisation.name,
        slug: savedOrganisation.slug,
        type: savedOrganisation.type
      }
    });
  }

  return savedOrganisation;
}

export async function updateOrganisation({
  actor,
  defaultLocale,
  id,
  name,
  slug,
  status
}: Readonly<{
  actor?: AdminSessionContext | null;
  defaultLocale: Locale;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "disabled";
}>) {
  const sql = await sqlOrThrow();
  const beforeRows = actor
    ? await sql<Array<{
        currency: string | null;
        default_locale: string;
        id: string;
        name: string;
        organisation_type: string;
        slug: string;
        status: string;
      }>>`
        select id::text, slug, name, organisation_type, status, default_locale, currency
        from public.organisations
        where id = ${id}::uuid
        limit 1
      `
    : [];
  const rows = await sql<Array<{
    currency: string | null;
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
      status = ${status},
      default_locale = ${defaultLocale},
      updated_at = now()
    where id = ${id}::uuid
    returning id::text, slug, name, organisation_type, status, default_locale, currency
  `;

  const savedOrganisation = rows[0] ? organisation(rows[0]) : null;

  if (savedOrganisation && actor) {
    const before = beforeRows[0] ? organisation(beforeRows[0]) : null;

    await recordAdminAudit({
      action: "admin.organisation_updated",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId: savedOrganisation.id,
      resourceId: savedOrganisation.id,
      resourceType: "organisation",
      metadata: {
        after: savedOrganisation,
        before
      }
    });
  }

  return savedOrganisation;
}

function agentStatus(value: string): "active" | "offline" | "paused" | "retired" {
  return value === "offline" || value === "paused" || value === "retired"
    ? value
    : "active";
}

function agentType(value: string): "ai" | "deterministic" | "external" | "human" | "system" {
  return value === "ai" ||
    value === "deterministic" ||
    value === "external" ||
    value === "human"
    ? value
    : "system";
}

function membershipStatusValue(value: string): AdminAccessStatus {
  return value === "active" ||
    value === "deleted" ||
    value === "disabled" ||
    value === "invited"
    ? value
    : "invited";
}

async function organisationTypeForAgent(sql: Db, organisationId: string) {
  const rows = await sql<Array<{
    organisation_type: string;
  }>>`
    select organisation_type
    from public.organisations
    where id = ${organisationId}::uuid
      and status <> 'archived'
    limit 1
  `;

  return rows[0]?.organisation_type === "tenant" ? "tenant" : "platform";
}

function roleForAgentOrganisation(role: AgentRole, organisationType: AdminOrganisationType) {
  return organisationType === "platform" ? "platform_agent" : role === "retail_agent" ? "retail_agent" : "retail_agent";
}

export async function inviteAgent({
  actor,
  agentStatus: requestedAgentStatus = "active",
  capabilities,
  membershipStatus: requestedMembershipStatus = "invited",
  model,
  name,
  organisationId,
  personId,
  role,
  status,
  type
}: Readonly<{
  actor: AdminSessionContext;
  agentStatus?: string;
  capabilities: unknown;
  membershipStatus?: AdminAccessStatus | string;
  model?: string | null;
  name: string;
  organisationId: string;
  personId?: string | null;
  role: AgentRole;
  status: string;
  type: string;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can create agents");
  }

  const organisationType = await organisationTypeForAgent(sql, organisationId);
  const normalizedRole = roleForAgentOrganisation(role, organisationType);
  const ownerPersonId = personId || null;
  const normalizedMembershipStatus = membershipStatusValue(
    String(requestedMembershipStatus)
  );

  if (ownerPersonId && !(await personBelongsToOrganisation(sql, ownerPersonId, organisationId))) {
    throw new Error("Agent owner must belong to the selected organisation");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.agents (
      name,
      agent_type,
      role,
      status,
      capabilities,
      model,
      organisation_id,
      person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${name.trim()},
      ${agentType(type)},
      ${normalizedRole},
      ${agentStatus(requestedAgentStatus || status)},
      ${normalizeCapabilities(capabilities)},
      ${model?.trim() || null},
      ${organisationId}::uuid,
      ${ownerPersonId}::uuid,
      '{}'::jsonb,
      now(),
      now()
    )
    returning id::text
  `;
  const id = rows[0]?.id ?? null;

  if (!id) {
    throw new Error("Agent could not be invited");
  }

  const membershipRows = await sql<Array<{ id: string }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      agent_id,
      role,
      status,
      metadata
    )
    values (
      ${organisationId}::uuid,
      'agent',
      ${id}::uuid,
      ${normalizedRole},
      ${normalizedMembershipStatus},
      jsonb_build_object(
        'invitedAt', now(),
        'invitedByPersonId', ${actor.actorPerson.id},
        'source', 'admin'
      )
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do nothing
    returning id::text
  `;
  const membershipId = membershipRows[0]?.id ?? null;

  if (!membershipId) {
    throw new Error("Agent membership could not be invited");
  }

  await recordAdminAudit({
    action: "admin.agent_invited",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId,
    resourceId: membershipId,
    resourceType: "organisation_membership",
    metadata: {
      agentId: id,
      role: normalizedRole,
      status: normalizedMembershipStatus
    }
  });

  return id;
}

export const createAgent = inviteAgent;

export async function addAgentMembership({
  actor,
  agentId,
  organisationId,
  role,
  status
}: Readonly<{
  actor: AdminSessionContext;
  agentId: string;
  organisationId: string;
  role: AgentRole;
  status: AdminAccessStatus | string;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can add agent memberships");
  }

  const organisationType = await organisationTypeForAgent(sql, organisationId);
  const normalizedRole = roleForAgentOrganisation(role, organisationType);
  const normalizedStatus = membershipStatusValue(String(status));

  if (normalizedStatus === "deleted") {
    throw new Error("New agent memberships cannot start deleted");
  }

  const agentRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.agents
    where id = ${agentId}::uuid
    limit 1
  `;

  if (!agentRows[0]) {
    throw new Error("Agent not found");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      agent_id,
      role,
      status,
      metadata
    )
    values (
      ${organisationId}::uuid,
      'agent',
      ${agentId}::uuid,
      ${normalizedRole},
      ${normalizedStatus},
      jsonb_build_object(
        'addedAt', now(),
        'addedByPersonId', ${actor.actorPerson.id}::uuid,
        'source', 'admin'
      )
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do nothing
    returning id::text
  `;
  const membershipId = rows[0]?.id ?? null;

  if (!membershipId) {
    throw new Error("This agent is already associated with that organisation");
  }

  await recordAdminAudit({
    action: "admin.agent_membership_added",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId,
    resourceId: membershipId,
    resourceType: "organisation_membership",
    metadata: {
      agentId,
      role: normalizedRole,
      status: normalizedStatus
    }
  });

  return membershipId;
}

export async function deleteAgentMembership({
  actor,
  membershipId
}: Readonly<{
  actor: AdminSessionContext;
  membershipId: string;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can delete agent memberships");
  }

  const rows = await sql<Array<{
    agent_id: string;
    id: string;
    organisation_id: string;
    role: string;
    status: string;
  }>>`
    select
      id::text,
      organisation_id::text,
      agent_id::text,
      role,
      status
    from public.organisation_memberships
    where id = ${membershipId}::uuid
      and principal_type = 'agent'
      and status <> 'deleted'
    limit 1
  `;
  const target = rows[0];

  if (!target) {
    throw new Error("Agent membership not found");
  }

  await sql`
    update public.organisation_memberships
    set
      status = 'deleted',
      metadata = metadata || jsonb_build_object(
        'deletedAt', now(),
        'deletedByPersonId', ${actor.actorPerson.id},
        'deletedBySessionId', ${actor.sessionId},
        'deletedRole', role,
        'deletedStatus', status
      ),
      updated_at = now()
    where id = ${membershipId}::uuid
      and principal_type = 'agent'
      and status <> 'deleted'
  `;

  await recordAdminAudit({
    action: "admin.agent_membership_deleted",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: target.organisation_id,
    resourceId: target.id,
    resourceType: "organisation_membership",
    metadata: {
      agentId: target.agent_id,
      role: target.role,
      status: target.status
    }
  });
}

export async function updateAgent({
  actor,
  agentId,
  capabilities,
  membershipId,
  membershipStatus,
  model,
  name,
  organisationId,
  personId,
  role,
  status,
  type
}: Readonly<{
  actor: AdminSessionContext;
  agentId: string;
  capabilities: unknown;
  membershipId: string;
  membershipStatus: AdminAccessStatus | string;
  model?: string | null;
  name: string;
  organisationId: string;
  personId?: string | null;
  role: AgentRole;
  status: string;
  type: string;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can update agents");
  }

  const organisationType = await organisationTypeForAgent(sql, organisationId);
  const normalizedRole = roleForAgentOrganisation(role, organisationType);
  const normalizedMembershipStatus = membershipStatusValue(String(membershipStatus));
  const ownerPersonId = personId || null;

  if (ownerPersonId && !(await personBelongsToOrganisation(sql, ownerPersonId, organisationId))) {
    throw new Error("Agent owner must belong to the selected organisation");
  }

  const membershipRows = await sql<Array<{
    id: string;
    organisation_id: string;
    previous_role: string;
    previous_status: string;
  }>>`
    select
      organisation_memberships.id::text,
      organisation_memberships.organisation_id::text,
      organisation_memberships.role as previous_role,
      organisation_memberships.status as previous_status
    from public.organisation_memberships
    where organisation_memberships.id = ${membershipId}::uuid
      and organisation_memberships.agent_id = ${agentId}::uuid
      and organisation_memberships.principal_type = 'agent'
      and organisation_memberships.status <> 'deleted'
    limit 1
  `;
  const existingMembership = membershipRows[0];

  if (!existingMembership) {
    throw new Error("Agent membership not found");
  }

  if (normalizedMembershipStatus === "deleted") {
    await deleteAgentMembership({ actor, membershipId });
    return;
  }

  await sql`
    update public.agents
    set
      name = ${name.trim()},
      agent_type = ${agentType(type)},
      role = ${normalizedRole},
      status = ${agentStatus(status)},
      capabilities = ${normalizeCapabilities(capabilities)},
      model = ${model?.trim() || null},
      organisation_id = ${organisationId}::uuid,
      person_id = ${ownerPersonId}::uuid,
      updated_at = now()
    where id = ${agentId}::uuid
  `;

  await sql`
    update public.organisation_memberships
    set
      organisation_id = ${organisationId}::uuid,
      role = ${normalizedRole},
      status = ${normalizedMembershipStatus},
      metadata = metadata
        - 'deletedAt'
        - 'deletedByPersonId'
        - 'deletedBySessionId'
        - 'deletedRole'
        - 'deletedStatus',
      updated_at = now()
    where id = ${membershipId}::uuid
      and agent_id = ${agentId}::uuid
      and principal_type = 'agent'
      and status <> 'deleted'
  `;

  await recordAdminAudit({
    action: "admin.agent_membership_updated",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId,
    resourceId: membershipId,
    resourceType: "organisation_membership",
    metadata: {
      agentId,
      previousOrganisationId: existingMembership.organisation_id,
      previousRole: existingMembership.previous_role,
      previousStatus: existingMembership.previous_status,
      role: normalizedRole,
      status: normalizedMembershipStatus
    }
  });
}

export async function generateAgentCredential({
  actor,
  expiresAt,
  label,
  membershipId
}: Readonly<{
  actor: AdminSessionContext;
  expiresAt?: string | null;
  label?: string | null;
  membershipId: string;
}>): Promise<AgentCredentialCreated> {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can generate agent credentials");
  }

  const apiKey = `mnag_${randomAdminToken(32)}`;
  const membershipRows = await sql<Array<{
    agent_id: string;
    organisation_id: string;
  }>>`
    select
      organisation_memberships.agent_id::text,
      organisation_memberships.organisation_id::text
    from public.organisation_memberships
    join public.agents
      on agents.id = organisation_memberships.agent_id
    join public.organisations
      on organisations.id = organisation_memberships.organisation_id
    where organisation_memberships.id = ${membershipId}::uuid
      and organisation_memberships.principal_type = 'agent'
      and organisation_memberships.status = 'active'
      and agents.status = 'active'
      and organisations.status = 'active'
    limit 1
  `;
  const membershipRow = membershipRows[0];

  if (!membershipRow) {
    throw new Error("Agent membership must be active before a key can be generated");
  }

  const rows = await sql<Array<{
    created_at: Date | string;
    display_prefix: string;
    expires_at: Date | string | null;
    id: string;
    label: string | null;
    last_used_at: Date | string | null;
    membership_id: string;
    revoked_at: Date | string | null;
    status: string;
  }>>`
    insert into public.agent_credentials (
      agent_id,
      membership_id,
      credential_hash,
      display_prefix,
      label,
      expires_at,
      created_by_person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${membershipRow.agent_id}::uuid,
      ${membershipId}::uuid,
      ${hashAdminToken(apiKey)},
      ${apiKey.slice(0, 12)},
      ${label?.trim() || null},
      ${expiresAt || null}::timestamptz,
      ${actor.actorPerson.id}::uuid,
      '{}'::jsonb,
      now(),
      now()
    )
    returning
      id::text,
      membership_id::text,
      display_prefix,
      label,
      status,
      expires_at,
      last_used_at,
      revoked_at,
      created_at
  `;
  const credential = rows[0];

  if (!credential) {
    throw new Error("Agent credential could not be created");
  }

  await recordAdminAudit({
    action: "admin.agent_credential_generated",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: membershipRow.organisation_id,
    resourceId: membershipId,
    resourceType: "agent_credential",
    metadata: {
      agentId: membershipRow.agent_id,
      credentialId: credential.id,
      displayPrefix: credential.display_prefix
    }
  });

  return {
    ...agentCredentialSummary({
      createdAt: credential.created_at,
      displayPrefix: credential.display_prefix,
      expiresAt: credential.expires_at,
      id: credential.id,
      label: credential.label,
      lastUsedAt: credential.last_used_at,
      membershipId: credential.membership_id,
      revokedAt: credential.revoked_at,
      status: credential.status
    }),
    apiKey
  };
}

export async function revokeAgentCredential({
  actor,
  credentialId
}: Readonly<{
  actor: AdminSessionContext;
  credentialId: string;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can revoke agent credentials");
  }

  const rows = await sql<Array<{
    agent_id: string;
    membership_id: string | null;
    organisation_id: string | null;
  }>>`
    update public.agent_credentials
    set
      status = 'revoked',
      revoked_by_person_id = ${actor.actorPerson.id}::uuid,
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
    from public.agents
    where agent_credentials.id = ${credentialId}::uuid
      and agents.id = agent_credentials.agent_id
    returning
      agent_credentials.agent_id::text,
      agent_credentials.membership_id::text,
      coalesce(
        (
          select organisation_memberships.organisation_id
          from public.organisation_memberships
          where organisation_memberships.id = agent_credentials.membership_id
          limit 1
        ),
        agents.organisation_id
      )::text as organisation_id
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Agent credential was not found");
  }

  await recordAdminAudit({
    action: "admin.agent_credential_revoked",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: row?.organisation_id ?? actor.effectiveOrganisation.id,
    resourceId: row?.membership_id ?? credentialId,
    resourceType: "agent_credential",
    metadata: {
      agentId: row.agent_id,
      credentialId
    }
  });

  return {
    agentId: row.agent_id,
    membershipId: row.membership_id,
    organisationId: row.organisation_id
  };
}

export async function rotateAgentCredential({
  actor,
  credentialId,
  label
}: Readonly<{
  actor: AdminSessionContext;
  credentialId: string;
  label?: string | null;
}>) {
  const sql = await sqlOrThrow();

  if (!hasPlatformAccessScope(actor)) {
    throw new Error("Only platform admins can rotate agent credentials");
  }

  const rows = await sql<Array<{
    agent_id: string;
    expires_at: Date | string | null;
    label: string | null;
    membership_id: string;
  }>>`
    select
      agent_credentials.agent_id::text,
      agent_credentials.membership_id::text,
      agent_credentials.label,
      agent_credentials.expires_at
    from public.agent_credentials
    join public.agents
      on agents.id = agent_credentials.agent_id
    join public.organisation_memberships
      on organisation_memberships.id = agent_credentials.membership_id
      and organisation_memberships.agent_id = agent_credentials.agent_id
      and organisation_memberships.principal_type = 'agent'
    where agent_credentials.id = ${credentialId}::uuid
      and agent_credentials.status = 'active'
      and agent_credentials.revoked_at is null
      and organisation_memberships.status = 'active'
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Active agent credential was not found");
  }

  const credential = await generateAgentCredential({
    actor,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    label: label?.trim() || row.label || "rotated",
    membershipId: row.membership_id
  });

  await revokeAgentCredential({ actor, credentialId });

  return credential;
}

export async function updatePerson({
  actor,
  displayName,
  id,
  preferredLocale,
  status
}: Readonly<{
  actor: AdminSessionContext;
  displayName: string;
  id: string;
  preferredLocale: Locale;
  status: AdminAccessStatus;
}>) {
  const sql = await sqlOrThrow();

  if (
    !hasPlatformAccessScope(actor) &&
    !(await personBelongsToOrganisation(sql, id, actor.effectiveOrganisation.id))
  ) {
    throw new Error("Retail admins can only update people in their own organisation");
  }

  if (actor.actorMembership.role !== "platform_owner") {
    if (await personHasPlatformOwnerMembership(sql, id)) {
      throw new Error("Platform Admin cannot change Platform Owner users");
    }
  }

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

  const savedPerson = rows[0] ? person(rows[0]) : null;

  if (savedPerson) {
    await recordAdminAudit({
      action: "admin.person_updated",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId: actor.effectiveOrganisation.id,
      resourceId: savedPerson.id,
      resourceType: "person",
      metadata: {
        displayName: savedPerson.displayName,
        preferredLocale: savedPerson.preferredLocale,
        status: savedPerson.status
      }
    });
  }

  return savedPerson;
}

export async function updateOwnPerson({
  context,
  displayName,
  preferredLocale
}: Readonly<{
  context: AdminSessionContext;
  displayName: string;
  preferredLocale: Locale;
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
      updated_at = now()
    where id = ${context.actorPerson.id}::uuid
      and status = 'active'
    returning id::text, email, display_name, preferred_locale, status
  `;
  const savedPerson = rows[0] ? person(rows[0]) : null;

  if (!savedPerson) {
    return null;
  }

  await recordAdminAudit({
    action: "admin.profile_updated",
    actorPersonId: savedPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: context.actorOrganisation.id,
    resourceId: savedPerson.id,
    resourceType: "person"
  });

  return {
    ...context,
    actorPerson: savedPerson,
    effectivePerson: context.assumedPerson ? context.effectivePerson : savedPerson
  } satisfies AdminSessionContext;
}

export async function updateEffectiveOrganisationSettings({
  context,
  currency,
  defaultLocale,
  name
}: Readonly<{
  context: AdminSessionContext;
  currency?: string | null;
  defaultLocale: Locale;
  name: string;
}>) {
  if (
    !(
      context.effectiveMembership.role === "platform_owner" ||
      context.effectiveMembership.role === "platform_admin" ||
      (
        context.effectiveOrganisation.type === "tenant" &&
        context.effectiveMembership.role === "retail_admin"
      )
    )
  ) {
    throw new Error("You can only update basic settings for your own organisation");
  }

  const normalizedCurrency =
    currency?.trim().toUpperCase() || context.effectiveOrganisation.currency;

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Currency must be a three-letter ISO-4217 code");
  }

  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    currency: string | null;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    update public.organisations
    set
      name = ${name.trim()},
      default_locale = ${defaultLocale},
      currency = ${normalizedCurrency},
      updated_at = now()
    where id = ${context.effectiveOrganisation.id}::uuid
    returning id::text, slug, name, organisation_type, status, default_locale, currency
  `;
  const savedOrganisation = rows[0] ? organisation(rows[0]) : null;

  if (!savedOrganisation) {
    throw new Error("Organisation not found");
  }

  await recordAdminAudit({
    action: "admin.organisation_settings_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: savedOrganisation.id,
    resourceId: savedOrganisation.id,
    resourceType: "organisation"
  });

  return {
    ...context,
    actorOrganisation:
      context.actorOrganisation.id === savedOrganisation.id
        ? savedOrganisation
        : context.actorOrganisation,
    assumedOrganisation:
      context.assumedOrganisation?.id === savedOrganisation.id
        ? savedOrganisation
        : context.assumedOrganisation,
    effectiveOrganisation: savedOrganisation
  } satisfies AdminSessionContext;
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
  const existingRows = await sql<Array<{
    default_locale: string;
    display_name: string | null;
    email: string | null;
    membership_id: string | null;
    membership_metadata: unknown;
    membership_status: string | null;
    name: string;
    organisation_id: string;
    organisation_status: string;
    organisation_type: string;
    person_id: string | null;
    preferred_locale: string | null;
    role: string | null;
    slug: string;
    title: string | null;
    user_status: string | null;
  }>>`
    select
      organisations.id::text as organisation_id,
      organisations.slug,
      organisations.name,
      organisations.organisation_type,
      organisations.status as organisation_status,
      organisations.default_locale,
      people.id::text as person_id,
      people.email,
      people.display_name,
      people.preferred_locale,
      people.status as user_status,
      organisation_memberships.id::text as membership_id,
      organisation_memberships.metadata as membership_metadata,
      organisation_memberships.role,
      organisation_memberships.status as membership_status,
      organisation_memberships.title
    from public.organisations
    left join public.people on lower(people.email) = ${normalizedEmail}
    left join public.organisation_memberships
      on organisation_memberships.organisation_id = organisations.id
      and organisation_memberships.person_id = people.id
      and organisation_memberships.principal_type = 'person'
      and organisation_memberships.principal_type = 'person'
    where organisations.id = ${organisationId}::uuid
    limit 1
  `;
  const existing = existingRows[0];

  if (!existing) {
    throw new Error("Organisation not found");
  }

  if (!canAccessOrganisation(actor, existing.organisation_id)) {
    throw new Error("Retail admins can only invite people to their own organisation");
  }

  const existingOrganisation = organisation({
    default_locale: existing.default_locale,
    id: existing.organisation_id,
    name: existing.name,
    organisation_type: existing.organisation_type,
    slug: existing.slug,
    status: existing.organisation_status
  });

  if (!adminRoleAllowedForOrganisationType(role, existingOrganisation.type)) {
    throw new Error("Role is not allowed for this organisation");
  }

  if (role === "platform_owner" && actor.actorMembership.role !== "platform_owner") {
    throw new Error("Platform Admin cannot grant Platform Owner access");
  }

  if (existing.person_id && existing.email && existing.display_name) {
    const existingPerson = person({
      display_name: existing.display_name,
      email: existing.email,
      id: existing.person_id,
      preferred_locale: existing.preferred_locale ?? "en",
      status: existing.user_status ?? "disabled"
    });

    if (
      actor.actorMembership.role !== "platform_owner" &&
      await personHasPlatformOwnerMembership(sql, existingPerson.id)
    ) {
      throw new Error("Platform Admin cannot change Platform Owner users");
    }

    if (existing.membership_id && existing.role && existing.membership_status) {
      const existingMembershipMetadata = metadataRecord(existing.membership_metadata);

      if (existing.membership_status === "deleted" || existingMembershipMetadata.deletedAt) {
        const restoredRows = await sql<Array<{
          id: string;
          organisation_id: string;
          person_id: string;
          role: string;
          status: string;
          title: string | null;
        }>>`
          update public.organisation_memberships
          set
            role = ${role},
            status = 'active',
            metadata = metadata
              - 'deletedAt'
              - 'deletedByPersonId'
              - 'deletedBySessionId'
              - 'deletedRole'
              - 'deletedStatus',
            updated_at = now()
          where id = ${existing.membership_id}::uuid
          returning id::text, organisation_id::text, person_id::text, role, status, title
        `;
        const restoredMembership = restoredRows[0]
          ? membership(restoredRows[0])
          : null;

        if (!restoredMembership) {
          throw new Error("Unable to restore admin membership");
        }

        await recordAdminAudit({
          action: "admin.membership_restored",
          actorPersonId: actor.actorPerson.id,
          assumedPersonId: actor.assumedPerson?.id ?? null,
          organisationId,
          resourceId: restoredMembership.id,
          resourceType: "organisation_membership",
          metadata: { email: normalizedEmail, role }
        });

        return {
          membershipAdded: {
            membership: restoredMembership,
            organisation: existingOrganisation,
            person: existingPerson
          }
        };
      }

      const existingMembership = membership({
        id: existing.membership_id,
        organisation_id: existing.organisation_id,
        organisation_type: existing.organisation_type,
        person_id: existing.person_id,
        role: existing.role,
        status: existing.membership_status,
        title: existing.title
      });

      await recordAdminAudit({
        action: "admin.invite_existing_member_blocked",
        actorPersonId: actor.actorPerson.id,
        assumedPersonId: actor.assumedPerson?.id ?? null,
        organisationId,
        resourceId: existingMembership.id,
        resourceType: "organisation_membership",
        metadata: { email: normalizedEmail, requestedRole: role }
      });

      return {
        existingAccess: {
          membership: existingMembership,
          organisation: existingOrganisation,
          person: existingPerson,
          reason: "existing_membership" as const
        }
      };
    }

    if (existingPerson.status !== "active") {
      await recordAdminAudit({
        action: "admin.invite_inactive_person_blocked",
        actorPersonId: actor.actorPerson.id,
        assumedPersonId: actor.assumedPerson?.id ?? null,
        organisationId,
        resourceId: existingPerson.id,
        resourceType: "person",
        metadata: { email: normalizedEmail, requestedRole: role, status: existingPerson.status }
      });

      return {
        existingAccess: {
          membership: null,
          organisation: existingOrganisation,
          person: existingPerson,
          reason: "inactive_person" as const
        }
      };
    }

    const membershipRows = await sql<Array<{
      id: string;
      organisation_id: string;
      person_id: string;
      role: string;
      status: string;
      title: string | null;
    }>>`
      insert into public.organisation_memberships (
        organisation_id,
        principal_type,
        person_id,
        role,
        status
      )
      values (
        ${organisationId}::uuid,
        'person',
        ${existingPerson.id}::uuid,
        ${role},
        'active'
      )
      on conflict (person_id, organisation_id)
        where principal_type = 'person' and status <> 'deleted'
      do nothing
      returning id::text, organisation_id::text, person_id::text, role, status, title
    `;
    const addedMembership = membershipRows[0] ? membership(membershipRows[0]) : null;

    if (!addedMembership) {
      return {
        existingAccess: {
          membership: null,
          organisation: existingOrganisation,
          person: existingPerson,
          reason: "existing_membership" as const
        }
      };
    }

    await recordAdminAudit({
      action: "admin.membership_added",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId,
      resourceId: addedMembership.id,
      resourceType: "organisation_membership",
      metadata: { email: normalizedEmail, role }
    });

    return {
      membershipAdded: {
        membership: addedMembership,
        organisation: existingOrganisation,
        person: existingPerson
      }
    };
  }

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

export async function addAdminMembership({
  actor,
  organisationId,
  personId,
  role,
  status
}: Readonly<{
  actor: AdminSessionContext;
  organisationId: string;
  personId: string;
  role: AdminRole;
  status: AdminAccessStatus;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    default_locale: string;
    display_name: string;
    email: string;
    membership_id: string | null;
    membership_metadata: unknown;
    membership_status: string | null;
    name: string;
    organisation_id: string;
    organisation_status: string;
    organisation_type: string;
    preferred_locale: string;
    role: string | null;
    slug: string;
    title: string | null;
    user_status: string;
  }>>`
    select
      organisations.id::text as organisation_id,
      organisations.slug,
      organisations.name,
      organisations.organisation_type,
      organisations.status as organisation_status,
      organisations.default_locale,
      people.email,
      people.display_name,
      people.preferred_locale,
      people.status as user_status,
      organisation_memberships.id::text as membership_id,
      organisation_memberships.metadata as membership_metadata,
      organisation_memberships.role,
      organisation_memberships.status as membership_status,
      organisation_memberships.title
    from public.organisations
    join public.people on people.id = ${personId}::uuid
    left join public.organisation_memberships
      on organisation_memberships.organisation_id = organisations.id
      and organisation_memberships.person_id = people.id
    where organisations.id = ${organisationId}::uuid
    limit 1
  `;
  const existing = rows[0];

  if (!existing) {
    throw new Error("Person or organisation not found");
  }

  if (!canAccessOrganisation(actor, existing.organisation_id)) {
    throw new Error("Retail admins can only add memberships in their own organisation");
  }

  const existingOrganisation = organisation({
    default_locale: existing.default_locale,
    id: existing.organisation_id,
    name: existing.name,
    organisation_type: existing.organisation_type,
    slug: existing.slug,
    status: existing.organisation_status
  });

  if (!adminRoleAllowedForOrganisationType(role, existingOrganisation.type)) {
    throw new Error("Role is not allowed for this organisation");
  }

  if (role === "platform_owner" && actor.actorMembership.role !== "platform_owner") {
    throw new Error("Platform Admin cannot grant Platform Owner access");
  }

  const existingPerson = person({
    display_name: existing.display_name,
    email: existing.email,
    id: personId,
    preferred_locale: existing.preferred_locale,
    status: existing.user_status
  });

  if (
    actor.actorMembership.role !== "platform_owner" &&
    await personHasPlatformOwnerMembership(sql, existingPerson.id)
  ) {
    throw new Error("Platform Admin cannot change Platform Owner users");
  }

  if (existingPerson.status !== "active") {
    await recordAdminAudit({
      action: "admin.membership_inactive_person_blocked",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId,
      resourceId: existingPerson.id,
      resourceType: "person",
      metadata: { email: existingPerson.email, requestedRole: role, status: existingPerson.status }
    });

    return {
      existingAccess: {
        membership: null,
        organisation: existingOrganisation,
        person: existingPerson,
        reason: "inactive_person" as const
      }
    };
  }

  if (existing.membership_id && existing.role && existing.membership_status) {
    const existingMembershipMetadata = metadataRecord(existing.membership_metadata);

    if (existing.membership_status === "deleted" || existingMembershipMetadata.deletedAt) {
      const restoredRows = await sql<Array<{
        id: string;
        organisation_id: string;
        person_id: string;
        role: string;
        status: string;
        title: string | null;
      }>>`
        update public.organisation_memberships
        set
          role = ${role},
          status = ${status},
          metadata = metadata
            - 'deletedAt'
            - 'deletedByPersonId'
            - 'deletedBySessionId'
            - 'deletedRole'
            - 'deletedStatus',
          updated_at = now()
        where id = ${existing.membership_id}::uuid
        returning id::text, organisation_id::text, person_id::text, role, status, title
      `;
      const restoredMembership = restoredRows[0]
        ? membership(restoredRows[0])
        : null;

      if (!restoredMembership) {
        throw new Error("Unable to restore admin membership");
      }

      await recordAdminAudit({
        action: "admin.membership_restored",
        actorPersonId: actor.actorPerson.id,
        assumedPersonId: actor.assumedPerson?.id ?? null,
        organisationId,
        resourceId: restoredMembership.id,
        resourceType: "organisation_membership",
        metadata: { email: existingPerson.email, role, status }
      });

      return {
        membershipAdded: {
          membership: restoredMembership,
          organisation: existingOrganisation,
          person: existingPerson
        }
      };
    }

    const existingMembership = membership({
      id: existing.membership_id,
      organisation_id: existing.organisation_id,
      organisation_type: existing.organisation_type,
      person_id: personId,
      role: existing.role,
      status: existing.membership_status,
      title: existing.title
    });

    await recordAdminAudit({
      action: "admin.membership_existing_blocked",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId,
      resourceId: existingMembership.id,
      resourceType: "organisation_membership",
      metadata: { email: existingPerson.email, requestedRole: role }
    });

    return {
      existingAccess: {
        membership: existingMembership,
        organisation: existingOrganisation,
        person: existingPerson,
        reason: "existing_membership" as const
      }
    };
  }

  const membershipRows = await sql<Array<{
    id: string;
    organisation_id: string;
    person_id: string;
    role: string;
    status: string;
    title: string | null;
  }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      person_id,
      role,
      status
    )
    values (
      ${organisationId}::uuid,
      'person',
      ${existingPerson.id}::uuid,
      ${role},
      ${status}
    )
    on conflict (person_id, organisation_id)
      where principal_type = 'person' and status <> 'deleted'
    do nothing
    returning id::text, organisation_id::text, person_id::text, role, status, title
  `;
  const addedMembership = membershipRows[0] ? membership(membershipRows[0]) : null;

  if (!addedMembership) {
    return {
      existingAccess: {
        membership: null,
        organisation: existingOrganisation,
        person: existingPerson,
        reason: "existing_membership" as const
      }
    };
  }

  await recordAdminAudit({
    action: "admin.membership_added",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId,
    resourceId: addedMembership.id,
    resourceType: "organisation_membership",
    metadata: { email: existingPerson.email, role, status }
  });

  return {
    membershipAdded: {
      membership: addedMembership,
      organisation: existingOrganisation,
      person: existingPerson
    }
  };
}

export async function deleteAdminInvitation({
  actor,
  invitationId
}: Readonly<{
  actor: AdminSessionContext;
  invitationId: string;
}>) {
  const sql = await sqlOrThrow();

  await expirePendingAdminInvitations(sql, scopedAccessOrganisationId(actor));

  const rows = await sql<Array<{
    email: string;
    id: string;
    organisation_id: string;
  }>>`
    select id::text, organisation_id::text, email
    from public.admin_invitations
    where id = ${invitationId}::uuid
      and status in ('pending', 'expired')
    limit 1
  `;
  const invite = rows[0];

  if (!invite) {
    throw new Error("Pending or expired invite not found");
  }

  if (!canAccessOrganisation(actor, invite.organisation_id)) {
    throw new Error("Retail admins can only delete invites in their own organisation");
  }

  await sql`
    update public.admin_invitations
    set status = 'revoked', updated_at = now()
    where id = ${invitationId}::uuid
      and status in ('pending', 'expired')
  `;

  await recordAdminAudit({
    action: "admin.invite_deleted",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: invite.organisation_id,
    resourceId: invite.id,
    resourceType: "admin_invitation",
    metadata: { email: invite.email }
  });
}

export async function deleteAdminMembership({
  actor,
  membershipId
}: Readonly<{
  actor: AdminSessionContext;
  membershipId: string;
}>) {
  const sql = await sqlOrThrow();
  const rows = await sql<Array<{
    id: string;
    organisation_id: string;
    person_id: string;
    role: string;
    status: string;
  }>>`
    select
      organisation_memberships.id::text,
      organisation_memberships.organisation_id::text,
      organisation_memberships.person_id::text,
      organisation_memberships.role,
      organisation_memberships.status
    from public.organisation_memberships
    join public.organisations
      on organisations.id = organisation_memberships.organisation_id
    where organisation_memberships.id = ${membershipId}::uuid
      and organisation_memberships.principal_type = 'person'
      and organisation_memberships.status <> 'deleted'
      and not (organisation_memberships.metadata ? 'deletedAt')
    limit 1
  `;
  const target = rows[0];

  if (!target) {
    throw new Error("Membership not found");
  }

  if (!canAccessOrganisation(actor, target.organisation_id)) {
    throw new Error("Retail admins can only delete memberships in their own organisation");
  }

  if (
    target.id === actor.actorMembership.id ||
    target.id === actor.effectiveMembership.id
  ) {
    throw new Error("You cannot delete the active session membership");
  }

  if (actor.actorMembership.role !== "platform_owner" && target.role === "platform_owner") {
    throw new Error("Platform Admin cannot change Platform Owner access");
  }

  if (target.role === "platform_owner" && target.status === "active") {
    const ownerRows = await sql<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from public.organisation_memberships
        where role = 'platform_owner'
          and principal_type = 'person'
          and status = 'active'
          and status <> 'deleted'
          and not (metadata ? 'deletedAt')
          and id <> ${target.id}::uuid
      ) as exists
    `;

    if (!ownerRows[0]?.exists) {
      throw new Error("At least one active Platform Owner membership is required");
    }
  }

  await sql`
    update public.organisation_memberships
    set
      status = 'deleted',
      metadata = metadata || jsonb_build_object(
        'deletedAt', now(),
        'deletedByPersonId', ${actor.actorPerson.id},
        'deletedBySessionId', ${actor.sessionId},
        'deletedRole', role,
        'deletedStatus', status
      ),
      updated_at = now()
    where id = ${membershipId}::uuid
      and principal_type = 'person'
      and status <> 'deleted'
      and not (metadata ? 'deletedAt')
  `;

  await recordAdminAudit({
    action: "admin.membership_deleted",
    actorPersonId: actor.actorPerson.id,
    assumedPersonId: actor.assumedPerson?.id ?? null,
    organisationId: target.organisation_id,
    resourceId: target.id,
    resourceType: "organisation_membership",
    metadata: {
      personId: target.person_id,
      role: target.role,
      status: target.status
    }
  });
}

export async function updateMembershipRole({
  actor,
  membershipId,
  role,
  status
}: Readonly<{
  actor: AdminSessionContext;
  membershipId: string;
  role: AdminRole;
  status: AdminAccessStatus;
}>) {
  const sql = await sqlOrThrow();
  const organisationRows = await sql<Array<{
    organisation_id: string;
    organisation_type: string;
    role: string;
    status: string;
  }>>`
    select
      organisation_memberships.organisation_id::text,
      organisations.organisation_type,
      organisation_memberships.role,
      organisation_memberships.status
    from public.organisation_memberships
    join public.organisations
      on organisations.id = organisation_memberships.organisation_id
    where organisation_memberships.id = ${membershipId}::uuid
      and organisation_memberships.principal_type = 'person'
      and organisation_memberships.status <> 'deleted'
    limit 1
  `;
  const organisationRow = organisationRows[0];

  if (!organisationRow) {
    return null;
  }

  const organisationType: AdminOrganisationType =
    organisationRow.organisation_type === "platform" ? "platform" : "tenant";

  if (!canAccessOrganisation(actor, organisationRow.organisation_id)) {
    throw new Error("Retail admins can only update memberships in their own organisation");
  }

  if (!adminRoleAllowedForOrganisationType(role, organisationType)) {
    throw new Error("Role is not allowed for this organisation");
  }

  if (
    actor.actorMembership.role !== "platform_owner" &&
    (organisationRow.role === "platform_owner" || role === "platform_owner")
  ) {
    throw new Error("Platform Admin cannot change Platform Owner access");
  }

  if (status === "deleted") {
    await deleteAdminMembership({ actor, membershipId });

    return null;
  }

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
      and principal_type = 'person'
      and status <> 'deleted'
    returning id::text, organisation_id::text, person_id::text, role, status, title
  `;

  const savedMembership = rows[0] ? membership(rows[0]) : null;

  if (savedMembership) {
    await recordAdminAudit({
      action: "admin.membership_updated",
      actorPersonId: actor.actorPerson.id,
      assumedPersonId: actor.assumedPerson?.id ?? null,
      organisationId: savedMembership.organisationId,
      resourceId: savedMembership.id,
      resourceType: "organisation_membership",
      metadata: {
        after: {
          role: savedMembership.role,
          status: savedMembership.status
        },
        before: {
          role: organisationRow.role,
          status: organisationRow.status
        },
        personId: savedMembership.personId
      }
    });
  }

  return savedMembership;
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
    role: string;
  }>>`
    select person_id::text, organisation_id::text, role
    from public.organisation_memberships
    where id = ${membershipId}::uuid
      and principal_type = 'person'
      and status = 'active'
    limit 1
  `;
  const target = rows[0];

  if (!target) {
    throw new Error("That identity is not active");
  }

  if (target.role === "platform_owner" && actor.actorMembership.role !== "platform_owner") {
    throw new Error("Platform Admin cannot assume Platform Owner access");
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
