import { recordAdminAudit } from "@/lib/admin-access-audit";
import type {
  AdminAccessStatus,
  AdminSessionContext,
  AgentCredentialCreated,
  AgentCredentialSummary
} from "@/lib/admin-access-types";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import {
  type AdminOrganisationType,
  type AgentRole
} from "@/lib/admin-rbac";
import { getSql } from "@/lib/db";
import { normalizeCapabilities } from "@/lib/task-service-utils";

type Db = NonNullable<ReturnType<typeof getSql>>;

async function sqlOrThrow() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required for admin access");
  }

  return sql;
}

function hasPlatformAccessScope(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
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

export function agentCredentialSummary(row: Record<string, unknown>): AgentCredentialSummary {
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
