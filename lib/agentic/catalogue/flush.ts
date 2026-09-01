import { resetLiveCatalogueCache } from "@/lib/agentic/catalogue/live";
import { resetCatalogueSnapshotCache } from "@/lib/agentic/catalogue/snapshot";
import { resetInfoCache } from "@/lib/agentic/info";
import { resetMatcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { resetSupplementAvailabilityCache } from "@/lib/supplement-country-availability";
import { resetMatchPlanCache } from "@/lib/agentic/plan/matching";

export function flushMatchingCatalogueCaches() {
  resetLiveCatalogueCache();
  resetCatalogueSnapshotCache();
  resetSupplementAvailabilityCache();
  resetMatcherSafetyCeilings();
  resetInfoCache();
  resetMatchPlanCache();
}
