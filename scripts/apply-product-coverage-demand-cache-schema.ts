import postgres from "postgres";

function connectionString() {
  return (
    process.env.DB_SCHEMA_URL?.trim() ||
    process.env.DB_OWNER_URL?.trim() ||
    process.env.DB_URL?.trim() ||
    ""
  );
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

const connection = connectionString();

if (!connection) {
  throw new Error(
    "DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply product coverage demand cache schema"
  );
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ??
      "mattanutra-product-coverage-demand-cache-schema"
  },
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

try {
  await sql`
    create table if not exists public.admin_product_coverage_demand_profile_cache (
      id uuid primary key default gen_random_uuid(),
      questionnaire_key text not null,
      demand_key text not null,
      sample_index integer not null check (sample_index >= 0 and sample_index < 256),
      country_code text not null,
      seed text not null,
      archetype_id text not null,
      archetype_name text not null,
      answers jsonb null,
      needs jsonb null,
      profile jsonb null,
      status text not null default 'ready'
        check (status in ('generating', 'ready', 'failed')),
      error_message text null,
      cache_metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (demand_key, sample_index)
    )
  `;

  await sql`
    create index if not exists admin_product_coverage_demand_profile_questionnaire_idx
      on public.admin_product_coverage_demand_profile_cache (
        questionnaire_key,
        sample_index
      )
  `;

  await sql`
    create index if not exists admin_product_coverage_demand_profile_ready_idx
      on public.admin_product_coverage_demand_profile_cache (
        demand_key,
        status,
        sample_index
      )
  `;

  console.log(
    JSON.stringify({
      ok: true,
      schema: "product-coverage-demand-cache",
      table: "admin_product_coverage_demand_profile_cache"
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}
