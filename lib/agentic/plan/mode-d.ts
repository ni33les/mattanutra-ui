import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import type { CanonicalPlanState, PlanTarget } from "@/lib/agentic/plan/types";

function supplement(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);

  if (!found) {
    throw new Error(`Missing fixture supplement ${name}`);
  }

  return found;
}

export const AUG25_TARGETS: readonly PlanTarget[] = [
  { amount: 2000, name: "Vitamin D3", supplementId: supplement("Vitamin D3").supplementId, unit: "IU" },
  { amount: 1000, name: "Omega-3", supplementId: supplement("Omega-3").supplementId, unit: "mg" },
  { amount: 200, name: "Magnesium", supplementId: supplement("Magnesium").supplementId, unit: "mg" },
  { amount: 250, name: "Vitamin B12", supplementId: supplement("Vitamin B12").supplementId, unit: "mcg" },
  { amount: 500, name: "Vitamin C", supplementId: supplement("Vitamin C").supplementId, unit: "mg" }
];

export function aug25PlanState(
  overrides: Partial<CanonicalPlanState> = {}
): CanonicalPlanState {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: [],
    optimization: "fewest_pills",
    pinnedOptionId: null,
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [...AUG25_TARGETS],
    ...overrides
  };
}
