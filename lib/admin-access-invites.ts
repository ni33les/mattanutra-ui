/**
 * Admin invitations, membership mutations, and impersonation.
 * Re-exported from the admin-access facade for stable call sites.
 */
import { recordAdminAudit } from "@/lib/admin-access-audit";
import {
  canAccessOrganisation,
  expirePendingAdminInvitations,
  inviteDays,
  localeValue,
  membership,
  metadataRecord,
  normalizeEmail,
  organisation,
  person,
  personHasPlatformOwnerMembership,
  roleValue,
  scopedAccessOrganisationId,
  sqlOrThrow
} from "@/lib/admin-access-shared";
import type {
  AdminAccessStatus,
  AdminSessionContext
} from "@/lib/admin-access-types";
import {
  adminRoleAllowedForOrganisationType,
  type AdminOrganisationType,
  type AdminRole
} from "@/lib/admin-rbac";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import type { Locale } from "@/lib/i18n";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";

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

