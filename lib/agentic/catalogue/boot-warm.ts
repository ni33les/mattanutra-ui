import { loadAgenticConfig } from "@/lib/agentic/config";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";
import { warmAgenticCatalogue } from "@/lib/agentic/catalogue/warm";

const BOOT_WARM_DELAY_MS = 2_000;

export function startCatalogueBootWarm() {
  setTimeout(() => {
    const environment = loadAgenticConfig().environment;
    void warmAgenticCatalogue(environment).catch((error) => {
      console.warn(
        "Unable to warm live catalogue at boot",
        error instanceof Error ? error.message : error
      );
    });
    void refreshAdminSafetyCeilings().catch(() => {
      // Matcher ceilings stay fail-closed until the first plan loads them.
    });
  }, BOOT_WARM_DELAY_MS);
}
