import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON
} from "@simplewebauthn/server";
import { recordAdminAudit } from "@/lib/admin-access-audit";
import { agentCredentialSummary } from "@/lib/admin-access-agents";
import {
  allowedOrigins,
  base64Url,
  bytesFromBase64Url,
  canAccessOrganisation,
  configuredAgentGrokModel,
  configuredAgentPrompt,
  configuredAgentReasoningLevel,
  displayNameFromEmail,
  expirePendingAdminInvitations,
  hasPlatformAccessScope,
  inviteDays,
  localeValue,
  loginChallengeMinutes,
  membership,
  metadataRecord,
  normalizeEmail,
  normalOrganisationCountry,
  normalOrganisationCurrency,
  organisation,
  person,
  personBelongsToOrganisation,
  personHasPlatformOwnerMembership,
  platformBootstrapEmail,
  platformOrganisation,
  recoveryInviteMinutes,
  registrationChallengeMinutes,
  requestRpId,
  roleValue,
  scopedAccessOrganisationId,
  sqlOrThrow,
  toJsonValue
} from "@/lib/admin-access-shared";
import { createAdminSession } from "@/lib/admin-access-session";
import type {
  AdminAccessData,
  AdminAccessStatus,
  AdminSettingsData,
  AdminSessionContext
} from "@/lib/admin-access-types";
import {
  adminRoleAllowedForOrganisationType,
  adminRoleLabels,
  adminRoles,
  isAgentRole,
  normalizeAgentRole,
  type AdminOrganisationType,
  type AdminRole
} from "@/lib/admin-rbac";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import {
  getCustomerPriceMarginPercent,
  normalizeCustomerPriceMarginPercent
} from "@/lib/customer-pricing";
import type { Locale } from "@/lib/i18n";
import { normalizeDispatchCity } from "@/lib/organisation-dispatch";
import {
  DEFAULT_FLAT_RATE_SHIPPING_AMOUNT,
  normalizeFlatRateShippingAmount,
  resolveFlatRateShippingCharge
} from "@/lib/shipping-fees";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";

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
export { recordAdminAudit } from "@/lib/admin-access-audit";
export {
  addAgentMembership,
  createAgent,
  deleteAgentMembership,
  generateAgentCredential,
  inviteAgent,
  revokeAgentCredential,
  rotateAgentCredential,
  updateAgent
} from "@/lib/admin-access-agents";
export {
  adminCookieOptions,
  adminCsrfCookieOptions,
  adminCsrfCookieName,
  adminSessionCookieName,
  clearAdminCookieOptions,
  clientAdminSessionContext,
  createAdminSession,
  legacyAdminContext,
  resolveAdminSession,
  revokeAdminSession,
  signAdminSessionContext
} from "@/lib/admin-access-session";

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
  revoked_at?: string | null;
  status?: string;
  transports: AuthenticatorTransportFuture[];
}>;


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
      backed_up,
      status,
      revoked_at::text
    from public.admin_passkey_credentials
    where person_id = ${personId}::uuid
      and status = 'active'
      and revoked_at is null
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
      metadata: unknown;
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
        admin_invitations.preferred_locale,
        admin_invitations.metadata
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

    const inviteMetadata = metadataRecord(invite.metadata);
    metadata = {
      ...metadata,
      invitationId: invite.id,
      locale: localeValue(invite.preferred_locale),
      mode: "invite",
      organisationId: invite.organisation_id,
      reason: inviteMetadata.reason,
      recoveryPersonId: inviteMetadata.personId,
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
      role = case
        when public.organisation_memberships.status = 'invited' then excluded.role
        else public.organisation_memberships.role
      end,
      status = case
        when public.organisation_memberships.status = 'invited' then 'active'
        else public.organisation_memberships.status
      end,
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

async function insertAdminPasskeyCredential({
  backedUp,
  counter,
  credentialId,
  deviceType,
  label,
  personId,
  publicKey,
  transports
}: Readonly<{
  backedUp: boolean;
  counter: number;
  credentialId: string;
  deviceType: string;
  label: string;
  personId: string;
  publicKey: Uint8Array | Buffer;
  transports: readonly AuthenticatorTransportFuture[];
}>) {
  const sql = await sqlOrThrow();
  const credentialRows = await sql<Array<{ id: string }>>`
    insert into public.admin_passkey_credentials (
      person_id,
      credential_id,
      credential_public_key,
      counter,
      transports,
      device_type,
      backed_up,
      status,
      label
    )
    values (
      ${personId}::uuid,
      ${credentialId},
      ${base64Url(publicKey)},
      ${counter},
      ${transports},
      ${deviceType},
      ${backedUp},
      'active',
      ${label}
    )
    on conflict (credential_id) do nothing
    returning id::text
  `;

  if (!credentialRows[0]) {
    throw new Error("This passkey is already registered or was previously revoked");
  }

  return credentialRows[0].id;
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
  const recoveryPersonId = String(challenge.metadata.recoveryPersonId || "");
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

  if (
    challenge.metadata.reason === "passkey_recovery" &&
    recoveryPersonId &&
    recoveryPersonId !== savedPerson.id
  ) {
    throw new Error("Recovery invite does not match this admin person");
  }

  await insertAdminPasskeyCredential({
    backedUp: info.credentialBackedUp,
    counter: info.credential.counter,
    credentialId: info.credential.id,
    deviceType: info.credentialDeviceType,
    label: "Passkey",
    personId: savedPerson.id,
    publicKey: info.credential.publicKey,
    transports: response.response.transports ?? []
  });

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
    action: challenge.metadata.reason === "passkey_recovery"
      ? "admin.passkey_recovery_accepted"
      : "admin.passkey_registered",
    actorPersonId: savedPerson.id,
    organisationId,
    resourceId: savedPerson.id,
    resourceType: "person",
    metadata: {
      invitationId: challenge.metadata.invitationId ?? null,
      reason: challenge.metadata.reason ?? null
    }
  });

  return createAdminSession({ organisationId, personId: savedPerson.id });
}

