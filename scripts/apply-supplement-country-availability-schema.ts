import postgres from "postgres";

type SchemaPrivilegeRow = Readonly<{
  canCreatePublic: boolean;
  canManageExistingTable: boolean | null;
  canReferenceSupplements: boolean;
  currentDatabase: string;
  currentUser: string;
  tableName: string | null;
  tableOwner: string | null;
}>;

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
    "DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply supplement country availability schema"
  );
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-supplement-country-schema"
  },
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

try {
  const privilegeRows = await sql<Array<SchemaPrivilegeRow>>`
    select
      current_user::text as "currentUser",
      current_database()::text as "currentDatabase",
      to_regclass('public.supplement_country_availability')::text as "tableName",
      has_schema_privilege(current_user, 'public', 'create') as "canCreatePublic",
      has_table_privilege(current_user, 'public.supplements', 'references') as "canReferenceSupplements",
      (
        select pg_has_role(current_user, class.relowner, 'member')
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_country_availability'
      ) as "canManageExistingTable",
      (
        select class.relowner::regrole::text
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_country_availability'
      ) as "tableOwner"
  `;
  const privileges = privilegeRows[0];
  const tableExists = Boolean(privileges?.tableName);

  if (!privileges?.canReferenceSupplements) {
    throw new Error(
      `Connected role ${privileges?.currentUser ?? "unknown"} on ${
        privileges?.currentDatabase ?? "unknown"
      } cannot reference public.supplements. Use DB_SCHEMA_URL or DB_OWNER_URL for schema migrations.`
    );
  }

  if (!tableExists && !privileges.canCreatePublic) {
    throw new Error(
      `Connected role ${privileges.currentUser} on ${privileges.currentDatabase} cannot create in schema public. ` +
        "Use DB_SCHEMA_URL or DB_OWNER_URL with the database owner/migration role."
    );
  }

  if (tableExists && privileges.canManageExistingTable !== true) {
    throw new Error(
      `Connected role ${privileges.currentUser} on ${privileges.currentDatabase} cannot manage ` +
        `public.supplement_country_availability owned by ${privileges.tableOwner ?? "unknown"}. ` +
        "Use DB_SCHEMA_URL or DB_OWNER_URL with the table owner/migration role."
    );
  }

  if (!tableExists) {
    await sql`
      create table public.supplement_country_availability (
        supplement_id uuid not null,
        country_code text not null,
        status text not null,
        reason text,
        source text not null default 'admin_dashboard',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint supplement_country_availability_pkey
          primary key (supplement_id, country_code),
        constraint supplement_country_availability_country_code_check
          check (country_code ~ '^[A-Z]{2}$'),
        constraint supplement_country_availability_status_check
          check (status in ('allowed', 'blocked'))
      )
    `;
  }

  await sql`
    alter table public.supplement_country_availability
      add column if not exists reason text,
      add column if not exists source text not null default 'admin_dashboard',
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `;

  await sql`
    alter table public.supplement_country_availability
      drop constraint if exists supplement_country_availability_supplement_id_fkey,
      drop constraint if exists supplement_country_availability_country_code_check,
      drop constraint if exists supplement_country_availability_status_check
  `;

  await sql`
    alter table public.supplement_country_availability
      add constraint supplement_country_availability_supplement_id_fkey
        foreign key (supplement_id) references public.supplements(id) on delete cascade,
      add constraint supplement_country_availability_country_code_check
        check (country_code ~ '^[A-Z]{2}$'),
      add constraint supplement_country_availability_status_check
        check (status in ('allowed', 'blocked'))
  `;

  await sql`
    create index if not exists supplement_country_availability_country_idx
      on public.supplement_country_availability (country_code, status, updated_at desc)
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert, update, delete on table
          public.supplement_country_availability
        to mn;
      end if;
    end
    $$;
  `;

  console.log(
    JSON.stringify({
      database: privileges.currentDatabase,
      ok: true,
      role: privileges.currentUser,
      table: "supplement_country_availability"
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}
