import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  normalizeCapabilities
} from "@/lib/task-service-utils";
import { notifyTaskQueueChanged } from "@/lib/task-wakeup";
import {
  cleanText,
  intersectCapabilities,
  mapAgent,
  mapWorkerSession,
  optionalText,
  positiveInteger,
  uuidOrNew,
  uuidOrNull,
  workerSessionStatus
} from "@/lib/task-service-mappers";
import type {
  AgentRow,
  AgentStatus,
  AgentType,
  HeartbeatWorkerSessionInput,
  RegisterWorkerSessionInput,
  TaskAgent,
  TaskAgentAccessScope,
  TaskServiceDb,
  WorkerSessionRow
} from "@/lib/task-service-types";

type Db = TaskServiceDb;

const globalTaskServiceAgents = globalThis as typeof globalThis & {
  mattanutraWorkerSessionSchemaReady?: Promise<void>;
};

function getRequiredSql(sql?: postgres.Sql) {
  const configured = sql ?? getSql();

  if (!configured) {
    throw new Error("Database connection is not configured");
  }

  return configured;
}

export async function ensureWorkerSessionSchema(sql?: postgres.Sql) {
  const configured = getRequiredSql(sql);

  globalTaskServiceAgents.mattanutraWorkerSessionSchemaReady ??= (async () => {
    const requiredColumns = {
      task_reservations: ["membership_id", "worker_session_id"],
      worker_sessions: [
        "id",
        "agent_id",
        "membership_id",
        "instance_id",
        "status",
        "capabilities",
        "task_types",
        "concurrency",
        "worker_version",
        "current_task_id",
        "metadata",
        "last_seen_at",
        "created_at",
        "updated_at"
      ]
    } satisfies Record<string, string[]>;
    const rows = await configured<Array<{
      column_name: string;
      table_name: keyof typeof requiredColumns;
    }>>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any(${Object.keys(requiredColumns)}::text[])
    `;
    const available = new Map<string, Set<string>>();

    for (const row of rows) {
      const columns = available.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      available.set(row.table_name, columns);
    }

    const missing = Object.entries(requiredColumns).flatMap(([table, columns]) => {
      const availableColumns = available.get(table) ?? new Set<string>();

      return columns
        .filter((column) => !availableColumns.has(column))
        .map((column) => `public.${table}.${column}`);
    });

    if (missing.length > 0) {
      throw new Error(
        `Worker session schema is incomplete. Apply db-schema.sql with the database owner before starting workers. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    globalTaskServiceAgents.mattanutraWorkerSessionSchemaReady = undefined;
    throw error;
  });

  await globalTaskServiceAgents.mattanutraWorkerSessionSchemaReady;
}

export async function upsertAgentRecord(
  sql: Db,
  input: Readonly<{
    capabilities?: unknown;
    id?: string | null;
    metadata?: Record<string, unknown>;
    model?: string | null;
    name: string;
    status?: AgentStatus;
    type?: AgentType;
  }>
) {
  const name = cleanText(input.name, "Unnamed agent");
  const requestedId = uuidOrNull(input.id);
  const hasCapabilitiesInput = Array.isArray(input.capabilities);
  const capabilities = normalizeCapabilities(input.capabilities);
  const existing = await sql<AgentRow[]>`
    select *
    from public.agents
    where (
        ${requestedId}::uuid is not null
        and id = ${requestedId}::uuid
      )
      or lower(name) = lower(${name})
    order by
      case
        when ${requestedId}::uuid is not null and id = ${requestedId}::uuid
          then 0
        else 1
      end
    limit 1
  `;

  if (existing[0]) {
    const rows = await sql<AgentRow[]>`
      update public.agents set
        agent_type = ${input.type ?? existing[0].agent_type},
        status = ${input.status ?? existing[0].status},
        capabilities = ${hasCapabilitiesInput ? capabilities : existing[0].capabilities},
        model = coalesce(${optionalText(input.model)}, model),
        metadata = metadata || ${sql.json(toJsonValue(input.metadata ?? {}))},
        last_seen_at = now(),
        updated_at = now()
      where id = ${existing[0].id}::uuid
      returning *
    `;

    return mapAgent(rows[0]);
  }

  const rows = await sql<AgentRow[]>`
    insert into public.agents (
      id,
      name,
      agent_type,
      status,
      capabilities,
      model,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${uuidOrNew(input.id)}::uuid,
      ${name},
      ${input.type ?? "system"},
      ${input.status ?? "active"},
      ${capabilities},
      ${optionalText(input.model)},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      now(),
      now(),
      now()
    )
    returning *
  `;

  return mapAgent(rows[0]);
}

