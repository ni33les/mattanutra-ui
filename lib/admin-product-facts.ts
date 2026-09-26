import { toJsonValue } from "@/lib/assessment-store";
import type { getSql } from "@/lib/db";
import {
  normalizeProductFactKey,
  normalizeProductFactName,
  productFactAliasKeys,
  productKeysMatch
} from "@/lib/product-recommendations";
import {
  cleanNullableText,
  isUuidValue,
  numberOrNull
} from "./admin-product-helpers.ts";
import type { ProductImportFactInput } from "./admin-product-types.ts";

export function normalizedFactsForStorage(
  facts: readonly ProductImportFactInput[] | undefined
) {
  return (facts ?? [])
    .map((fact) => {
      const name = normalizeProductFactName(fact.name.trim()) || fact.name.trim();

      if (!name) {
        return null;
      }

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        itemType: fact.itemType ?? "supplement",
        name,
        servingLabel: cleanNullableText(fact.servingLabel, 200),
        sourceText: cleanNullableText(fact.sourceText, 1000),
        sourceUrl: cleanNullableText(fact.sourceUrl, 2000),
        supplementId: isUuidValue(fact.supplementId) ? fact.supplementId : null,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

export async function supplementIdsForFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  facts: readonly ProductImportFactInput[]
) {
  const factAliases = facts.map((fact) => ({
    aliases: productFactAliasKeys(fact.name),
    key: normalizeProductFactKey(fact.name)
  }));
  const normalizedNames = [...new Set(factAliases.flatMap((fact) => fact.aliases))];

  if (normalizedNames.length < 1) {
    return new Map<string, { id: string; name: string }>();
  }

  const rows = await sql<Array<{
    id: string;
    name: string;
    normalized_alias: string | null;
    normalized_name: string;
  }>>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplement_aliases.normalized_alias
    from public.supplements
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    where supplement_aliases.normalized_alias = any(${normalizedNames}::text[])
       or supplements.normalized_name = any(${normalizedNames}::text[])
  `;
  const byKey = new Map<string, { id: string; name: string }>();

  for (const fact of factAliases) {
    const match = rows.find((row) =>
      fact.aliases.some((alias) =>
        row.normalized_name === alias ||
        productKeysMatch(alias, row.normalized_name) ||
        Boolean(
          row.normalized_alias &&
          (row.normalized_alias === alias ||
            productKeysMatch(alias, row.normalized_alias))
        )
      )
    );

    if (match) {
      byKey.set(fact.key, { id: match.id, name: match.name });
    }
  }

  return byKey;
}

export async function replaceProductFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    actor?: string | null;
    changeReason?: string | null;
    deleteSources?: readonly string[];
    facts: readonly ProductImportFactInput[];
    productId: string;
    source: string;
    supplementMatchesByFactName: ReadonlyMap<string, { id: string; name: string }>;
  }>
) {
  const explicitSupplementIds = [...new Set(input.facts.flatMap((fact) =>
    isUuidValue(fact.supplementId) ? [fact.supplementId] : []
  ))];
  let existingSupplementIds = new Set<string>();

  if (explicitSupplementIds.length > 0) {
    const existingSupplementRows = await sql<Array<{ id: string }>>`
        select id::text
        from public.supplements
        where id = any(${explicitSupplementIds}::uuid[])
      `;
    existingSupplementIds = new Set(existingSupplementRows.map((row) => row.id));
  }
  const facts = input.facts
    .map((fact) => {
      const factName = fact.name.trim();

      if (!factName) {
        return null;
      }
      const supplementMatch =
        input.supplementMatchesByFactName.get(normalizeProductFactKey(factName));
      const explicitSupplementId =
        isUuidValue(fact.supplementId) && existingSupplementIds.has(fact.supplementId)
          ? fact.supplementId
          : null;
      const supplementId = explicitSupplementId ?? supplementMatch?.id ?? null;

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        item_type: fact.itemType ?? "supplement",
        name: factName,
        normalized_name: normalizeProductFactKey(factName),
        serving_label: cleanNullableText(fact.servingLabel, 200),
        source: input.source,
        source_text: cleanNullableText(fact.sourceText, 1000),
        source_url: cleanNullableText(fact.sourceUrl, 2000),
        supplement_id: supplementId,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const sourceFilter = input.deleteSources
    ? input.deleteSources.length > 0
      ? sql`and source = any(${input.deleteSources}::text[])`
      : sql``
    : sql`and false`;
  await sql`
    with deleted as (
      delete from public.product_facts
      where product_id = ${input.productId}::uuid
        ${sourceFilter}
    ),
    input_facts as (
      select *
      from jsonb_to_recordset(${sql.json(toJsonValue(facts))}::jsonb) as fact(
        amount numeric,
        confidence text,
        item_type text,
        name text,
        normalized_name text,
        serving_label text,
        source text,
        source_text text,
        source_url text,
        supplement_id uuid,
        unit text
      )
    )
    insert into public.product_facts (
      product_id,
      item_type,
      supplement_id,
      name,
      normalized_name,
      amount,
      unit,
      serving_label,
      confidence,
      source,
      source_url,
      source_text,
      created_at,
      updated_at
    )
    select
      ${input.productId}::uuid,
      input_facts.item_type,
      input_facts.supplement_id,
      input_facts.name,
      input_facts.normalized_name,
      input_facts.amount,
      input_facts.unit,
      input_facts.serving_label,
      input_facts.confidence,
      input_facts.source,
      input_facts.source_url,
      input_facts.source_text,
      now(),
      now()
    from input_facts
  `;
}
