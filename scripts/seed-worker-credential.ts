import postgres from "postgres";

import { hashAdminToken } from "@/lib/admin-session-cookie";
import {
  assertPrdApplyConfirmation,
  assertPrdDatabaseTarget,
  assertPrdRuntimeEnvironment
} from "@/lib/prd-rollout-safety";
import { SYSTEM_AGENTS } from "@/lib/system-agents";
import {
  runtimeWorkerProfileForMode,
  type RuntimeWorkerCredentialProfile,
  type WorkerProfileMode
} from "@/lib/worker-agent-credentials";

type Db = postgres.Sql | postgres.TransactionSql;

type OrganisationRow = Readonly<{
  id: string;
  slug: string;
}>;

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[workers:seed-credential] ${message}`);
}

function connectionString() {
  const explicit = argValue("db-url");

  return explicit || envText("PRD_DB_URL") || envText("DB_URL") || null;
}

function profileModeFromArgs() {
  return argValue("profile") ?? argValue("mode");
}

function profileFromArgs() {
  const mode = profileModeFromArgs();

  if (!mode) {
    fail("--profile=<worker-profile> is required, for example --profile=analytics.");
  }

  const profile = runtimeWorkerProfileForMode(mode as WorkerProfileMode);

  if (!profile) {
    fail(`Unknown worker profile "${mode}".`);
  }

  return profile;
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

async function platformOrganisation(sql: Db) {
  const rows = await sql<OrganisationRow[]>`
    select id::text, slug
    from public.organisations
    where organisation_type = 'platform'
      and status = 'active'
    order by case when slug = 'mattanutra' then 0 else 1 end, created_at asc
    limit 1
  `;

  return rows[0] ?? null;
}

async function retailOrganisation(sql: Db, slug: string | null) {
  if (!slug?.trim()) {
    fail("--organisation-slug=<slug> is required for retail worker profiles.");
  }

  const rows = await sql<OrganisationRow[]>`
    select id::text, slug
    from public.organisations
    where organisation_type = 'tenant'
      and status = 'active'
      and slug = ${slug}
    limit 1
  `;

  return rows[0] ?? null;
}

async function organisationForProfile(sql: Db, profile: RuntimeWorkerCredentialProfile) {
  const organisation =
    profile.role === "platform_agent"
      ? await platformOrganisation(sql)
      : await retailOrganisation(sql, argValue("organisation-slug"));

  if (!organisation) {
    fail(`Could not find an active ${profile.role === "platform_agent" ? "platform" : "retail"} organisation.`);
  }

  return organisation;
}

async function assertCredentialTokenUnusedByAnotherProfile(
  sql: Db,
  input: Readonly<{
    credentialHash: string;
    profile: RuntimeWorkerCredentialProfile;
  }>
) {
  const definition = SYSTEM_AGENTS[input.profile.agentKey];
  const rows = await sql<Array<{
    agent_id: string;
    env_key: string | null;
    id: string;
  }>>`
    select
      id::text,
      agent_id::text,
      metadata->>'envKey' as env_key
    from public.agent_credentials
    where credential_hash = ${input.credentialHash}
    limit 1
  `;
  const row = rows[0];

  if (
    row &&
    (row.agent_id !== definition.id || row.env_key !== input.profile.envKey)
  ) {
    fail(
      `The supplied token already belongs to credential ${row.id} (${row.env_key ?? "unknown env"}).`
    );
  }
}

async function seedWorkerCredential(
  sql: Db,
  input: Readonly<{
    organisation: OrganisationRow;
    profile: RuntimeWorkerCredentialProfile;
    token: string;
  }>
) {
  const definition = SYSTEM_AGENTS[input.profile.agentKey];
  const credentialHash = hashAdminToken(input.token);
  const metadata = {
    envKey: input.profile.envKey,
    seedSource: "workers:seed-credential",
    seededAt: new Date().toISOString(),
    workerProfile: input.profile.mode
  };

  await assertCredentialTokenUnusedByAnotherProfile(sql, {
    credentialHash,
    profile: input.profile
  });

  await sql`
    insert into public.agents (
      id,
      name,
      agent_type,
      role,
      status,
      capabilities,
      model,
      organisation_id,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${definition.id}::uuid,
      ${definition.name},
      ${definition.type},
      ${input.profile.role},
      'active',
      ${[...definition.capabilities]},
      ${definition.model},
      ${input.organisation.id}::uuid,
      ${sql.json({
        ...definition.metadata,
        seededBy: "workers:seed-credential",
        systemAgentKey: input.profile.agentKey
      })}::jsonb,
      now(),
      now(),
      now()
    )
    on conflict (id)
    do update set
      name = excluded.name,
      agent_type = excluded.agent_type,
      role = excluded.role,
      status = 'active',
      capabilities = excluded.capabilities,
      model = excluded.model,
      organisation_id = excluded.organisation_id,
      metadata = public.agents.metadata || excluded.metadata,
      updated_at = now()
  `;

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
      ${input.organisation.id}::uuid,
      'agent',
      ${definition.id}::uuid,
      ${input.profile.role},
      'active',
      ${sql.json(metadata)}::jsonb,
      now(),
      now()
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do update set
      role = excluded.role,
      status = 'active',
      metadata = public.organisation_memberships.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const membershipId = membershipRows[0]?.id;

  if (!membershipId) {
    fail(`Could not ensure membership for ${definition.name}.`);
  }

  const revokedRows = await sql<Array<{ id: string }>>`
    update public.agent_credentials
    set
      status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      metadata = metadata || ${sql.json({
        replacedEnvKey: input.profile.envKey,
        revokedBy: "workers:seed-credential",
        revokedForWorkerProfile: input.profile.mode
      })}::jsonb,
      updated_at = now()
    where agent_id = ${definition.id}::uuid
      and metadata->>'envKey' = ${input.profile.envKey}
      and credential_hash <> ${credentialHash}
      and status = 'active'
    returning id::text
  `;

  const credentialRows = await sql<Array<{
    id: string;
    status: string;
  }>>`
    insert into public.agent_credentials (
      agent_id,
      membership_id,
      credential_hash,
      display_prefix,
      label,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${definition.id}::uuid,
      ${membershipId}::uuid,
      ${credentialHash},
      ${input.token.slice(0, 12)},
      ${`${definition.name} - ${input.profile.mode}`},
      'active',
      ${sql.json(metadata)}::jsonb,
      now(),
      now()
    )
    on conflict (credential_hash)
    do update set
      agent_id = excluded.agent_id,
      membership_id = excluded.membership_id,
      display_prefix = excluded.display_prefix,
      label = excluded.label,
      status = 'active',
      revoked_at = null,
      revoked_by_person_id = null,
      metadata = public.agent_credentials.metadata || excluded.metadata,
      updated_at = now()
    returning id::text, status
  `;
  const credential = credentialRows[0];

  if (!credential) {
    fail(`Could not seed credential for ${definition.name}.`);
  }

  return {
    agentId: definition.id,
    agentName: definition.name,
    credentialId: credential.id,
    envKey: input.profile.envKey,
    membershipId,
    organisationId: input.organisation.id,
    organisationSlug: input.organisation.slug,
    profile: input.profile.mode,
    revokedCredentialCount: revokedRows.length
  };
}

async function main() {
  const profile = profileFromArgs();
  const connection = connectionString();
  const token = envText(profile.envKey);

  assertPrdRuntimeEnvironment();
  assertPrdDatabaseTarget(connection, "PRD_DB_URL/DB_URL");
  assertPrdApplyConfirmation({
    envName: "MATTANUTRA_CONFIRM_PRD_WORKER_CREDENTIAL",
    expected: "seed-worker",
    label: "PRD worker credential"
  });

  if (!token) {
    fail(`${profile.envKey} is required.`);
  }

  const sql = makeSql(connection!);

  try {
    const result = await sql.begin(async (transaction) => {
      const organisation = await organisationForProfile(transaction, profile);

      return seedWorkerCredential(transaction, {
        organisation,
        profile,
        token
      });
    });

    console.log(JSON.stringify({
      ...result,
      status: "ok"
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