export async function createAdditionalPasskeyRegistrationOptions({
  context,
  request
}: Readonly<{
  context: AdminSessionContext;
  request: Request;
}>) {
  if (context.isLegacy) {
    throw new Error("A passkey session is required to add another passkey");
  }

  const existingCredentials = await credentialsForPerson(context.actorPerson.id);
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
    rpID: requestRpId(request),
    rpName: "MattaNutra Admin",
    timeout: 60_000,
    userDisplayName: context.actorPerson.displayName,
    userID: Buffer.from(context.actorPerson.email),
    userName: context.actorPerson.email
  });
  const challengeId = await createChallenge({
    challenge: options.challenge,
    challengeType: "registration",
    email: context.actorPerson.email,
    expiresInMinutes: registrationChallengeMinutes,
    metadata: {
      displayName: context.actorPerson.displayName,
      email: context.actorPerson.email,
      locale: context.actorPerson.preferredLocale,
      mode: "add_passkey",
      organisationId: context.actorOrganisation.id,
      personId: context.actorPerson.id,
      role: context.actorMembership.role
    },
    personId: context.actorPerson.id
  });

  if (!challengeId) {
    throw new Error("Unable to create registration challenge");
  }

  return { challengeId, options };
}

export async function verifyAdditionalPasskeyRegistration({
  challengeId,
  context,
  request,
  response
}: Readonly<{
  challengeId: string;
  context: AdminSessionContext;
  request: Request;
  response: RegistrationResponseJSON;
}>) {
  if (context.isLegacy) {
    throw new Error("A passkey session is required to add another passkey");
  }

  const challenge = await consumeChallenge(challengeId, "registration");

  if (
    !challenge ||
    challenge.metadata.mode !== "add_passkey" ||
    challenge.person_id !== context.actorPerson.id
  ) {
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

  await insertAdminPasskeyCredential({
    backedUp: info.credentialBackedUp,
    counter: info.credential.counter,
    credentialId: info.credential.id,
    deviceType: info.credentialDeviceType,
    label: "Passkey",
    personId: context.actorPerson.id,
    publicKey: info.credential.publicKey,
    transports: response.response.transports ?? []
  });

  await recordAdminAudit({
    action: "admin.passkey_added",
    actorPersonId: context.actorPerson.id,
    organisationId: context.actorOrganisation.id,
    resourceId: context.actorPerson.id,
    resourceType: "person"
  });

  return { ok: true };
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
      backed_up,
      status,
      revoked_at::text
    from public.admin_passkey_credentials
    where credential_id = ${credentialId}
      and (${personId}::uuid is null or person_id = ${personId}::uuid)
      and status = 'active'
      and revoked_at is null
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
        country_code: string | null;
        currency: string | null;
        default_locale: string;
        id: string;
        metadata: unknown;
        name: string;
        organisation_type: string;
        slug: string;
        status: string;
      }>>`
        select id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
        from public.organisations
        ${organisationScope}
        order by organisation_type asc, lower(name) asc
      `,
      sql<Array<{
        active_passkey_count: number | string;
        display_name: string;
        email: string;
        id: string;
        last_passkey_used_at: Date | string | null;
        passkeys: unknown;
        preferred_locale: string;
        status: string;
      }>>`
        select
          people.id::text,
          people.email,
          people.display_name,
          people.preferred_locale,
          people.status,
          coalesce(passkeys.active_passkey_count, 0) as active_passkey_count,
          passkeys.last_passkey_used_at,
          coalesce(passkeys.credentials, '[]'::jsonb) as passkeys
        from public.people
        left join lateral (
          select
            count(*) filter (
              where credentials.status = 'active'
                and credentials.revoked_at is null
            )::int as active_passkey_count,
            max(last_used_at) filter (
              where credentials.status = 'active'
                and credentials.revoked_at is null
            ) as last_passkey_used_at,
            jsonb_agg(
              jsonb_build_object(
                'createdAt', credentials.created_at,
                'credentialId', credentials.credential_id,
                'id', credentials.id::text,
                'label', credentials.label,
                'lastUsedAt', credentials.last_used_at,
                'status', credentials.status
              )
              order by
                case
                  when credentials.status = 'active'
                    and credentials.revoked_at is null
                  then 0
                  else 1
                end,
                credentials.updated_at desc
            ) filter (where credentials.id is not null) as credentials
          from public.admin_passkey_credentials credentials
          where credentials.person_id = people.id
        ) passkeys on true
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
      country_code: string | null;
      currency: string | null;
      default_locale: string;
      id: string;
      metadata: unknown;
      name: string;
      organisation_type: string;
      slug: string;
      status: string;
    }>>`
      select id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
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
  const canEditCustomerPriceMargin =
    !context.isLegacy &&
    currentOrganisation.type === "platform" &&
    (
      context.effectiveMembership.role === "platform_owner" ||
      context.effectiveMembership.role === "platform_admin"
    );

  const shipping = await resolveFlatRateShippingCharge({
    organisationId: currentOrganisation.id,
    sql
  });

  return {
    canEditCustomerPriceMargin,
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
    customerPriceMarginPercent: await getCustomerPriceMarginPercent({ sql }),
    flatRateShippingAmount: shipping.amount,
    flatRateShippingSource: shipping.source,
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
  countryCode,
  currency,
  defaultLocale,
  dispatchCity,
  name,
  slug,
  type
}: Readonly<{
  actor?: AdminSessionContext | null;
  countryCode?: string | null;
  currency?: string | null;
  defaultLocale: Locale;
  dispatchCity?: string | null;
  name: string;
  slug: string;
  type: AdminOrganisationType;
}>) {
  const sql = await sqlOrThrow();
  const normalizedCountryCode = normalOrganisationCountry(countryCode);
  const normalizedCurrency = normalOrganisationCurrency(currency, type);
  const normalizedDispatchCity = normalizeDispatchCity(dispatchCity);
  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    default_locale: string;
    id: string;
    metadata: unknown;
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
      currency,
      metadata
    )
    values (
      ${slug.trim().toLowerCase()},
      ${name.trim()},
      ${type},
      'active',
      ${defaultLocale},
      ${normalizedCountryCode},
      ${normalizedCurrency},
      ${sql.json(toJsonValue(
        normalizedDispatchCity ? { dispatchCity: normalizedDispatchCity } : {}
      ))}::jsonb
    )
    returning id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
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
        dispatchCity: savedOrganisation.dispatchCity,
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
  countryCode,
  currency,
  defaultLocale,
  dispatchCity,
  id,
  name,
  slug,
  status
}: Readonly<{
  actor?: AdminSessionContext | null;
  countryCode?: string | null;
  currency?: string | null;
  defaultLocale: Locale;
  dispatchCity?: string | null;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "disabled";
}>) {
  const sql = await sqlOrThrow();
  const beforeRows = actor
    ? await sql<Array<{
        country_code: string | null;
        currency: string | null;
        default_locale: string;
        id: string;
        metadata: unknown;
        name: string;
        organisation_type: string;
        slug: string;
        status: string;
      }>>`
        select id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
        from public.organisations
        where id = ${id}::uuid
        limit 1
      `
    : [];
  const organisationType =
    beforeRows[0]?.organisation_type === "platform" ? "platform" : "tenant";
  const normalizedCurrency = normalOrganisationCurrency(
    currency,
    organisationType
  );
  const normalizedCountryCode = normalOrganisationCountry(countryCode);
  const normalizedDispatchCity = normalizeDispatchCity(dispatchCity);
  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    default_locale: string;
    id: string;
    metadata: unknown;
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
      country_code = ${normalizedCountryCode},
      currency = ${normalizedCurrency},
      metadata = case
        when ${normalizedDispatchCity ?? ""} <> '' then
          coalesce(metadata, '{}'::jsonb) || jsonb_build_object('dispatchCity', ${normalizedDispatchCity ?? ""})
        else
          coalesce(metadata, '{}'::jsonb) - 'dispatchCity'
      end,
      updated_at = now()
    where id = ${id}::uuid
    returning id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
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
  customerPriceMarginPercent,
  defaultLocale,
  dispatchCity,
  flatRateShippingAmount,
  name
}: Readonly<{
  context: AdminSessionContext;
  currency?: string | null;
  customerPriceMarginPercent?: number | null;
  defaultLocale: Locale;
  dispatchCity?: string | null;
  flatRateShippingAmount?: number | null;
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

  const canEditCurrency =
    context.actorMembership.role === "platform_owner" ||
    context.actorMembership.role === "platform_admin";
  const canEditCustomerPriceMargin =
    context.effectiveOrganisation.type === "platform" &&
    (
      context.effectiveMembership.role === "platform_owner" ||
      context.effectiveMembership.role === "platform_admin"
    );
  const requestedCurrency = currency?.trim().toUpperCase() ?? "";

  if (
    requestedCurrency &&
    requestedCurrency !== context.effectiveOrganisation.currency &&
    !canEditCurrency
  ) {
    throw new Error("Only platform admins can update organisation currency");
  }

  const normalizedCurrency =
    canEditCurrency && requestedCurrency
      ? requestedCurrency
      : context.effectiveOrganisation.currency;

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Currency must be a three-letter ISO-4217 code");
  }

  const sql = await sqlOrThrow();
  const requestedCustomerPriceMargin = customerPriceMarginPercent !== undefined;
  const requestedFlatRateShippingAmount = flatRateShippingAmount !== undefined;
  const normalizedDispatchCity = normalizeDispatchCity(dispatchCity);

  if (requestedCustomerPriceMargin && !canEditCustomerPriceMargin) {
    throw new Error("Customer margin can only be updated at platform level");
  }

  const marginMetadataPatch =
    requestedCustomerPriceMargin && canEditCustomerPriceMargin
      ? {
          customerPriceMarginPercent: normalizeCustomerPriceMarginPercent(
            customerPriceMarginPercent
          )
        }
      : {};
  const shippingMetadataPatch = requestedFlatRateShippingAmount
    ? {
        flatRateShippingAmount:
          normalizeFlatRateShippingAmount(flatRateShippingAmount) ??
          DEFAULT_FLAT_RATE_SHIPPING_AMOUNT
      }
    : {};
  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    default_locale: string;
    id: string;
    metadata: unknown;
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
      metadata = case
        when ${normalizedDispatchCity ?? ""} <> '' then
          (
            (case
              when organisation_type = 'platform' then coalesce(metadata, '{}'::jsonb) || ${sql.json(marginMetadataPatch)}::jsonb
              else coalesce(metadata, '{}'::jsonb) - 'customerPriceMarginPercent'
            end)
            || ${sql.json(shippingMetadataPatch)}::jsonb
          ) || jsonb_build_object('dispatchCity', ${normalizedDispatchCity ?? ""})
        else
          (
            (case
              when organisation_type = 'platform' then coalesce(metadata, '{}'::jsonb) || ${sql.json(marginMetadataPatch)}::jsonb
              else coalesce(metadata, '{}'::jsonb) - 'customerPriceMarginPercent'
            end)
            || ${sql.json(shippingMetadataPatch)}::jsonb
          ) - 'dispatchCity'
      end,
      updated_at = now()
    where id = ${context.effectiveOrganisation.id}::uuid
    returning id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata
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

