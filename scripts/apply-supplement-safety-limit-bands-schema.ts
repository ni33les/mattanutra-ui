import postgres from "postgres";
import {
  findReferenceNutrient,
  nutrientMatchesName,
  SUPPLEMENTAL_UL_REFERENCE
} from "@/lib/agentic/catalogue/supplemental-ul-reference";
import { convertAmount } from "@/lib/matcher/dose";
import { parseAdminLimitUnit } from "@/lib/matcher/safety-ceilings";
import type { MatcherUnit } from "@/lib/matcher/types";

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
    "DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply supplement safety limit bands"
  );
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-supplement-safety-bands"
  },
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

function amountIsLooser(
  existingAmount: number,
  existingUnit: string,
  nextAmount: number,
  nextUnit: MatcherUnit,
  supplementId: string
) {
  const existing = parseAdminLimitUnit(existingUnit);

  if (!existing) {
    return true;
  }

  const converted = convertAmount({
    amount: nextAmount,
    fromUnit: nextUnit,
    subjectId: supplementId,
    subjectName: supplementId,
    toUnit: existing
  });

  return converted == null || converted > existingAmount + 1e-9;
}

function amountsEqual(
  existingAmount: number,
  existingUnit: string,
  nextAmount: number,
  nextUnit: MatcherUnit,
  supplementId: string
) {
  const existing = parseAdminLimitUnit(existingUnit);

  if (!existing) {
    return false;
  }

  const converted = convertAmount({
    amount: nextAmount,
    fromUnit: nextUnit,
    subjectId: supplementId,
    subjectName: supplementId,
    toUnit: existing
  });

  return converted != null && Math.abs(converted - existingAmount) <= 1e-9;
}

try {
  const privilegeRows = await sql<Array<SchemaPrivilegeRow>>`
    select
      current_user::text as "currentUser",
      current_database()::text as "currentDatabase",
      to_regclass('public.supplement_safety_limit_bands')::text as "tableName",
      has_schema_privilege(current_user, 'public', 'create') as "canCreatePublic",
      has_table_privilege(current_user, 'public.supplements', 'references') as "canReferenceSupplements",
      (
        select pg_has_role(current_user, class.relowner, 'member')
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_safety_limit_bands'
      ) as "canManageExistingTable",
      (
        select class.relowner::regrole::text
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_safety_limit_bands'
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
        `public.supplement_safety_limit_bands owned by ${privileges.tableOwner ?? "unknown"}. ` +
        "Use DB_SCHEMA_URL or DB_OWNER_URL with the table owner/migration role."
    );
  }

  if (!tableExists) {
    await sql`
      create table public.supplement_safety_limit_bands (
        id uuid primary key,
        supplement_id uuid not null,
        version integer not null default 1,
        life_stage text not null default 'adult',
        source_scope text not null default 'supplemental',
        max_amount numeric(14,4) not null,
        max_unit text not null,
        source_url text,
        basis_rationale text,
        effective_on date,
        created_at timestamptz not null default now(),
        constraint supplement_safety_limit_bands_supplement_id_fkey
          foreign key (supplement_id) references public.supplements(id) on delete restrict,
        constraint supplement_safety_limit_bands_band_version_key
          unique (supplement_id, life_stage, source_scope, version),
        constraint supplement_safety_limit_bands_life_stage_check
          check (life_stage in (
            'child_1_3',
            'child_4_8',
            'child_9_13',
            'adolescent_14_18',
            'adult',
            'pregnant',
            'breastfeeding'
          )),
        constraint supplement_safety_limit_bands_source_scope_check
          check (source_scope in ('supplemental', 'total')),
        constraint supplement_safety_limit_bands_version_check
          check (version > 0)
      )
    `;
  }

  await sql`
    create index if not exists supplement_safety_limit_bands_band_idx
      on public.supplement_safety_limit_bands (supplement_id, life_stage, source_scope, version desc)
  `;

  await sql`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'mn') then
        grant usage on schema public to mn;
        grant select, insert on table public.supplement_safety_limit_bands to mn;
      end if;
    end
    $$;
  `;

  const supplements = await sql<
    Array<{ aliases: string[] | null; id: string; name: string }>
  >`
    select
      supplements.id::text as id,
      supplements.name,
      coalesce(
        (
          select array_agg(supplement_aliases.alias)
          from public.supplement_aliases supplement_aliases
          where supplement_aliases.supplement_id = supplements.id
        ),
        '{}'::text[]
      ) as aliases
    from public.supplements supplements
    where coalesce(supplements.source_payload ->> 'deleted', 'false') <> 'true'
  `;

  let inserted = 0;
  let skipped = 0;

  for (const supplement of supplements) {
    const names = [supplement.name, ...(supplement.aliases ?? [])];
    const nutrient = names
      .map((name) => findReferenceNutrient(name))
      .find((item) => item != null);

    if (!nutrient) {
      continue;
    }

    if (!names.some((name) => nutrientMatchesName(nutrient, name))) {
      continue;
    }

    for (const band of nutrient.bands) {
      const latest = await sql<
        Array<{
          max_amount: string | number | null;
          max_unit: string;
        }>
      >`
        select max_amount, max_unit
        from public.supplement_safety_limit_bands
        where supplement_id = ${supplement.id}::uuid
          and life_stage = ${band.lifeStage}
          and source_scope = ${nutrient.sourceScope}
        order by version desc
        limit 1
      `;
      const previous = latest[0];
      const previousAmount = previous?.max_amount == null
        ? null
        : Number(previous.max_amount);

      if (
        previous &&
        previousAmount != null &&
        Number.isFinite(previousAmount) &&
        amountsEqual(
          previousAmount,
          previous.max_unit,
          band.maxAmount,
          nutrient.unit,
          supplement.id
        )
      ) {
        skipped += 1;
        continue;
      }

      if (
        previous &&
        previousAmount != null &&
        Number.isFinite(previousAmount) &&
        previousAmount > 0 &&
        !amountIsLooser(
          previousAmount,
          previous.max_unit,
          band.maxAmount,
          nutrient.unit,
          supplement.id
        )
      ) {
        skipped += 1;
        continue;
      }

      await sql`
        insert into public.supplement_safety_limit_bands (
          id,
          supplement_id,
          version,
          life_stage,
          source_scope,
          max_amount,
          max_unit,
          source_url,
          basis_rationale,
          effective_on,
          created_at
        )
        select
          gen_random_uuid(),
          ${supplement.id}::uuid,
          coalesce(max(version), 0) + 1,
          ${band.lifeStage},
          ${nutrient.sourceScope},
          ${band.maxAmount},
          ${nutrient.unit},
          ${nutrient.authorityUrl},
          ${`${SUPPLEMENTAL_UL_REFERENCE.authority}; ${nutrient.authorityUrl}`},
          ${SUPPLEMENTAL_UL_REFERENCE.effectiveOn}::date,
          now()
        from public.supplement_safety_limit_bands
        where supplement_id = ${supplement.id}::uuid
          and life_stage = ${band.lifeStage}
          and source_scope = ${nutrient.sourceScope}
      `;
      inserted += 1;
    }
  }

  console.log(
    JSON.stringify({
      database: privileges.currentDatabase,
      inserted,
      ok: true,
      role: privileges.currentUser,
      skipped,
      table: "supplement_safety_limit_bands"
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}
