import { getSql } from "@/lib/db";
import { DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT } from "@/lib/health-score";

export async function getEvaluatedIngredientCatalogueCount() {
  const sql = getSql();

  if (!sql) {
    return DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
  }

  try {
    const rows = await sql<Array<{ count: number }>>`
      select count(*)::int as count
      from public.supplements
    `;
    const count = Number(rows[0]?.count);

    return Number.isFinite(count)
      ? Math.max(DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT, Math.round(count))
      : DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
  } catch {
    return DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
  }
}
