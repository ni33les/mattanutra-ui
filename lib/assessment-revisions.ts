import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import type { HealthScoreResult } from "@/lib/health-score";

export const FUNNEL_GENERATOR_VERSION = "web-funnel-v1";
export type GenerationInput = Readonly<{
  revision: number;
  inputHash: string;
  answers: Record<string, unknown>;
  locale: Locale;
  generatorVersion: string;
}>;

const generationScope = new AsyncLocalStorage<{ planId: string; input: GenerationInput }>();
export function withGenerationInput<T>(planId: string, input: GenerationInput, work: () => T): T {
  return generationScope.run({ planId, input }, work);
}
export function generationLocale(planId: string | null | undefined) {
  const scope = generationScope.getStore();
  return scope && scope.planId === planId ? scope.input.locale : null;
}
export const ASSESSMENT_GENERATION_TASKS = new Set([
  "analyze_healthscore", "generate_supplement_guidance", "generate_example_supplement_guidance",
  "generate_food_guidance", "generate_food_gap_guidance", "generate_product_recommendations",
  "generate_nutrition_report", "refine_nutrition_plan", "nutrition_plan_chat_reply"
]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)])
  );
  return value;
}
export function assessmentInputHash(answers: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(answers))).digest("hex");
}
export function generationInput(payload: unknown): GenerationInput | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { generation?: GenerationInput }).generation;
  return value && Number.isSafeInteger(value.revision) && isLocale(value.locale) &&
    typeof value.inputHash === "string" && value.answers && typeof value.answers === "object" &&
    typeof value.generatorVersion === "string" ? value : null;
}
export async function loadGenerationInput(sql: postgres.Sql | postgres.TransactionSql, planId: string, locale?: unknown): Promise<GenerationInput | null> {
  const [row] = await sql`select answers, input_revision, input_hash, locale from public.assessments where plan_id = ${planId}::uuid`;
  if (!row) return null;
  const scope = generationScope.getStore();
  if (scope?.planId === planId) {
    if (scope.input.revision !== Number(row.input_revision) || (row.input_hash && scope.input.inputHash !== row.input_hash)) return null;
    return scope.input;
  }
  return {
    answers: row.answers, revision: Number(row.input_revision), inputHash: row.input_hash ?? assessmentInputHash(row.answers),
    locale: isLocale(locale) ? locale : isLocale(row.locale) ? row.locale : "en", generatorVersion: FUNNEL_GENERATOR_VERSION
  };
}
export async function getRevisionHealthScore(planId: string, locale: Locale): Promise<HealthScoreResult | null> {
  const sql = getSql();
  if (!sql) return null;
  const [row] = await sql`
    select results.result from public.assessment_healthscore_results results
    join public.assessments a on a.plan_id = results.plan_id and a.input_revision = results.revision
    where results.plan_id = ${planId}::uuid and results.locale = ${locale}
      and results.generator_version = ${FUNNEL_GENERATOR_VERSION}
  `;
  return row?.result ?? null;
}
