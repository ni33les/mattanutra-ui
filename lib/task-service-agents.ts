import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  normalizeCapabilities
} from "@/lib/task-service-utils";
import {
  cleanText,
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
      task_reservations: ["worker_session_id"],
      worker_sessions: [
        "id",
        "agent_id",
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

export async function registerWorkerSession(input: RegisterWorkerSessionInput) {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);
  await hideLegacyAggregateWorkerAgent(sql);

  const capabilities = normalizeCapabilities(
    input.capabilities ?? input.agent.capabilities
  );
  const taskTypes = normalizeCapabilities(input.taskTypes);
  const sessionMetadata = input.metadata ?? {};
  const agent = await upsertAgentRecord(sql, {
    capabilities,
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
  const rows = await sql<WorkerSessionRow[]>`
    insert into public.worker_sessions (
      id,
      agent_id,
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
      ${agent.id}::uuid,
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
    on conflict (agent_id, instance_id)
    do update set
      status = 'idle',
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
  const agentId = uuidOrNull(input.agentId);
  const currentTaskId = uuidOrNull(input.currentTaskId);

  await ensureWorkerSessionSchema(sql);

  if (!workerSessionId) {
    throw new Error("Worker heartbeat requires a valid workerSessionId");
  }

  const status = workerSessionStatus(input.status);
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

  return mapWorkerSession(rows[0]);
}
