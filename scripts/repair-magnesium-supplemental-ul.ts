import { closeSqlPool, getSql } from "@/lib/db";

const NIH_URL =
  "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/";
const ADULT_BANDS = ["adult", "pregnant", "breastfeeding", "child_9_13", "adolescent_14_18"];

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required");
  }

  const supplements = await sql<Array<{ id: string; name: string }>>`
    select id::text, name
    from public.supplements
    where lower(name) = 'magnesium'
  `;

  if (supplements.length < 1) {
    throw new Error("Magnesium supplement row not found");
  }

  let inserted = 0;

  for (const supplement of supplements) {
    for (const lifeStage of ADULT_BANDS) {
      const latest = await sql<
        Array<{
          id: string;
          max_amount: string | number;
          source_url: string | null;
          version: string | number;
        }>
      >`
        select id::text, max_amount, source_url, version
        from public.supplement_safety_limits
        where supplement_id = ${supplement.id}::uuid
          and life_stage = ${lifeStage}
          and source_scope = 'supplemental'
        order by version desc
        limit 1
      `;
      const current = latest[0];

      if (!current) {
        continue;
      }

      if (Number(current.max_amount) === 350 && current.source_url === NIH_URL) {
        continue;
      }

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
        values (
          gen_random_uuid(),
          ${supplement.id}::uuid,
          ${Number(current.version) + 1},
          ${lifeStage},
          'supplemental',
          350,
          'mg/day supplemental',
          'high',
          array['condition_caution', 'kidney_caution']::text[],
          'Do not count food magnesium toward this supplemental UL.',
          ${NIH_URL},
          ${"NIH ODS adult supplemental UL is 350 mg. Restored from a product-review raise to 1,100 mg. " + NIH_URL},
          now(),
          now()
        )
      `;
      inserted += 1;
    }
  }

  console.log(
    JSON.stringify({
      inserted,
      ok: true,
      supplementIds: supplements.map((item) => item.id)
    })
  );
  await closeSqlPool();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
