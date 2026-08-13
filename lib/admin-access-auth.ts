/**
 * Admin passkey registration/login and passkey recovery.
 * Re-exported from the admin-access facade for stable call sites.
 */
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
import {
  allowedOrigins,
  base64Url,
  bytesFromBase64Url,
  displayNameFromEmail,
  expirePendingAdminInvitations,
  localeValue,
  loginChallengeMinutes,
  membership,
  metadataRecord,
  normalizeEmail,
  person,
  platformBootstrapEmail,
  platformOrganisation,
  recoveryInviteMinutes,
  addDeviceInviteDays,
  registrationChallengeMinutes,
  requestRpId,
  roleValue,
  sqlOrThrow,
  toJsonValue
} from "@/lib/admin-access-shared";
import { createAdminSession } from "@/lib/admin-access-session";
import type {
  AdminSessionContext
} from "@/lib/admin-access-types";
import type { AdminRole } from "@/lib/admin-rbac";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import type { Locale } from "@/lib/i18n";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";

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
    (challenge.metadata.reason === "passkey_recovery" ||
      challenge.metadata.reason === "passkey_add_device") &&
    recoveryPersonId &&
    recoveryPersonId !== savedPerson.id
  ) {
    throw new Error("Invite does not match this admin person");
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
      : challenge.metadata.reason === "passkey_add_device"
        ? "admin.passkey_add_device_accepted"
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

export async function createAdminPasskeyAddDeviceInvite({
  actor,
  personId
}: Readonly<{
  actor: AdminSessionContext;
  personId: string;
}>) {
  if (actor.isLegacy) {
    throw new Error("A passkey session is required to add a device");
  }

  if (
    actor.actorMembership.role !== "platform_owner" &&
    actor.actorMembership.role !== "platform_admin"
  ) {
    throw new Error("Only platform admins can send add-device invites");
  }

  const sql = await sqlOrThrow();
  const token = randomAdminToken();
  const rows = await sql<Array<{
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
    revoked_stale_invites as (
      update public.admin_invitations
      set status = 'revoked', updated_at = now()
      from target
      where admin_invitations.email = target.email
        and status = 'pending'
        and metadata->>'reason' = 'passkey_add_device'
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
          'reason', 'passkey_add_device',
          'invitedByPersonId', ${actor.actorPerson.id}::text
        ),
        now() + (${addDeviceInviteDays}::text || ' days')::interval
      from target
      returning id::text, organisation_id::text, email, role, preferred_locale, expires_at
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
  const invite = rows[0];

  if (!invite) {
    throw new Error("Active admin person not found");
  }

  const preferredLocale = localeValue(invite.preferred_locale);
  const inviteUrl = `${siteBaseUrl()}/${preferredLocale}/admin/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}&intent=add_device`;
  const delivery = await sendTransactionalEmail({
    html: `<p>Add another device to your MattaNutra Admin account.</p><p>Open this link on the phone or computer you want to use, then create a passkey.</p><p><a href="${inviteUrl}">Add a passkey on this device</a></p><p>This link expires in ${addDeviceInviteDays} days. Your existing devices keep working.</p>`,
    subject: "Add another device to MattaNutra Admin",
    to: invite.email
  });

  await recordAdminAudit({
    action: "admin.passkey_add_device_started",
    actorPersonId: actor.actorPerson.id,
    organisationId: invite.organisation_id,
    resourceId: invite.person_id,
    resourceType: "person",
    metadata: {
      invitationId: invite.id,
      reason: delivery.reason,
      sent: delivery.sent
    }
  });

  return {
    invite: {
      email: invite.email,
      expiresAt: new Date(invite.expires_at).toISOString(),
      id: invite.id,
      organisationId: invite.organisation_id,
      preferredLocale,
      role: roleValue(
        invite.role,
        invite.organisation_type === "tenant" ? "tenant" : "platform"
      ),
      status: "pending" as const
    },
    inviteUrl,
    sent: delivery.sent
  };
}

