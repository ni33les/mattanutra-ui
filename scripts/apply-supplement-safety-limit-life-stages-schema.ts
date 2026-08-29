import postgres from "postgres";
import {
  findReferenceNutrient,
  nutrientMatchesName,
  SUPPLEMENTAL_UL_REFERENCE
} from "@/lib/agentic/catalogue/supplemental-ul-reference";
import { convertAmount } from "@/lib/matcher/dose";
import { parseAdminLimitUnit } from "@/lib/matcher/safety-ceilings";
import type { MatcherUnit } from "@/lib/matcher/types";
import {
  MATCHER_SOURCE_SCOPE,
  SAFETY_LIMIT_LIFE_STAGES,
  SAFETY_SOURCE_SCOPES
} from "@/lib/matcher/types";

type SchemaPrivilegeRow = Readonly<{
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
    "DB_SCHEMA_URL, DB_OWNER_URL, or DB_URL is required to apply supplement safety life-stage columns"
  );
}

const sql = postgres(connection, {
  connection: {
    application_name:
      process.env.DB_APPLICATION_NAME ?? "mattanutra-supplement-safety-life-stages"
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

async function latestLimit(
  supplementId: string,
  lifeStage: string,
  sourceScope: string
) {
  const rows = await sql<
    Array<{
      confidence: string | null;
      max_amount: string | number | null;
      max_unit: string;
      safety_flags: string[] | null;
      safety_notes: string | null;
    }>
  >`
    select max_amount, max_unit, confidence, safety_flags, safety_notes
    from public.supplement_safety_limits
    where supplement_id = ${supplementId}::uuid
      and life_stage = ${lifeStage}
      and source_scope = ${sourceScope}
    order by version desc
    limit 1
  `;

  return rows[0] ?? null;
}

async function insertBand(input: Readonly<{
  basisRationale: string | null;
  confidence: string;
  lifeStage: string;
  maxAmount: number;
  maxUnit: string;
  safetyFlags: readonly string[];
  safetyNotes: string | null;
  sourceScope: string;
  sourceUrl: string | null;
  supplementId: string;
}>) {
  await sql`
    insert into public.supplement_safety_limits (
      id,
      supplement_id,
      version,
      life_stage,
      source_scope,
      max_amount,
      max_unit,
      confidence,
      safety_flags,
      safety_notes,
      source_url,
      basis_rationale,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      ${input.supplementId}::uuid,
      coalesce(max(version), 0) + 1,
      ${input.lifeStage},
      ${input.sourceScope},
      ${input.maxAmount},
      ${input.maxUnit},
      ${input.confidence},
      ${[...input.safetyFlags]},
      ${input.safetyNotes},
      ${input.sourceUrl},
      ${input.basisRationale},
      now(),
      now()
    from public.supplement_safety_limits
    where supplement_id = ${input.supplementId}::uuid
      and life_stage = ${input.lifeStage}
      and source_scope = ${input.sourceScope}
  `;
}

try {
  const privilegeRows = await sql<Array<SchemaPrivilegeRow>>`
    select
      current_user::text as "currentUser",
      current_database()::text as "currentDatabase",
      to_regclass('public.supplement_safety_limits')::text as "tableName",
      has_table_privilege(current_user, 'public.supplements', 'references') as "canReferenceSupplements",
      (
        select pg_has_role(current_user, class.relowner, 'member')
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_safety_limits'
      ) as "canManageExistingTable",
      (
        select class.relowner::regrole::text
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname = 'supplement_safety_limits'
      ) as "tableOwner"
  `;
  const privileges = privilegeRows[0];

  if (!privileges?.tableName) {
    throw new Error("public.supplement_safety_limits does not exist.");
  }

  if (!privileges.canReferenceSupplements) {
    throw new Error(
      `Connected role ${privileges.currentUser} on ${privileges.currentDatabase} cannot reference public.supplements.`
    );
  }

  if (privileges.canManageExistingTable !== true) {
    throw new Error(
      `Connected role ${privileges.currentUser} on ${privileges.currentDatabase} cannot manage ` +
        `public.supplement_safety_limits owned by ${privileges.tableOwner ?? "unknown"}. ` +
        "Use DB_SCHEMA_URL or DB_OWNER_URL with the table owner/migration role."
    );
  }

  await sql`
    alter table public.supplement_safety_limits
      add column if not exists life_stage text not null default 'adult',
      add column if not exists source_scope text not null default 'supplemental'
  `;

  await sql`
    alter table public.supplement_safety_limits
      drop constraint if exists supplement_safety_limits_life_stage_check,
      drop constraint if exists supplement_safety_limits_source_scope_check
  `;

  await sql`
    alter table public.supplement_safety_limits
      add constraint supplement_safety_limits_life_stage_check
        check (life_stage in (
          'child_1_3',
          'child_4_8',
          'child_9_13',
          'adolescent_14_18',
          'adult',
          'pregnant',
          'breastfeeding'
        )),
      add constraint supplement_safety_limits_source_scope_check
        check (source_scope in ('supplemental', 'total'))
  `;

  await sql`
    alter table public.supplement_safety_limits
      drop constraint if exists supplement_safety_limits_supplement_id_version_key
  `;

  await sql`
    alter table public.supplement_safety_limits
      drop constraint if exists supplement_safety_limits_band_version_key
  `;

  await sql`
    alter table public.supplement_safety_limits
      add constraint supplement_safety_limits_band_version_key
        unique (supplement_id, life_stage, source_scope, version)
  `;

  await sql`
    create index if not exists supplement_safety_limits_band_idx
      on public.supplement_safety_limits (supplement_id, life_stage, source_scope, version desc)
  `;

  let copied = 0;
  let seeded = 0;
  let skipped = 0;

  const bandsTable = await sql<Array<{ tableName: string | null }>>`
    select to_regclass('public.supplement_safety_limit_bands')::text as "tableName"
  `;

  if (bandsTable[0]?.tableName) {
    const bandRows = await sql<
      Array<{
        life_stage: string;
        max_amount: string | number;
        max_unit: string;
        source_scope: string;
        source_url: string | null;
        basis_rationale: string | null;
        supplement_id: string;
      }>
    >`
      select distinct on (bands.supplement_id, bands.life_stage, bands.source_scope)
        bands.supplement_id::text as supplement_id,
        bands.life_stage,
        bands.source_scope,
        bands.max_amount,
        bands.max_unit,
        bands.source_url,
        bands.basis_rationale
      from public.supplement_safety_limit_bands bands
      where bands.max_amount is not null
        and bands.max_amount > 0
      order by
        bands.supplement_id,
        bands.life_stage,
        bands.source_scope,
        bands.version desc
    `;

    for (const band of bandRows) {
      const amount = Number(band.max_amount);
      const unit = parseAdminLimitUnit(band.max_unit);

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !unit ||
        !(SAFETY_LIMIT_LIFE_STAGES as readonly string[]).includes(band.life_stage) ||
        !(SAFETY_SOURCE_SCOPES as readonly string[]).includes(band.source_scope)
      ) {
        skipped += 1;
        continue;
      }

      const existing = await latestLimit(
        band.supplement_id,
        band.life_stage,
        band.source_scope
      );
      const existingAmount = existing?.max_amount == null
        ? null
        : Number(existing.max_amount);

      if (
        existing &&
        existingAmount != null &&
        Number.isFinite(existingAmount) &&
        amountsEqual(
          existingAmount,
          existing.max_unit,
          amount,
          unit,
          band.supplement_id
        )
      ) {
        skipped += 1;
        continue;
      }

      if (
        existing &&
        existingAmount != null &&
        Number.isFinite(existingAmount) &&
        existingAmount > 0 &&
        amountIsLooser(
          existingAmount,
          existing.max_unit,
          amount,
          unit,
          band.supplement_id
        )
      ) {
        skipped += 1;
        continue;
      }

      const adult = await latestLimit(
        band.supplement_id,
        "adult",
        MATCHER_SOURCE_SCOPE
      );

      await insertBand({
        basisRationale: band.basis_rationale,
        confidence: adult?.confidence ?? existing?.confidence ?? "high",
        lifeStage: band.life_stage,
        maxAmount: amount,
        maxUnit: band.max_unit,
        safetyFlags: adult?.safety_flags ?? existing?.safety_flags ?? [],
        safetyNotes: adult?.safety_notes ?? existing?.safety_notes ?? null,
        sourceScope: band.source_scope,
        sourceUrl: band.source_url,
        supplementId: band.supplement_id
      });
      copied += 1;
    }
  }

  const supplements = await sql<
    Array<{ aliases: string[] | null; id: string; name: string }>
  >`
    select
      supplements.id::text as id,
      supplements.name,
      coalesce(
        (
          select array_agg(supplement_aliases.alias)
          from public.supplement_aliases
          where supplement_aliases.supplement_id = supplements.id
        ),
        '{}'::text[]
      ) as aliases
    from public.supplements supplements
    where coalesce(supplements.source_payload ->> 'deleted', 'false') <> 'true'
  `;

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

    const adult = await latestLimit(supplement.id, "adult", nutrient.sourceScope);

    for (const band of nutrient.bands) {
      const existing = await latestLimit(
        supplement.id,
        band.lifeStage,
        nutrient.sourceScope
      );
      const existingAmount = existing?.max_amount == null
        ? null
        : Number(existing.max_amount);

      if (
        existing &&
        existingAmount != null &&
        Number.isFinite(existingAmount) &&
        amountsEqual(
          existingAmount,
          existing.max_unit,
          band.maxAmount,
          nutrient.unit,
          supplement.id
        )
      ) {
        skipped += 1;
        continue;
      }

      if (
        existing &&
        existingAmount != null &&
        Number.isFinite(existingAmount) &&
        existingAmount > 0 &&
        amountIsLooser(
          existingAmount,
          existing.max_unit,
          band.maxAmount,
          nutrient.unit,
          supplement.id
        )
      ) {
        skipped += 1;
        continue;
      }

      await insertBand({
        basisRationale: `${SUPPLEMENTAL_UL_REFERENCE.authority}; ${nutrient.authorityUrl}`,
        confidence: adult?.confidence ?? existing?.confidence ?? "high",
        lifeStage: band.lifeStage,
        maxAmount: band.maxAmount,
        maxUnit: nutrient.unit,
        safetyFlags: adult?.safety_flags ?? existing?.safety_flags ?? [],
        safetyNotes: adult?.safety_notes ?? existing?.safety_notes ?? null,
        sourceScope: nutrient.sourceScope,
        sourceUrl: nutrient.authorityUrl,
        supplementId: supplement.id
      });
      seeded += 1;
    }
  }

  console.log(
    JSON.stringify({
      copied,
      database: privileges.currentDatabase,
      ok: true,
      role: privileges.currentUser,
      seeded,
      skipped,
      table: "supplement_safety_limits"
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}
