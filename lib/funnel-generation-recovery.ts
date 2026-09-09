import { getSql, withDatabaseTransaction } from "@/lib/db";
import { loadGenerationInput, withGenerationInput } from "@/lib/assessment-revisions";
import type { Locale } from "@/lib/i18n";

/** Explicit refresh repairs missing generator outputs. Status reads never invoke this mutation. */
export async function recoverMissingFunnelGeneration(input: Readonly<{
  planId: string; locale: Locale; healthScoreMissing: boolean; formulationMissing: boolean;
}>) {
  const sql = getSql();
  if (!sql || (!input.healthScoreMissing && !input.formulationMissing)) return;
  const { enqueueHealthScoreAnalysisTask, enqueueNutritionPlanTasks } = await import("@/lib/task-worker");
  await withDatabaseTransaction(sql, async tx => {
    const [assessment] = await tx`select selected_plan from public.assessments
      where plan_id = ${input.planId}::uuid for no key update`;
    if (!assessment) return;
    const generation = await loadGenerationInput(tx, input.planId, input.locale);
    if (!generation) return;
    await withGenerationInput(input.planId, generation, async () => {
      if (input.healthScoreMissing) await enqueueHealthScoreAnalysisTask({
        planId: input.planId, locale: input.locale, source: "generator_version_recovery"
      });
      if (input.formulationMissing && assessment.selected_plan) await enqueueNutritionPlanTasks({
        planId: input.planId, locale: input.locale, answers: generation.answers,
        plan: assessment.selected_plan === "pro" ? "pro" : "precision"
      });
    });
  });
}