async function hideLegacyAggregateWorkerAgent(sql: Db) {
  const legacyRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.agents
    where lower(name) = lower('MattaNutra External Worker')
  `;
  const legacyIds = legacyRows.map((row) => row.id);

  if (legacyIds.length < 1) {
    return;
  }

  await sql`
    update public.worker_sessions set
      status = 'offline',
      current_task_id = null,
      updated_at = now()
    where agent_id = any(${legacyIds}::uuid[])
  `;

  await sql`
    update public.agents set
      status = 'retired',
      metadata = metadata || ${sql.json(
        toJsonValue({
          hiddenFromDashboard: true,
          legacyAggregateRuntime: true
        })
      )},
      updated_at = now()
    where id = any(${legacyIds}::uuid[])
  `;
}

export async function upsertAgent(input: Parameters<typeof upsertAgentRecord>[1]) {
  const sql = getRequiredSql();

  return upsertAgentRecord(sql, input);
}

async function platformOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = 'mattanutra'
      and organisation_type = 'platform'
      and status = 'active'
    limit 1
  `;

  if (!rows[0]?.id) {
    throw new Error("Platform organisation is required for legacy worker access");
  }

  return rows[0].id;
}

async function ensurePlatformMembershipForAgent(
  sql: Db,
  agent: TaskAgent
): Promise<TaskAgentAccessScope> {
  const organisationId = await platformOrganisationId(sql);

  await sql`
    update public.agents
    set
      organisation_id = coalesce(organisation_id, ${organisationId}::uuid),
      role = 'platform_agent',
      updated_at = now()
    where id = ${agent.id}::uuid
  `;

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
      ${agent.id}::uuid,
      'platform_agent',
      'active',
      jsonb_build_object('backfilledAt', now(), 'source', 'legacy_worker_runtime')
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do update set
      role = 'platform_agent',
      status = case
        when public.organisation_memberships.status = 'deleted' then 'deleted'
        else 'active'
      end,
      updated_at = now()
    returning id::text
  `;

  if (!rows[0]?.id) {
    throw new Error("Unable to resolve platform agent membership");
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    capabilities: agent.capabilities,
    membershipId: rows[0].id,
    organisationId,
    role: "platform_agent"
  };
}

async function scopedAgentFromDb(
  sql: Db,
  accessScope: TaskAgentAccessScope
): Promise<TaskAgent> {
  const rows = await sql<AgentRow[]>`
    update public.agents set
      last_seen_at = now(),
      updated_at = now()
    where id = ${accessScope.agentId}::uuid
      and status = 'active'
    returning *
  `;

  if (!rows[0]) {
    throw new Error("Agent is not active");
  }

  return {
    ...mapAgent(rows[0]),
    capabilities: accessScope.capabilities,
    name: accessScope.agentName,
    organisationId: accessScope.organisationId,
    role: accessScope.role
  };
}

export async function registerWorkerSession(input: RegisterWorkerSessionInput) {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);
  await hideLegacyAggregateWorkerAgent(sql);

  const requestedCapabilities = normalizeCapabilities(
    input.capabilities ?? input.agent.capabilities
  );
  const taskTypes = normalizeCapabilities(input.taskTypes);
  const sessionMetadata = input.metadata ?? {};
  let agent: TaskAgent;
  let accessScope: TaskAgentAccessScope;

  if (input.accessScope) {
    accessScope = input.accessScope;
    agent = await scopedAgentFromDb(sql, accessScope);
  } else {
    agent = await upsertAgentRecord(sql, {
      capabilities: requestedCapabilities,
      id: input.agent.id,
      metadata: {
        ...(input.agent.metadata ?? {}),
        externalWorker: true
      },
      model: input.agent.model,
      name: input.agent.name,
      status: "active",
      type: input.agent.type ?? "external"
    });
    accessScope = await ensurePlatformMembershipForAgent(sql, agent);
  }

  const capabilities = requestedCapabilities.length > 0
    ? intersectCapabilities(accessScope.capabilities, requestedCapabilities)
    : accessScope.capabilities;
  const rows = await sql<WorkerSessionRow[]>`
    insert into public.worker_sessions (
      id,
      agent_id,
      membership_id,
      instance_id,
      status,
      capabilities,
      task_types,
      concurrency,
      worker_version,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${accessScope.agentId}::uuid,
      ${accessScope.membershipId}::uuid,
      ${cleanText(input.instanceId, agent.name)},
      'idle',
      ${capabilities},
      ${taskTypes},
      ${positiveInteger(input.concurrency, 1)},
      ${optionalText(input.workerVersion)},
      ${sql.json(toJsonValue(sessionMetadata))},
      now(),
      now(),
      now()
    )
    on conflict (membership_id, instance_id)
    do update set
      status = 'idle',
      agent_id = excluded.agent_id,
      capabilities = excluded.capabilities,
      task_types = excluded.task_types,
      concurrency = excluded.concurrency,
      worker_version = excluded.worker_version,
      metadata = public.worker_sessions.metadata || excluded.metadata,
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;
  const session = mapWorkerSession(rows[0]);

  await sql`
    update public.worker_sessions
    set
      status = 'offline',
      current_task_id = null,
      metadata = metadata || jsonb_build_object(
        'offlineReason', 'superseded_by_worker_registration',
        'supersededBySessionId', ${session.id}::text
      ),
      updated_at = now()
    where agent_id = ${agent.id}::uuid
      and membership_id = ${accessScope.membershipId}::uuid
      and id <> ${session.id}::uuid
      and status <> 'offline'
      and last_seen_at < now() - interval '2 minutes'
  `;

  return {
    agent,
    polling: {
      leaseSeconds: 180,
      waitSeconds: 20
    },
    session
  };
}

