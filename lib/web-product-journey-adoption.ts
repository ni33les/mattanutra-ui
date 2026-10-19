import { getSql, withDatabaseTransaction } from "@/lib/db";
import { appendAssessmentVersion } from "@/lib/domain-versions";
import { WEB_PRODUCT_JOURNEY_VERSION, isPublicWebAssessment, isWebProductJourney, webProductJourneyEnabled } from "@/lib/web-product-journey";

/** Only explicit capture/recovery invokes this; status reads remain read-only. */
export async function adoptWebProductJourney(planId: string) {
  const sql = getSql();
  if (!sql || !webProductJourneyEnabled()) return;
  await withDatabaseTransaction(sql, async tx => {
    const [row] = await tx`select * from public.assessments where plan_id=${planId}::uuid for no key update`;
    if (!row || !isPublicWebAssessment(row.answers) || isWebProductJourney(row.journey_version)) return;
    await tx`update public.assessments set journey_version=${WEB_PRODUCT_JOURNEY_VERSION}, updated_at=now()
      where plan_id=${planId}::uuid`;
    await appendAssessmentVersion(tx, { planId, actor: "web_journey", source: "journey_recovery",
      changeReason: "free_product_journey_adopted", eventType: "web_product_journey_adopted",
      afterPayload: { journeyVersion: WEB_PRODUCT_JOURNEY_VERSION }, eventPayload: {}, projectionBefore: row });
  });
}
