import type { AgenticEnvironment } from "@/lib/agentic/config";
import { listDeliverableMarkets } from "@/lib/agentic/catalogue/market";
import { warmCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";

export async function warmAgenticCatalogue(environment: AgenticEnvironment) {
  const markets = await listDeliverableMarkets();
  const countryCodes = [...new Set(markets.map((market) => market.countryCode))];

  for (const countryCode of countryCodes) {
    await warmCatalogueSnapshot(environment, countryCode);
  }

  return markets;
}
