import postgres from "postgres";
import { hashAdminToken } from "@/lib/admin-session-cookie";
import { SYSTEM_AGENTS } from "@/lib/system-agents";
import { RUNTIME_WORKER_CREDENTIAL_PROFILES } from "@/lib/worker-agent-credentials";

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function shouldUseSsl(connection: string) {
  try {
    const url = new URL(connection);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    return (
      url.hostname.endsWith(".db.ondigitalocean.com") ||
      sslMode === "require" ||
      sslMode === "verify-ca" ||
      sslMode === "verify-full"
    );
  } catch {
    return false;
  }
}

const connection = envText("DB_URL");

if (!connection) {
  console.log("[platform] worker credential sync skipped: DB_URL is not configured");
  process.exit(0);
}

const sql = postgres(connection, {
  connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

try {
  let configured = 0;
  let synced = 0;
  const missing: string[] = [];

  for (const profile of RUNTIME_WORKER_CREDENTIAL_PROFILES) {
    const token = envText(profile.envKey);

    if (!token) {
      continue;
    }

    configured += 1;

    const agent = SYSTEM_AGENTS[profile.agentKey];
    const rows = await sql<Array<{ id: string }>>`
      select agent_credentials.id::text
      from public.agent_credentials
      join public.organisation_memberships
        on organisation_memberships.id = agent_credentials.membership_id
        and organisation_memberships.agent_id = agent_credentials.agent_id
        and organisation_memberships.principal_type = 'agent'
      join public.agents
        on agents.id = agent_credentials.agent_id
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where agents.id = ${agent.id}::uuid
        and organisation_memberships.role = ${profile.role}
        and agent_credentials.metadata->>'envKey' = ${profile.envKey}
        and agent_credentials.status = 'active'
        and agent_credentials.revoked_at is null
        and (agent_credentials.expires_at is null or agent_credentials.expires_at > now())
        and agents.status = 'active'
        and organisation_memberships.status = 'active'
        and organisations.status = 'active'
      limit 1
    `;
    const credentialId = rows[0]?.id;

    if (!credentialId) {
      missing.push(profile.envKey);
      continue;
    }

    await sql`
      update public.agent_credentials
      set
        credential_hash = ${hashAdminToken(token)},
        display_prefix = ${token.slice(0, 12)},
        last_used_at = last_used_at,
        metadata = metadata || ${sql.json({
          runtimeCredentialSyncedAt: new Date().toISOString(),
          runtimeCredentialSyncSource: "start-platform",
          runtimeEnvKey: profile.envKey
        })}::jsonb,
        revoked_at = null,
        revoked_by_person_id = null,
        status = 'active',
        updated_at = now()
      where id = ${credentialId}::uuid
    `;
    synced += 1;
  }

  console.log(
    `[platform] worker credential sync configured=${configured} synced=${synced} missing=${missing.length}`
  );

  if (missing.length > 0) {
    console.warn(
      `[platform] worker credential sync missing DB rows for ${missing.join(", ")}`
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
