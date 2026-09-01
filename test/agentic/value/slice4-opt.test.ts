import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState, StackOption } from "../../../lib/agentic/plan/types.ts";
import { publicBasketItem, publicOption } from "../../../lib/agentic/public-mapper.ts";
import { VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { sampleValueSnapshot } from "./sample-catalogue.ts";
import {
  oracleAcceptedTargetIds,
  oracleBurden,
  oracleHasDominatedPair,
  oracleLabelRoles,
  oracleOptionSignature,
  oracleProductServesAccepted,
  type OracleBurden
} from "./opt-oracle.ts";

function intentState(
  snapshot = sampleValueSnapshot(),
  extra: Partial<CanonicalPlanState> = {}
): CanonicalPlanState {
  const creatine = snapshot.supplements[0]!;
  const magnesium = snapshot.supplements[1]!;
  const d3 = snapshot.supplements[2]!;
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: [],
    optimization: "lowest_cost",
    pinnedOptionId: null,
    profile: { ageYears: 35, lifeStage: "adult", sex: "female" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      {
        amount: VALUE_ROLE_REQUEST.creatine.amount,
        importance: "core",
        name: creatine.name,
        supplementId: creatine.supplementId,
        unit: VALUE_ROLE_REQUEST.creatine.unit
      },
      {
        amount: VALUE_ROLE_REQUEST.magnesium.amount,
        importance: "optional",
        name: magnesium.name,
        supplementId: magnesium.supplementId,
        unit: VALUE_ROLE_REQUEST.magnesium.unit
      },
      {
        amount: VALUE_ROLE_REQUEST.vitaminD3.amount,
        importance: "conditional",
        name: d3.name,
        prerequisite: {
          nextAction: "Confirm vitamin D status with a clinician.",
          reasonCode: "vitamin_d_status_unknown",
          status: "unsatisfied"
        },
        supplementId: d3.supplementId,
        unit: VALUE_ROLE_REQUEST.vitaminD3.unit
      }
    ],
    ...extra
  };
}

function optionsOf(result: ReturnType<typeof matchPlan>) {
  return [result.selected, ...result.alternatives].filter((item): item is StackOption =>
    Boolean(item)
  );
}

function publishedReason(option: StackOption, advertised: readonly StackOption[]) {
  return publicOption(option, advertised[0] ?? option, "en", advertised).reasonCode;
}

function burdenOf(option: StackOption) {
  return (option as StackOption & { burden?: OracleBurden }).burden;
}

