import postgres from "postgres";
import { hashAdminToken } from "@/lib/admin-session-cookie";
import { permissionsForAgentRole } from "@/lib/admin-rbac";
import {
  requiredCapabilitiesForWorkTaskType,
  SYSTEM_AGENTS
} from "@/lib/system-agents";
import {
  RUNTIME_WORKER_PROFILES,
  type RuntimeWorkerCredentialProfile
} from "@/lib/worker-agent-credentials";
import {
  hasRequiredCapabilities,
  normalizeCapabilities
} from "@/lib/task-service-utils";

type Db = postgres.Sql;

type DoctorArgs = Readonly<{
  json: boolean;
  repair: boolean;
  requireAll: boolean;
}>;

type WorkerProfileCheck = Readonly<{
  agentName: string;
  envKey: string;
  issues: readonly string[];
  mode: string;
  ok: boolean;
  repaired: boolean;
  requiredCapabilities: readonly string[];
  role: string;
  taskTypes: readonly string[];
}>;

type ProfileRow = Readonly<{
  agent_capabilities: string[] | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_status: string | null;
  credential_expires_at: string | null;
  credential_hash: string | null;
  credential_id: string | null;
  credential_revoked_at: string | null;
  credential_status: string | null;
  membership_id: string | null;
  membership_role: string | null;
  membership_status: string | null;
  organisation_id: string | null;
  organisation_status: string | null;
  organisation_type: string | null;
}>;

function parseArgs(argv: readonly string[]): DoctorArgs {
  const flags = new Set(argv);

  return {
    json: flags.has("--json"),
    repair: flags.has("--repair"),
    requireAll: flags.has("--require-all")
  };
}

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function connectionString() {
  return envText("DB_URL") || envText("UAT_DB_URL") || envText("DEV_DB_URL");
}

