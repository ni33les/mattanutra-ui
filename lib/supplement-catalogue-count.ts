import { getSql } from "@/lib/db";
import { DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT } from "@/lib/health-score";

const COUNT_TTL_MS = 10 * 60_000;
let cached: { at: number; count: number } | null = null;
let inflight: Promise<number> | null = null;

export async function getEvaluatedIngredientCatalogueCount() {
  if (cached && Date.now() - cached.at < COUNT_TTL_MS) {
    return cached.count;
  }

  if (inflight) {
    return inflight;
  }

  inflight = loadEvaluatedIngredientCatalogueCount().finally(() => {
    inflight = null;
  });

  return inflight;
}

async function loadEvaluatedIngredientCatalogueCount() {
  const sql = getSql();

  if (!sql) {
    return cached?.count ?? DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
  }

  try {
    const rows = await sql<Array<{ count: number }>>`
      select count(*)::int as count
      from public.supplements
    `;
    const count = Number(rows[0]?.count);
    const resolved = Number.isFinite(count)
      ? Math.max(DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT, Math.round(count))
      : DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
    cached = { at: Date.now(), count: resolved };
    return resolved;
  } catch {
    return cached?.count ?? DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT;
  }
}