describe("Slice 4 Pareto relevance burden and labels", () => {
  it("OPT-01 caps three unique non-dominated options and names a lone option", () => {
    const snapshot = sampleValueSnapshot();
    const full = matchPlan({ snapshot, state: intentState(snapshot) });
    const options = optionsOf(full);
    assert.ok(options.length >= 1 && options.length <= 3);
    const signatures = new Set(options.map(oracleOptionSignature));
    assert.equal(signatures.size, options.length);
    assert.equal(oracleHasDominatedPair(options), false);
    if (options.length > 1) {
      for (const option of options) {
        assert.notEqual(publishedReason(option, options), "no_distinct_alternative");
      }
    }

    const creatineOnly = matchPlan({
      snapshot,
      state: {
        ...intentState(snapshot),
        targets: intentState(snapshot).targets.filter((item) => item.importance === "core")
      }
    });
    const lone = optionsOf(creatineOnly);
    assert.equal(lone.length, 1);
    assert.equal(oracleLabelRoles(lone).noDistinctAlternative, true);
    assert.equal(publishedReason(lone[0]!, lone), "no_distinct_alternative");
  });

  it("OPT-02 prefers dedicated D3 over collateral and discloses incidentals", () => {
    const snapshot = sampleValueSnapshot();
    const d3 = snapshot.supplements[2]!;
    const dedicated = snapshot.products.find((item) => item.candidate.title === "Vitamin D3 1000 IU");
    const collateral = snapshot.products.find((item) =>
      item.candidate.title.includes("Joint Mobility")
    );
    assert.ok(dedicated);
    assert.ok(collateral);
    const satisfied = matchPlan({
      snapshot,
      state: {
        ...intentState(snapshot),
        targets: intentState(snapshot).targets.map((item) =>
          item.supplementId === d3.supplementId
            ? {
                ...item,
                prerequisite: {
                  nextAction: "Vitamin D status confirmed.",
                  reasonCode: "vitamin_d_status_confirmed",
                  status: "satisfied" as const
                }
              }
            : item
        )
      }
    });
    const options = optionsOf(satisfied);
    const coveringD3 = options.filter((option) =>
      option.coverage.some(
        (row) =>
          row.supplementId === d3.supplementId &&
          (row.status === "covered" || row.status === "over_target")
      )
    );
    assert.ok(coveringD3.length > 0);
    for (const option of coveringD3) {
      assert.equal(
        option.basket.some((item) => item.productId === collateral.productId),
        false
      );
      assert.equal(
        option.basket.some((item) => item.productId === dedicated.productId),
        true
      );
      const accepted = oracleAcceptedTargetIds(option.coverage);
      for (const item of option.basket) {
        assert.equal(oracleProductServesAccepted(item, accepted), true);
        const published = publicBasketItem(item);
        for (const name of published.incidentalNutrientNames ?? []) {
          assert.equal((published.requestedNutrientNames ?? []).includes(name), false);
        }
      }
    }

    const withoutDedicated = {
      ...snapshot,
      products: snapshot.products.filter((item) => item.productId !== dedicated.productId)
    };
    const fallback = matchPlan({
      snapshot: withoutDedicated,
      state: {
        ...intentState(withoutDedicated),
        targets: intentState(withoutDedicated).targets.map((item) =>
          item.supplementId === d3.supplementId
            ? {
                ...item,
                prerequisite: {
                  nextAction: "Vitamin D status confirmed.",
                  reasonCode: "vitamin_d_status_confirmed",
                  status: "satisfied" as const
                }
              }
            : item
        )
      }
    });
    const collateralOption = optionsOf(fallback).find((option) =>
      option.basket.some((item) => item.productId === collateral.productId)
    );
    assert.ok(collateralOption);
    const collateralLine = collateralOption.basket.find(
      (item) => item.productId === collateral.productId
    );
    assert.ok(collateralLine);
    assert.equal(collateralLine.selectionReason?.code, "dedicated_unavailable");
    const published = publicBasketItem(collateralLine);
    assert.equal((published.incidentalNutrientNames ?? []).includes("Calcium"), true);
    assert.equal((published.requestedNutrientNames ?? []).includes("Calcium"), false);
  });

  it("OPT-03 publishes a burden ledger that does not treat powder as zero effort", () => {
    const snapshot = sampleValueSnapshot();
    const mag = snapshot.supplements[1]!;
    const magProduct = snapshot.products[1]!;
    const result = matchPlan({ snapshot, state: intentState(snapshot) });
    const options = optionsOf(result);
    const complete = options.find((item) => item.role === "complete") ?? result.selected;
    assert.ok(complete);
    const burden = burdenOf(complete);
    const expected = oracleBurden(complete);
    assert.ok(burden);
    assert.equal(burden.pills, expected.pills);
    assert.equal(burden.softgels, expected.softgels);
    assert.equal(burden.tablets, expected.tablets);
    assert.equal(burden.gummies, expected.gummies);
    assert.equal(burden.administrations, expected.administrations);
    assert.equal(burden.nonPillTotal, expected.nonPillTotal);
    assert.equal(burden.administrationEvents, expected.administrationEvents);
    assert.equal(burden.productCount, expected.productCount);
    const creatine = complete.basket.find((item) => /powder/i.test(item.form));
    assert.ok(creatine);
    assert.equal(creatine.dailyPills, 0);
    assert.ok(burden.pills >= 0);
    assert.ok(burden.administrations >= 1);
    assert.ok(burden.administrationEvents >= 1);
    assert.ok(burden.nonPillTotal >= 1);
    assert.notEqual(burden.administrationEvents, 0);

    const retained = matchPlan({
      snapshot,
      state: {
        ...intentState(snapshot),
        currentSupplements: [
          {
            dailyAmount: 150,
            daysRemaining: 90,
            name: mag.name,
            productId: magProduct.productId,
            supplementId: mag.supplementId,
            unit: "mg"
          }
        ]
      }
    });
    const recommended = retained.selected;
    assert.ok(recommended);
    const retainedBurden = burdenOf(recommended);
    assert.ok(retainedBurden);
    assert.equal(retainedBurden.productCount, oracleBurden(recommended).productCount);
    assert.ok((recommended.retainedCurrent?.length ?? 0) >= 1);
    assert.equal(
      retainedBurden.productCount,
      recommended.basket.length + (recommended.retainedCurrent?.length ?? 0)
    );
  });

  it("OPT-04 reconstructs roles and the recommendation from returned facts", () => {
    const snapshot = sampleValueSnapshot();
    const result = matchPlan({ snapshot, state: intentState(snapshot) });
    const options = optionsOf(result);
    const derived = oracleLabelRoles(options);
    assert.ok(derived.minimumCore);
    assert.equal(derived.recommended?.optionId, derived.minimumCore.optionId);
    const recommended = options.find((item) => item.recommended);
    assert.ok(recommended);
    assert.equal(recommended.optionId, derived.recommended?.optionId);
    assert.equal(recommended.role, "minimum_core");
    for (const option of options) {
      const expectedRole = derived.byOptionId.get(option.optionId);
      assert.ok(expectedRole);
      assert.equal(option.role, expectedRole);
    }
    assert.equal(derived.noDistinctAlternative, options.length === 1);
    assert.equal(
      publishedReason(recommended, options) === "no_distinct_alternative",
      derived.noDistinctAlternative
    );
  });
});