function shouldUseSsl(connection: string) {
  const url = new URL(connection);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

function makeSql(connection: string) {
  return postgres(connection, {
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
  });
}

function uniqueTexts(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function requiredCapabilities(profile: RuntimeWorkerCredentialProfile) {
  return uniqueTexts(
    profile.taskTypes.flatMap((taskType) =>
      requiredCapabilitiesForWorkTaskType(taskType)
    )
  );
}

function profileToken(profile: RuntimeWorkerCredentialProfile) {
  return envText(profile.envKey);
}

function profileCredentialHash(profile: RuntimeWorkerCredentialProfile) {
  const token = profileToken(profile);

  return token ? hashAdminToken(token) : "";
}

function credentialExpired(value: string | null) {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

async function loadProfileRow(
  sql: Db,
  profile: RuntimeWorkerCredentialProfile
) {
  const definition = SYSTEM_AGENTS[profile.agentKey];
  const rows = await sql<ProfileRow[]>`
    select
      agents.id::text as agent_id,
      agents.name as agent_name,
      agents.status as agent_status,
      agents.capabilities as agent_capabilities,
      organisation_memberships.id::text as membership_id,
      organisation_memberships.role as membership_role,
      organisation_memberships.status as membership_status,
      organisations.id::text as organisation_id,
      organisations.organisation_type,
      organisations.status as organisation_status,
      agent_credentials.id::text as credential_id,
      agent_credentials.credential_hash,
      agent_credentials.status as credential_status,
      agent_credentials.revoked_at::text as credential_revoked_at,
      agent_credentials.expires_at::text as credential_expires_at
    from public.agents
    left join public.organisation_memberships
      on organisation_memberships.agent_id = agents.id
      and organisation_memberships.principal_type = 'agent'
      and organisation_memberships.role = ${profile.role}
    left join public.organisations
      on organisations.id = organisation_memberships.organisation_id
    left join public.agent_credentials
      on agent_credentials.agent_id = agents.id
      and agent_credentials.membership_id = organisation_memberships.id
      and agent_credentials.metadata->>'envKey' = ${profile.envKey}
    where agents.id = ${definition.id}::uuid
    order by
      case when organisation_memberships.status = 'active' then 0 else 1 end,
      case when agent_credentials.status = 'active' then 0 else 1 end,
      agent_credentials.created_at desc nulls last
    limit 1
  `;

  return rows[0] ?? null;
}

async function repairCredentialHash(
  sql: Db,
  input: Readonly<{
    credentialId: string;
    credentialHash: string;
    envKey: string;
    token: string;
  }>
) {
  await sql`
    update public.agent_credentials
    set
      credential_hash = ${input.credentialHash},
      display_prefix = ${input.token.slice(0, 12)},
      last_used_at = null,
      metadata = metadata || ${sql.json({
        envKey: input.envKey,
        repairedAt: new Date().toISOString(),
        repairSource: "workers-doctor"
      })}::jsonb,
      updated_at = now()
    where id = ${input.credentialId}::uuid
  `;
}

async function checkProfile(
  sql: Db,
  profile: RuntimeWorkerCredentialProfile,
  args: DoctorArgs
): Promise<WorkerProfileCheck> {
  const definition = SYSTEM_AGENTS[profile.agentKey];
  const token = profileToken(profile);
  const expectedHash = profileCredentialHash(profile);
  const row = await loadProfileRow(sql, profile);
  const required = requiredCapabilities(profile);
  const issues: string[] = [];
  let repaired = false;

  if (!token) {
    issues.push("missing_env_key");
  }

  if (!row?.agent_id) {
    issues.push("missing_agent");
  } else if (row.agent_status !== "active") {
    issues.push("inactive_agent");
  }

  if (!row?.membership_id) {
    issues.push("missing_membership");
  } else {
    if (row.membership_role !== profile.role) {
      issues.push("role_mismatch");
    }

    if (row.membership_status !== "active") {
      issues.push("inactive_membership");
    }
  }

  if (!row?.organisation_id) {
    issues.push("missing_organisation");
  } else {
    const expectedOrganisationType =
      profile.role === "platform_agent" ? "platform" : "tenant";

    if (row.organisation_type !== expectedOrganisationType) {
      issues.push("organisation_type_mismatch");
    }

    if (row.organisation_status !== "active") {
      issues.push("inactive_organisation");
    }
  }

  if (!row?.credential_id) {
    issues.push("missing_credential");
  } else {
    if (row.credential_status !== "active") {
      issues.push("inactive_credential");
    }

    if (row.credential_revoked_at) {
      issues.push("revoked_credential");
    }

    if (credentialExpired(row.credential_expires_at)) {
      issues.push("expired_credential");
    }

    if (expectedHash && row.credential_hash !== expectedHash) {
      if (
        args.repair &&
        row.credential_status === "active" &&
        !row.credential_revoked_at &&
        !credentialExpired(row.credential_expires_at)
      ) {
        await repairCredentialHash(sql, {
          credentialHash: expectedHash,
          credentialId: row.credential_id,
          envKey: profile.envKey,
          token
        });
        repaired = true;
      } else {
        issues.push("credential_hash_mismatch");
      }
    }
  }

  const agentPermissions = permissionsForAgentRole(profile.role) as readonly string[];

  if (!agentPermissions.includes("tasks.write")) {
    issues.push("missing_tasks_write_permission");
  }

  if (
    !hasRequiredCapabilities(
      required,
      normalizeCapabilities(row?.agent_capabilities ?? [])
    )
  ) {
    issues.push("missing_required_capability");
  }

  if (repaired) {
    const repairedRow = await loadProfileRow(sql, profile);

    if (repairedRow?.credential_hash !== expectedHash) {
      issues.push("credential_repair_failed");
    }
  }

  return {
    agentName: row?.agent_name ?? definition.name,
    envKey: profile.envKey,
    issues,
    mode: profile.mode,
    ok: issues.length === 0,
    repaired,
    requiredCapabilities: required,
    role: profile.role,
    taskTypes: profile.taskTypes
  };
}

function printTextReport(checks: readonly WorkerProfileCheck[]) {
  for (const check of checks) {
    const prefix = check.ok ? "[ok]" : "[fail]";
    const repairText = check.repaired ? " repaired=true" : "";
    const issueText = check.ok ? "" : ` issues=${check.issues.join(",")}`;

    console.log(
      `${prefix} ${check.mode} ${check.agentName} env=${check.envKey} role=${check.role}${repairText}${issueText}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connection = connectionString();

  if (!connection) {
    const payload = {
      error: "DB_URL is required",
      ok: false
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error("[workers:doctor] DB_URL is required");
    }

    process.exitCode = 1;
    return;
  }

  const sql = makeSql(connection);

  try {
    const checks: WorkerProfileCheck[] = [];

    for (const profile of RUNTIME_WORKER_PROFILES) {
      checks.push(await checkProfile(sql, profile, args));
    }

    const failures = checks.filter((check) => !check.ok);
    const payload = {
      checkedAt: new Date().toISOString(),
      failureCount: failures.length,
      ok: failures.length === 0,
      profiles: checks,
      repairMode: args.repair
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printTextReport(checks);
      console.log(
        `[workers:doctor] ${payload.ok ? "pass" : "fail"} profiles=${checks.length} failures=${failures.length}`
      );
    }

    if (args.requireAll && failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
