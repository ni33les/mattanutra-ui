import { createHash } from "node:crypto";
import type postgres from "postgres";
import { FUNNEL_GENERATOR_VERSION } from "@/lib/assessment-revisions";
import { isLocale } from "@/lib/i18n";
import { uuidPattern, type MetaEventName } from "@/lib/meta-event-policy";
import { historicalAssessmentReadJoin, historicalResult } from "@/lib/historical-assessment-read";

type Db = postgres.Sql | postgres.TransactionSql;

/** Browser evidence is verified here and never copied into an advertising payload. */
export async function validateWebProductMilestone(sql: Db, contextId: string, name: MetaEventName,
  data: Record<string, string | number>, value: unknown) {
  const evidence = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const planId = String(data.plan_id ?? ""), locale = String(data.locale ?? ""), stage = String(data.funnel_stage ?? "");
  const revision = Number(evidence.revision);
  if (!uuidPattern.test(planId) || !isLocale(locale) || !Number.isSafeInteger(revision) || revision < 0
    || !((name === "ViewContent" && ["formula", "products"].includes(stage)) || name === "AddToCart" && stage === "basket")) return null;
  const [assessment] = await sql`select a.input_revision from public.assessments a
    join public.meta_tracking_bindings b on b.resource_type='plan' and b.resource_id=a.plan_id::text
    where a.plan_id=${planId}::uuid and b.context_id=${contextId}::uuid and a.input_revision=${revision}
      and to_jsonb(a)->>'journey_version'='web-products-v1'`;
  if (!assessment) return null;
  const safeData: Record<string, string | number> = { planId, locale, channel: "web", stage, journey_version: "web-products-v1" };
  if (stage === "formula") {
    const formulaVersion = Number(evidence.formulaVersion);
    if (!Number.isSafeInteger(formulaVersion) || formulaVersion < 1) return null;
    const [formula] = await sql`select f.version from public.assessments a
      ${historicalAssessmentReadJoin(sql, "a", locale)}
      join public.formulations f on f.plan_id=a.plan_id
      where a.plan_id=${planId}::uuid and a.input_revision=${revision}
        and ((f.assessment_revision=a.input_revision and f.generation_locale=${locale} and f.generator_version=${FUNNEL_GENERATOR_VERSION})
          or ${historicalResult(sql, "f", true)})
        and (f.model_version is null or f.model_version not like '%:example') order by f.version desc limit 1`;
    return formula && Number(formula.version) === formulaVersion
      ? { key: `web-products:${planId}:${revision}:${locale}:formula:${formula.version}`, data: safeData } : null;
  }
  const runId = typeof evidence.runId === "string" && uuidPattern.test(evidence.runId) ? evidence.runId : null;
  if (!runId) return null;
  const [run] = await sql`select r.id from public.assessments a
    ${historicalAssessmentReadJoin(sql, "a", locale)}
    join public.product_recommendation_runs r on r.plan_id=a.plan_id
    left join public.assessment_product_preferences p on p.plan_id=a.plan_id
    where a.plan_id=${planId}::uuid and a.input_revision=${revision} and r.id=${runId}::uuid
      and ((r.assessment_revision=a.input_revision and r.generation_locale=${locale} and r.generator_version=${FUNNEL_GENERATOR_VERSION}
        and r.catalogue_revision=(select revision from public.catalogue_runtime_revision where singleton=true)) or ${historicalResult(sql, "r")})
      and r.selection_revision=coalesce(p.revision,0) and r.status in ('completed','partial')
      and exists(select 1 from public.product_recommendation_items i where i.run_id=r.id)
      and not exists(select 1 from public.product_recommendation_runs newer
        where newer.plan_id=r.plan_id and newer.selection_revision=r.selection_revision
          and coalesce(newer.diagnostics->>'stackPreference','balanced')=coalesce(r.diagnostics->>'stackPreference','balanced')
          and newer.status in ('completed','partial')
          and ((newer.assessment_revision=a.input_revision and newer.generation_locale=${locale}
            and newer.generator_version=${FUNNEL_GENERATOR_VERSION}
            and newer.catalogue_revision=(select revision from public.catalogue_runtime_revision where singleton=true))
            or ${historicalResult(sql, "newer")})
          and (newer.generated_at,newer.id)>(r.generated_at,r.id)) limit 1`;
  if (run?.id !== runId) return null;
  const key = `web-products:${planId}:${revision}:${locale}:${stage}:${runId}`;
  if (stage === "products") return { key, data: safeData };
  const selectedItemIds = Array.isArray(evidence.selectedItemIds) ? evidence.selectedItemIds : [];
  if (!selectedItemIds.length || selectedItemIds.length > 100 || selectedItemIds.some(id => typeof id !== "string" || !uuidPattern.test(id))
    || new Set(selectedItemIds).size !== selectedItemIds.length) return null;
  const { currentWebCheckoutSelection } = await import("@/lib/retail-product-checkout");
  let selection;
  try {
    selection = await currentWebCheckoutSelection(sql, { planId, locale, selectedItemIds, recommendationRunId: runId,
      assessmentRevision: revision, candidateKey: typeof evidence.candidateKey === "string" ? evidence.candidateKey : null,
      selectionRevision: Number.isSafeInteger(evidence.selectionRevision) ? Number(evidence.selectionRevision) : null });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["stale_product_selection", "invalid_product_selection"].includes(String(error.code))) return null;
    throw error;
  }
  const amounts = selection.recommendations.map(row => Number(row.price_amount));
  const currencies = new Set(selection.recommendations.map(row => row.currency));
  const currency = selection.recommendations[0]?.currency;
  if (amounts.some(amount => !Number.isFinite(amount) || amount <= 0) || currencies.size !== 1 || !/^[A-Z]{3}$/.test(currency ?? "")) return null;
  const fingerprint = createHash("sha256").update([...selectedItemIds].sort().join(",")).digest("hex");
  return { key: `${key}:${fingerprint}`, data: { ...safeData, purchase_type: "products", currency,
    // Match checkout's per-unit money normalization; this is the confirmed goods
    // estimate. Checkout/Purchase report the resolved retailer and shipping total.
    value: amounts.reduce((sum, amount) => sum + Math.round(amount), 0) } };
}
