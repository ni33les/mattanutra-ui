import type { AgenticEnvironment } from "@/lib/agentic/config";
import { listDeliverableMarkets } from "@/lib/agentic/catalogue/market";
import { warmCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";

export async function warmAgenticCatalogue(environment: AgenticEnvironment) {
  const markets = await listDeliverableMarkets();
  await Promise.all(
    markets.map((market) =>
      warmCatalogueSnapshot(environment, market.countryCode)
    )
  );
  return markets;
}
