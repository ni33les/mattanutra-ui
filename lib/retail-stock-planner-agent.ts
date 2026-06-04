import type postgres from "postgres";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import { toJsonValue } from "@/lib/assessment-store";
import { AGENT_CAPABILITIES, SYSTEM_AGENTS } from "@/lib/system-agents";

type Db = postgres.Sql;

type SeededMembership = Readonly<{
  credentialDisplayPrefix: string | null;
  credentialId: string | null;
  generatedApiKey: string | null;
  id: string;
  organisationId: string;
  organisationName: string;
}>;

export type SeedRetailStockPlannerAgentResult = Readonly<{
  agentId: string;
  generatedCredentials: readonly SeededMembership[];
  memberships: readonly SeededMembership[];
}>;

async function recordSeedAudit(
  sql: Db,
  input: Readonly<{
    action: string;
    metadata?: Record<string, unknown>;
    organisationId?: string | null;
    resourceId?: string | null;
    resourceType?: string | null;
  }>
) {
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
      ${input.organisationId ?? null}::uuid,
      null,
      null,
      ${input.action},
      ${input.resourceType ?? null},
      ${input.resourceId ?? null},
      ${sql.json(toJsonValue(input.metadata ?? {}))}::jsonb
    )
  `.catch(() => undefined);
}

async function activeCredentialForMembership(
  sql: Db,
  input: Readonly<{
    agentId: string;
    membershipId: string;
  }>
) {
  const rows = await sql<Array<{
    display_prefix: string;
    id: string;
  }>>`
    select id::text, display_prefix
    from public.agent_credentials
    where agent_id = ${input.agentId}::uuid
      and membership_id = ${input.membershipId}::uuid
      and status = 'active'
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

async function generateCredentialForMembership(
  sql: Db,
  input: Readonly<{
    agentId: string;
    membershipId: string;
    organisationId: string;
    organisationName: string;
  }>
) {
  const apiKey = `mnag_${randomAdminToken(32)}`;
  const rows = await sql<Array<{
    display_prefix: string;
    id: string;
  }>>`
    insert into public.agent_credentials (
      agent_id,
      membership_id,
      credential_hash,
      display_prefix,
      label,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${input.agentId}::uuid,
      ${input.membershipId}::uuid,
      ${hashAdminToken(apiKey)},
      ${apiKey.slice(0, 12)},
      ${`Retail Stock Planner - ${input.organisationName}`},
      ${sql.json(toJsonValue({
        generatedBy: "seedRetailStockPlannerAgent",
        organisationId: input.organisationId,
        systemAgentKey: "retailStockPlanner"
      }))}::jsonb,
      now(),
      now()
    )
    returning id::text, display_prefix
  `;
  const credential = rows[0];

  if (!credential) {
    throw new Error("Retail Stock Planner credential could not be generated");
  }

  await recordSeedAudit(sql, {
    action: "system.retail_stock_planner_credential_generated",
    metadata: {
      agentId: input.agentId,
      credentialId: credential.id,
      displayPrefix: credential.display_prefix,
      membershipId: input.membershipId
    },
    organisationId: input.organisationId,
    resourceId: input.membershipId,
    resourceType: "agent_credential"
  });

  return {
    apiKey,
    displayPrefix: credential.display_prefix,
    id: credential.id
  };
}

export async function seedRetailStockPlannerAgent(
  sql: Db
): Promise<SeedRetailStockPlannerAgentResult> {
  const definition = SYSTEM_AGENTS.retailStockPlanner;
  const capabilities = [
    AGENT_CAPABILITIES.retailStockForecast,
    AGENT_CAPABILITIES.retailStockPolicyReview,
    AGENT_CAPABILITIES.retailStockAutomationPropose
  ];
  const agentRows = await sql<Array<{ id: string }>>`
    insert into public.agents (
      id,
      name,
      agent_type,
      role,
      status,
      capabilities,
      model,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${definition.id}::uuid,
      ${definition.name},
      'deterministic',
      'retail_agent',
      'active',
      ${capabilities},
      ${definition.model},
      ${sql.json(toJsonValue({
        ...definition.metadata,
        firstClassRetailStockPlanner: true,
        seededBy: "seedRetailStockPlannerAgent"
      }))}::jsonb,
      now(),
      now(),
      now()
    )
    on conflict (id)
    do update set
      name = excluded.name,
      agent_type = 'deterministic',
      role = 'retail_agent',
      status = 'active',
      capabilities = excluded.capabilities,
      model = excluded.model,
      metadata = public.agents.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const agentId = agentRows[0]?.id;

  if (!agentId) {
    throw new Error("Retail Stock Planner agent could not be seeded");
  }

  await recordSeedAudit(sql, {
    action: "system.retail_stock_planner_agent_seeded",
    metadata: {
      capabilities,
      systemAgentKey: "retailStockPlanner"
    },
    resourceId: agentId,
    resourceType: "agent"
  });

  const organisations = await sql<Array<{
    id: string;
    name: string;
  }>>`
    select id::text, name
    from public.organisations
    where organisation_type = 'tenant'
      and status = 'active'
    order by lower(name), id
  `;
  const memberships: SeededMembership[] = [];
  const generatedCredentials: SeededMembership[] = [];

  for (const organisation of organisations) {
    const membershipRows = await sql<Array<{ id: string }>>`
      insert into public.organisation_memberships (
        organisation_id,
        principal_type,
        agent_id,
        role,
        status,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${organisation.id}::uuid,
        'agent',
        ${agentId}::uuid,
        'retail_agent',
        'active',
        ${sql.json(toJsonValue({
          seededBy: "seedRetailStockPlannerAgent",
          systemAgentKey: "retailStockPlanner"
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (agent_id, organisation_id)
        where principal_type = 'agent' and status <> 'deleted'
      do update set
        role = 'retail_agent',
        status = 'active',
        metadata = public.organisation_memberships.metadata || excluded.metadata,
        updated_at = now()
      returning id::text
    `;
    const membershipId = membershipRows[0]?.id;

    if (!membershipId) {
      throw new Error(
        `Retail Stock Planner membership could not be seeded for ${organisation.name}`
      );
    }

    await recordSeedAudit(sql, {
      action: "system.retail_stock_planner_membership_seeded",
      metadata: {
        agentId,
        role: "retail_agent"
      },
      organisationId: organisation.id,
      resourceId: membershipId,
      resourceType: "organisation_membership"
    });

    const existingCredential = await activeCredentialForMembership(sql, {
      agentId,
      membershipId
    });
    const generatedCredential = existingCredential
      ? null
      : await generateCredentialForMembership(sql, {
          agentId,
          membershipId,
          organisationId: organisation.id,
          organisationName: organisation.name
        });
    const membership = {
      credentialDisplayPrefix:
        existingCredential?.display_prefix ??
        generatedCredential?.displayPrefix ??
        null,
      credentialId: existingCredential?.id ?? generatedCredential?.id ?? null,
      generatedApiKey: generatedCredential?.apiKey ?? null,
      id: membershipId,
      organisationId: organisation.id,
      organisationName: organisation.name
    } satisfies SeededMembership;

    memberships.push(membership);

    if (membership.generatedApiKey) {
      generatedCredentials.push(membership);
    }
  }

  return {
    agentId,
    generatedCredentials,
    memberships
  };
}
