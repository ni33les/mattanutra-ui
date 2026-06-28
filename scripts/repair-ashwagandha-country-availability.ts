import { randomUUID } from "node:crypto";
import { closeSqlPool, getSql } from "@/lib/db";
import { productIdsUsingSupplement, refreshAndPersistProductValidations } from "@/lib/admin-product-writes";

const dryRun = !process.argv.includes("--apply");
const sql = (() => {
  const db = getSql();

  if (!db) {
    throw new Error("DB_URL is required to repair Ashwagandha country availability");
  }

  return db;
})();

type SupplementRow = Readonly<{
  id: string;
  name: string;
  normalized_name: string;
}>;

async function loadAshwagandhaSupplement() {
  const rows = await sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name
    from public.supplements
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    where supplements.normalized_name in ('ashwagandha', 'ashwaganda')
      or supplement_aliases.normalized_alias in ('ashwagandha', 'ashwaganda')
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name
    order by
      (supplements.normalized_name = 'ashwagandha') desc,
      supplements.name asc
    limit 2
  `;

  if (rows.length < 1) {
    throw new Error("No Ashwagandha supplement found");
  }

  if (rows.length > 1) {
    console.warn("Multiple Ashwagandha-like supplements found; using the first", rows);
  }

  return rows[0]!;
}

async function aliasExists(normalizedAlias: string) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.supplement_aliases
    where normalized_alias = ${normalizedAlias}
    limit 1
  `;

  return Boolean(rows[0]);
}

async function main() {
  const supplement = await loadAshwagandhaSupplement();
  const orphanedProductIds = await productIdsUsingSupplement(sql, supplement.id);
  const missingAliases = [] as Array<{ alias: string; normalizedAlias: string }>;

  for (const alias of [
    { alias: "Ashwagandha", normalizedAlias: "ashwagandha" },
    { alias: "Ashwaganda", normalizedAlias: "ashwaganda" }
  ]) {
    if (!(await aliasExists(alias.normalizedAlias))) {
      missingAliases.push(alias);
    }
  }

  const report = {
    apply: !dryRun,
    countryRules: [
      {
        countryCode: "TH",
        reason: "Blocked for Thailand catalogue matching; allowed only by explicit country override.",
        status: "blocked"
      },
      {
        countryCode: "GB",
        reason: "Allowed for United Kingdom catalogue matching.",
        status: "allowed"
      }
    ],
    missingAliases,
    productValidationRefreshCount: orphanedProductIds.length,
    supplement
  };

  console.log(JSON.stringify(report, null, 2));

  if (dryRun) {
    console.log("Dry run only. Re-run with --apply to write changes.");
    return;
  }

  for (const alias of missingAliases) {
    await sql`
      insert into public.supplement_aliases (
        id,
        supplement_id,
        alias,
        normalized_alias,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${supplement.id}::uuid,
        ${alias.alias},
        ${alias.normalizedAlias},
        now()
      )
      on conflict (normalized_alias) do update set
        supplement_id = excluded.supplement_id,
        alias = excluded.alias
    `;
  }

  await sql`
    update public.supplements
    set
      source_payload = jsonb_set(
        coalesce(source_payload, '{}'::jsonb),
        '{countryAvailability}',
        ${sql.json(report.countryRules.map((rule) => ({
          ...rule,
          source: "ashwagandha_country_repair",
          updatedAt: new Date().toISOString()
        })))}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${supplement.id}::uuid
  `;

  await refreshAndPersistProductValidations(sql, orphanedProductIds);
}

try {
  await main();
} finally {
  await closeSqlPool();
}
