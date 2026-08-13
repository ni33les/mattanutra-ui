import { recordAdminAudit } from "@/lib/admin-access-audit";
import { agentCredentialSummary } from "@/lib/admin-access-agents";
import {
  configuredAgentGrokModel,
  configuredAgentPrompt,
  configuredAgentReasoningLevel,
  expirePendingAdminInvitations,
  hasPlatformAccessScope,
  localeValue,
  membership,
  metadataRecord,
  normalOrganisationCountry,
  normalOrganisationCurrency,
  organisation,
  person,
  personBelongsToOrganisation,
  personHasPlatformOwnerMembership,
  roleValue,
  scopedAccessOrganisationId,
  sqlOrThrow,
  toJsonValue
} from "@/lib/admin-access-shared";
import type {
  AdminAccessData,
  AdminAccessStatus,
  AdminSettingsData,
  AdminSessionContext
} from "@/lib/admin-access-types";
import {
  adminRoleLabels,
  adminRoles,
  isAgentRole,
  normalizeAgentRole,
  type AdminOrganisationType
} from "@/lib/admin-rbac";
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
  createAdditionalPasskeyRegistrationOptions,
  createAdminPasskeyAddDeviceInvite,
  createAdminPasskeyRecovery,
  createAuthenticationOptions,
  createRegistrationOptions,
  hasPlatformOwner,
  verifyAdditionalPasskeyRegistration,
  verifyAuthenticationAndCreateSession,
  verifyRegistrationAndCreateSession
} from "@/lib/admin-access-auth";
export {
  addAdminMembership,
  assumeAdminIdentity,
  createAdminInvitation,
  deleteAdminInvitation,
  deleteAdminMembership,
  stopAdminImpersonation,
  updateMembershipRole
} from "@/lib/admin-access-invites";
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



