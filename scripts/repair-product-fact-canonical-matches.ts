import { toJsonValue } from "@/lib/assessment-store";
import { closeSqlPool, getSql } from "@/lib/db";
import { refreshAndPersistProductValidations } from "@/lib/admin-product-writes";

type CandidateRow = Readonly<{
  fact_id: string;
  fact_name: string;
  normalized_name: string;
  product_id: string;
  product_title: string;
  supplement_id: string;
  supplement_name: string;
}>;

type SummaryRow = Readonly<{
  fact_count: string | number;
  product_count: string | number;
  supplement_name: string;
}>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function positiveIntegerOrNull(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

const dryRun = process.argv.includes("--dry-run");
const productId = argValue("product-id");
const limit = positiveIntegerOrNull(argValue("limit"));
const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to repair product fact canonical matches");
}

const productFilter = productId
  ? sql`and product_facts.product_id = ${productId}::uuid`
  : sql``;
const limitFilter = limit ? sql`limit ${limit}` : sql``;

try {
  const candidateRows = await sql<CandidateRow[]>`
    with matched_supplements as (
      select
        product_facts.id::text as fact_id,
        product_facts.product_id::text as product_id,
        products.title as product_title,
        product_facts.name as fact_name,
        product_facts.normalized_name,
        supplements.id::text as supplement_id,
        supplements.name as supplement_name
      from public.product_facts
      join public.products
        on products.id = product_facts.product_id
      join public.supplements
        on product_facts.item_type = 'supplement'
      left join public.supplement_aliases
        on supplement_aliases.supplement_id = supplements.id
      where product_facts.supplement_id is null
        and product_facts.normalized_name is not null
        and product_facts.normalized_name <> ''
        and coalesce(supplements.list_status, 'active') <> 'ignored'
        and (
          supplements.normalized_name = product_facts.normalized_name
          or supplement_aliases.normalized_alias = product_facts.normalized_name
        )
        ${productFilter}
      group by
        product_facts.id,
        product_facts.product_id,
        products.title,
        product_facts.name,
        product_facts.normalized_name,
        supplements.id,
        supplements.name
    ),
    unambiguous_matches as (
      select
        matched_supplements.*,
        count(*) over (partition by fact_id) as match_count
      from matched_supplements
    )
    select
      fact_id,
      product_id,
      product_title,
      fact_name,
      normalized_name,
      supplement_id,
      supplement_name
    from unambiguous_matches
    where match_count = 1
    order by product_title asc, fact_name asc
    ${limitFilter}
  `;

  const summary = candidateRows.reduce((counts, row) => {
    const current = counts.get(row.supplement_name) ?? {
      factCount: 0,
      productIds: new Set<string>()
    };

    current.factCount += 1;
    current.productIds.add(row.product_id);
    counts.set(row.supplement_name, current);

    return counts;
  }, new Map<string, { factCount: number; productIds: Set<string> }>());
  const summaryRows: SummaryRow[] = [...summary.entries()]
    .map(([supplementName, value]) => ({
      fact_count: value.factCount,
      product_count: value.productIds.size,
      supplement_name: supplementName
    }))
    .sort((left, right) =>
      Number(right.fact_count) - Number(left.fact_count) ||
      left.supplement_name.localeCompare(right.supplement_name)
    );
  const productIds = [...new Set(candidateRows.map((row) => row.product_id))];

  if (dryRun || candidateRows.length < 1) {
    console.log(JSON.stringify({
      dryRun,
      matchedFactCount: candidateRows.length,
      matchedProductCount: productIds.length,
      sample: candidateRows.slice(0, 20),
      summary: summaryRows
    }, null, 2));
  } else {
    const payload = candidateRows.map((row) => ({
      factId: row.fact_id,
      supplementId: row.supplement_id,
      supplementName: row.supplement_name
    }));

    await sql`
      with input_rows as (
        select *
        from jsonb_to_recordset(${sql.json(toJsonValue(payload))}::jsonb) as input_row(
          "factId" uuid,
          "supplementId" uuid,
          "supplementName" text
        )
      )
      update public.product_facts
      set
        supplement_id = input_rows."supplementId",
        name = input_rows."supplementName",
        normalized_name = supplements.normalized_name,
        updated_at = now()
      from input_rows
      join public.supplements
        on supplements.id = input_rows."supplementId"
      where product_facts.id = input_rows."factId"
        and product_facts.supplement_id is null
    `;

    const refreshed = await refreshAndPersistProductValidations(sql, productIds);

    await sql`
      insert into public.product_admin_audit (
        actor,
        action,
        after_payload
      )
      values (
        'product_fact_canonical_repair_cli',
        'product_fact_canonical_matches_repaired',
        ${sql.json(toJsonValue({
          matchedFactCount: candidateRows.length,
          matchedProductCount: productIds.length,
          productId,
          refreshedProductIds: refreshed.map((row) => row.productId),
          summary: summaryRows
        }))}::jsonb
      )
    `;

    console.log(JSON.stringify({
      matchedFactCount: candidateRows.length,
      matchedProductCount: productIds.length,
      refreshedProductCount: refreshed.length,
      summary: summaryRows
    }, null, 2));
  }
} finally {
  await closeSqlPool();
}
