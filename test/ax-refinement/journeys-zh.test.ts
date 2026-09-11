import { test, afterEach } from "node:test";
import { profiles } from "./helpers.ts";
import { cleanupRefinementJourney, runRefinementJourney } from "./journey-case.ts";

const locale = "zh-CN";
afterEach(cleanupRefinementJourney);
for (const profile of profiles) {
  test(`AXR-REG-01 AXR-REG-02 ${profile.id} ${locale} published refinement preserves coverage, advice and current selection`, { timeout: 90000 }, async () => {
    await runRefinementJourney(profile, locale);
  });
}
