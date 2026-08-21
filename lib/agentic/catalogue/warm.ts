import type { AgenticEnvironment } from "@/lib/agentic/config";
import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import { listDeliverableMarkets } from "@/lib/agentic/catalogue/market";
import { warmCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import type { CanonicalPlanState } from "@/lib/agentic/plan/types";

function supplementId(name: string) {
  return (
    FIXTURE_SUPPLEMENTS.find((item) => item.name === name)?.supplementId ??
    `sup_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
  );
}

export function warmupPlanRequest(countryCode = "TH") {
  return {
    destinationCountry: countryCode,
    locale: "en" as const,
    medicationCodes: ["apixaban"],
    optimization: "balanced" as const,
    profile: { ageYears: 38, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: [
      { amount: 2000, name: "Vitamin D3", unit: "IU" as const },
      { amount: 1000, name: "Algae omega-3", unit: "mg" as const },
      { amount: 300, name: "Magnesium", unit: "mg" as const },
      { amount: 1000, name: "Vitamin B12", unit: "mcg" as const },
      { amount: 1000, name: "Vitamin C", unit: "mg" as const },
      { amount: 25, name: "Zinc", unit: "mg" as const },
      { amount: 10, name: "Iron", unit: "mg" as const },
      { amount: 100, name: "CoQ10", unit: "mg" as const }
    ]
  };
}

export function warmupState(countryCode: string): CanonicalPlanState {
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
    targets: warmupPlanRequest(countryCode).targets.map((item) => ({
      amount: item.amount,
      name: item.name,
      supplementId: supplementId(item.name === "Algae omega-3" ? "Omega-3" : item.name),
      unit: item.unit
    }))
  };
}

export async function warmAgenticCatalogue(environment: AgenticEnvironment) {
  const markets = await listDeliverableMarkets();
  await Promise.all(
    markets.map((market) =>
      warmCatalogueSnapshot(environment, market.countryCode)
    )
  );
  return markets;
}