export async function createAdminPasskeyRecovery({
  actor,
  personId,
  source = "admin_ui"
}: Readonly<{
  actor: AdminSessionContext;
  personId: string;
  source?: "admin_ui" | "break_glass_cli";
}>) {
  if (actor.isLegacy) {
    throw new Error("A passkey session is required to recover passkeys");
  }

  if (actor.actorMembership.role !== "platform_owner") {
    throw new Error("Only platform owners can recover passkeys");
  }

  if (actor.actorPerson.id === personId) {
    throw new Error("You cannot recover your own passkeys from an active session");
  }

  const sql = await sqlOrThrow();
  const token = randomAdminToken();
  const recoveryRows = await sql<Array<{
    email: string;
    expires_at: Date | string;
    id: string;
    organisation_id: string;
    organisation_type: string;
    person_id: string;
    preferred_locale: string;
    role: string;
  }>>`
    with target as (
      select
        people.id::text as person_id,
        people.email,
        people.preferred_locale,
        organisations.id::text as organisation_id,
        organisations.organisation_type,
        organisation_memberships.role
      from public.people
      join public.organisation_memberships
        on organisation_memberships.person_id = people.id
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where people.id = ${personId}::uuid
        and people.status = 'active'
        and organisations.status = 'active'
        and organisation_memberships.principal_type = 'person'
        and organisation_memberships.status = 'active'
      order by
        case organisation_memberships.role
          when 'platform_owner' then 0
          when 'platform_admin' then 1
          else 2
        end,
        organisation_memberships.created_at asc
      limit 1
    ),
    revoked_recovery_invites as (
      update public.admin_invitations
      set status = 'revoked', updated_at = now()
      from target
      where admin_invitations.email = target.email
        and status = 'pending'
        and metadata->>'reason' = 'passkey_recovery'
      returning admin_invitations.id
    ),
    invite as (
      insert into public.admin_invitations (
        organisation_id,
        email,
        role,
        invited_by_person_id,
        token_hash,
        preferred_locale,
        status,
        metadata,
        expires_at
      )
      select
        target.organisation_id::uuid,
        target.email,
        target.role,
        ${actor.actorPerson.id}::uuid,
        ${hashAdminToken(token)},
        target.preferred_locale,
        'pending',
        jsonb_build_object(
          'personId', target.person_id,
          'reason', 'passkey_recovery',
          'revokedByPersonId', ${actor.actorPerson.id}::text,
          'source', ${source}::text
        ),
        now() + (${recoveryInviteMinutes}::text || ' minutes')::interval
      from target
      returning id::text, organisation_id::text, email, role, preferred_locale, expires_at
    ),
    revoked_passkeys as (
      update public.admin_passkey_credentials
      set
        status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        revoked_by_person_id = ${actor.actorPerson.id}::uuid,
        revoked_invitation_id = invite.id::uuid,
        metadata = metadata || jsonb_build_object(
          'recoveryInvitationId', invite.id,
          'revokedReason', 'passkey_recovery',
          'revokedSource', ${source}::text
        ),
        updated_at = now()
      from target, invite
      where admin_passkey_credentials.person_id = target.person_id::uuid
        and admin_passkey_credentials.status = 'active'
        and admin_passkey_credentials.revoked_at is null
      returning admin_passkey_credentials.id
    ),
    revoked_sessions as (
      update public.admin_sessions
      set revoked_at = coalesce(revoked_at, now())
      from target
      where admin_sessions.person_id = target.person_id::uuid
        and admin_sessions.revoked_at is null
      returning admin_sessions.id
    )
    select
      invite.id,
      invite.organisation_id,
      invite.email,
      invite.role,
      invite.preferred_locale,
      invite.expires_at,
      target.person_id,
      target.organisation_type
    from invite
    join target on true
  `;
  const recovery = recoveryRows[0];

  if (!recovery) {
    throw new Error("Active admin person not found");
  }

  const preferredLocale = localeValue(recovery.preferred_locale);
  const inviteUrl = `${siteBaseUrl()}/${preferredLocale}/admin/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(recovery.email)}`;
  const delivery = await sendTransactionalEmail({
    html: `<p>Your MattaNutra Admin passkeys have been reset.</p><p><a href="${inviteUrl}">Create a new admin passkey</a></p><p>This recovery link expires in ${recoveryInviteMinutes} minutes.</p>`,
    subject: "Recover your MattaNutra Admin passkey",
    to: recovery.email
  });

  await recordAdminAudit({
    action: "admin.passkey_recovery_started",
    actorPersonId: actor.actorPerson.id,
    organisationId: recovery.organisation_id,
    resourceId: recovery.person_id,
    resourceType: "person",
    metadata: {
      invitationId: recovery.id,
      reason: delivery.reason,
      sent: delivery.sent,
      source
    }
  });

  return {
    invite: {
      email: recovery.email,
      expiresAt: new Date(recovery.expires_at).toISOString(),
      id: recovery.id,
      organisationId: recovery.organisation_id,
      preferredLocale,
      role: roleValue(
        recovery.role,
        recovery.organisation_type === "tenant" ? "tenant" : "platform"
      ),
      status: "pending" as const
    },
    inviteUrl,
    sent: delivery.sent
  };
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
    passkey_count: number | string;
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
      organisation_memberships.title,
      coalesce(passkeys.passkey_count, 0) as passkey_count
    from public.organisations
    left join public.people on lower(people.email) = ${normalizedEmail}
    left join public.organisation_memberships
      on organisation_memberships.organisation_id = organisations.id
      and organisation_memberships.person_id = people.id
      and organisation_memberships.principal_type = 'person'
      and organisation_memberships.principal_type = 'person'
    left join lateral (
      select count(*)::int as passkey_count
      from public.admin_passkey_credentials credentials
      where credentials.person_id = people.id
        and credentials.status = 'active'
        and credentials.revoked_at is null
    ) passkeys on true
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

  let shouldCreatePasskeyInviteForExistingMember = false;

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
      const passkeyCount = Number(existing.passkey_count ?? 0);

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

      if (
        passkeyCount < 1 &&
        (existing.membership_status === "active" ||
          existing.membership_status === "invited")
      ) {
        shouldCreatePasskeyInviteForExistingMember = true;
      } else {
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
    }

    if (
      existingPerson.status !== "active" &&
      !(shouldCreatePasskeyInviteForExistingMember && existingPerson.status === "invited")
    ) {
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

    if (shouldCreatePasskeyInviteForExistingMember) {
      await recordAdminAudit({
        action: "admin.invite_existing_member_passkey",
        actorPersonId: actor.actorPerson.id,
        assumedPersonId: actor.assumedPerson?.id ?? null,
        organisationId,
        resourceId: existing.membership_id,
        resourceType: "organisation_membership",
        metadata: { email: normalizedEmail, requestedRole: role }
      });
    } else {
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

