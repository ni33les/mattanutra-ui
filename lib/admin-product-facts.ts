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
    normalized_alias: string;
  }>>`
    select supplements.id::text, supplements.name, supplement_aliases.normalized_alias
    from public.supplement_aliases
    join public.supplements
      on supplements.id = supplement_aliases.supplement_id
    where supplement_aliases.normalized_alias = any(${normalizedNames}::text[])
       or supplements.normalized_name = any(${normalizedNames}::text[])
  `;
  const byKey = new Map<string, { id: string; name: string }>();

  for (const fact of factAliases) {
    const match = rows.find((row) =>
      fact.aliases.some((alias) =>
        row.normalized_alias === alias || productKeysMatch(alias, row.normalized_alias)
      )
    );

    if (match) {
      byKey.set(fact.key, { id: match.id, name: match.name });
    }
  }

  return byKey;
}