export async function heartbeatWorkerSession(input: HeartbeatWorkerSessionInput) {
  const sql = getRequiredSql();
  const workerSessionId = uuidOrNull(input.workerSessionId);
  const agentId = uuidOrNull(input.accessScope?.agentId ?? input.agentId);
  const membershipId = uuidOrNull(input.accessScope?.membershipId);
  const currentTaskId = uuidOrNull(input.currentTaskId);

  await ensureWorkerSessionSchema(sql);

  if (!workerSessionId) {
    throw new Error("Worker heartbeat requires a valid workerSessionId");
  }

  const status = workerSessionStatus(input.status);
  let releasedReservationCount = 0;

  if (status === "offline") {
    releasedReservationCount = await releaseOfflineWorkerReservations(sql, {
      agentId,
      membershipId,
      workerSessionId
    });
  }

  const rows = await sql<WorkerSessionRow[]>`
    update public.worker_sessions set
      status = ${status},
      current_task_id = case
        when ${status} = 'offline' then null
        else ${currentTaskId}::uuid
      end,
      metadata = metadata || ${sql.json(toJsonValue(input.metadata ?? {}))},
      last_seen_at = now(),
      updated_at = now()
    where id = ${workerSessionId}::uuid
      and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
      and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
      and (status <> 'offline' or ${status} = 'offline')
    returning *
  `;

  if (!rows[0]) {
    throw new Error("Worker session not found");
  }

  await sql`
    update public.agents
    set
      last_seen_at = now(),
      updated_at = now()
    where id = ${rows[0].agent_id}::uuid
  `;

  if (releasedReservationCount > 0) {
    notifyTaskQueueChanged();
  }

  return mapWorkerSession(rows[0]);
}

async function releaseOfflineWorkerReservations(
  sql: Db,
  input: Readonly<{
    agentId: string | null;
    membershipId: string | null;
    workerSessionId: string;
  }>
) {
  const rows = await sql<Array<{ released_count: number }>>`
    with active_reservations as (
      select
        task_reservations.id as reservation_id,
        task_reservations.task_id,
        task_reservations.agent_id,
        task_reservations.worker_session_id,
        (tasks.attempts >= tasks.max_attempts) as exhausted
      from public.task_reservations
      join public.tasks
        on tasks.id = task_reservations.task_id
      where task_reservations.worker_session_id = ${input.workerSessionId}::uuid
        and task_reservations.status = 'active'
        and (${input.agentId}::uuid is null or task_reservations.agent_id = ${input.agentId}::uuid)
        and (${input.membershipId}::uuid is null or task_reservations.membership_id = ${input.membershipId}::uuid)
        and tasks.status in ('reserved', 'running')
      for update skip locked
    ),
    released_reservations as (
      update public.task_reservations set
        status = 'released',
        released_at = now(),
        metadata = metadata || jsonb_build_object(
          'releaseReason', 'worker_session_offline',
          'releasedAt', now()
        )
      from active_reservations
      where task_reservations.id = active_reservations.reservation_id
      returning
        active_reservations.reservation_id,
        active_reservations.task_id,
        active_reservations.agent_id,
        active_reservations.worker_session_id,
        active_reservations.exhausted
    ),
    updated_tasks as (
      update public.tasks set
        status = case
          when released_reservations.exhausted then 'failed'
          else 'queued'
        end,
        reserved_by_agent_id = null,
        lease_until = null,
        error_message = case
          when released_reservations.exhausted then 'Task worker session went offline after maximum attempts.'
          else null
        end,
        result_payload = case
          when released_reservations.exhausted then '{}'::jsonb
          else public.tasks.result_payload
        end,
        updated_at = now()
      from released_reservations
      where public.tasks.id = released_reservations.task_id
        and public.tasks.status in ('reserved', 'running')
      returning
        public.tasks.id,
        released_reservations.reservation_id,
        released_reservations.agent_id,
        released_reservations.worker_session_id,
        released_reservations.exhausted
    ),
    task_events as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_tasks.id,
        updated_tasks.agent_id,
        case
          when updated_tasks.exhausted then 'task_failed_after_worker_offline'
          else 'reservation_released'
        end,
        case when updated_tasks.exhausted then 'failed' else 'observed' end,
        case when updated_tasks.exhausted then 'high' else 'medium' end,
        jsonb_build_object(
          'reservationId', updated_tasks.reservation_id,
          'workerSessionId', updated_tasks.worker_session_id,
          'releaseReason', 'worker_session_offline',
          'exhausted', updated_tasks.exhausted
        ),
        now(),
        now()
      from updated_tasks
      returning id
    )
    select count(*)::int as released_count
    from updated_tasks
  `;

  return rows[0]?.released_count ?? 0;
}
