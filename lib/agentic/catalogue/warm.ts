import type { AgenticEnvironment } from "@/lib/agentic/config";
import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import { listDeliverableMarkets } from "@/lib/agentic/catalogue/market";
import { warmCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import { matchPlan } from "@/lib/agentic/plan/matching";
import type { CanonicalPlanState } from "@/lib/agentic/plan/types";

function supplementId(name: string) {
  return (
    FIXTURE_SUPPLEMENTS.find((item) => item.name === name)?.supplementId ??
    `sup_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
  );
}

function warmupState(countryCode: string): CanonicalPlanState {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: countryCode,
    leftovers: [],
    locale: "en",
    medicationCodes: ["apixaban"],
    optimization: "balanced",
    pinnedOptionId: null,
    profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" },
      { amount: 1000, name: "Algae omega-3", supplementId: supplementId("Omega-3"), unit: "mg" },
      { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" },
      { amount: 1000, name: "Vitamin B12", supplementId: supplementId("Vitamin B12"), unit: "mcg" },
      { amount: 1000, name: "Vitamin C", supplementId: supplementId("Vitamin C"), unit: "mg" },
      { amount: 25, name: "Zinc", supplementId: supplementId("Zinc"), unit: "mg" },
      { amount: 10, name: "Iron", supplementId: supplementId("Iron"), unit: "mg" },
      { amount: 100, name: "CoQ10", supplementId: supplementId("CoQ10"), unit: "mg" }
    ]
  };
}

export async function warmAgenticCatalogue(environment: AgenticEnvironment) {
  const markets = await listDeliverableMarkets();

  await Promise.all(
    markets.map(async (market) => {
      const snapshot = await warmCatalogueSnapshot(
        environment,
        market.countryCode
      );

      if (snapshot.products.length < 1) {
        return;
      }

      matchPlan({
        snapshot,
        state: warmupState(market.countryCode)
      });
    })
  );
}
