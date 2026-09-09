import { isUuid } from "@/lib/assessment-store";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { ensureAssessmentProductPreferences, normalizedProductExclusions } from "@/lib/assessment-product-preferences";
import { FunnelError } from "@/lib/funnel-errors";
import { loadGenerationInput, withGenerationInput } from "@/lib/assessment-revisions";
import { isLocale } from "@/lib/i18n";
import { normalizeProductStackPreference } from "@/lib/product-recommendations";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import {
  enqueueFoodGapSupportTask,
  enqueueProductRecommendationsTask
} from "@/lib/task-worker";

type ProductRecommendationsRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: ProductRecommendationsRouteProps
) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.assessmentPlanMutation
  );

  if (limited) {
    return limited;
  }

  const { planId } = await params;
  const sql = getSql();

  if (!sql || !isUuid(planId)) {
    return Response.json({ message: "Plan not found" }, { status: 404 });
  }

  const planRows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.assessments
      where plan_id = ${planId}::uuid
        and selected_plan is not null
    ) as exists
  `;

  if (planRows[0]?.exists !== true) {
    return Response.json({ message: "Plan not found" }, { status: 404 });
  }

  const rawBody = await request.json().catch(() => ({}));
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return Response.json({ message: "Request body must be an object", reasonCode: "invalid_request" }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  if (body.locale !== undefined && !isLocale(body.locale)) {
    return Response.json({ message: "locale must be en, th or zh-CN", reasonCode: "invalid_locale" }, { status: 400 });
  }
  if (body.searchEffort !== undefined && body.searchEffort !== "standard" && body.searchEffort !== "expanded") {
    return Response.json({ message: "searchEffort must be standard or expanded", reasonCode: "invalid_search_effort" }, { status: 400 });
  }
  const stackPreference = normalizeProductStackPreference(
    body && typeof body === "object" && "stackPreference" in body
      ? (body as Record<string, unknown>).stackPreference
      : null
  );
  try {
    return await withDatabaseTransaction(sql, async tx => {
      // Match the assessment/result lock order while committing preferences and work together.
      const [assessment] = await tx`select input_revision from public.assessments where plan_id = ${planId}::uuid for no key update`;
      if (!assessment) throw new FunnelError("Plan not found", 404, "assessment_not_found");
      if (body.assessmentRevision != null && Number(body.assessmentRevision) !== Number(assessment.input_revision)) {
        throw new FunnelError("Assessment changed. Reload before replanning.", 409, "assessment_changed");
      }
      const previous = await ensureAssessmentProductPreferences(tx, planId);
      let selectionRevision = previous.revision;
      if (body.excludeProductIds !== undefined || body.searchEffort !== undefined) {
        const excluded = body.excludeProductIds === undefined ? previous.excludedProductIds : normalizedProductExclusions(body.excludeProductIds);
        const searchEffort = body.searchEffort === undefined ? previous.searchEffort : body.searchEffort;
        if (!Number.isSafeInteger(body.selectionRevision) || body.selectionRevision !== previous.revision) {
          throw new FunnelError("Product preferences changed. Reload before replanning.", 409, "stale_product_selection");
        }
        if (JSON.stringify(excluded) !== JSON.stringify(previous.excludedProductIds) || searchEffort !== previous.searchEffort) {
          selectionRevision += 1;
          await tx`update public.assessment_product_preferences set revision = ${selectionRevision},
            excluded_product_ids = ${excluded}::uuid[], search_effort = ${String(searchEffort)}, updated_at = now() where plan_id = ${planId}::uuid`;
        }
      }
      const generation = await loadGenerationInput(tx, planId, body.locale);
      if (!generation) throw new FunnelError("Assessment changed. Reload before replanning.", 409, "assessment_changed");
      return withGenerationInput(planId, generation, async () => {
        const taskId = await enqueueProductRecommendationsTask({ forceNew: true, planId, stackPreference });
        if (!taskId) throw new FunnelError("Unable to queue product matching", 409, "matching_unavailable");
        await enqueueFoodGapSupportTask({ dependsOnTaskId: taskId, parentTaskId: taskId, planId, source: "product_recommendations_request" });
        return Response.json({ stackPreference, taskId, selectionRevision, searchEffort: body.searchEffort ?? previous.searchEffort });
      });
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Unable to queue product matching",
      reasonCode: error instanceof FunnelError ? error.code : "matching_unavailable" },
      { status: error instanceof FunnelError ? error.status : 500 });
  }
}
