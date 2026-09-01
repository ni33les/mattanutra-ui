import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState, StackOption } from "../../../lib/agentic/plan/types.ts";
import { publicBasketItem } from "../../../lib/agentic/public-mapper.ts";
import { VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { sampleValueSnapshot } from "./sample-catalogue.ts";
import {
  oracleAvailableServings,
  oracleCashThroughHorizon,
  oracleConsumptionThroughHorizon,
  oracleDaysSupplied,
  oracleLeftoverServings,
  oracleLineTotal,
  oracleSavings
} from "./cost-oracle.ts";

function intentState(snapshot = sampleValueSnapshot()): CanonicalPlanState {
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
    ]
  };
}

function optionsOf(result: ReturnType<typeof matchPlan>) {
  return [result.selected, ...result.alternatives].filter((item): item is StackOption => Boolean(item));
}

describe("Slice 3 pack cash consumption baseline and savings", () => {
  it("COST-01 pack and quantity truth reconcile in integer minor units", () => {
    const snapshot = sampleValueSnapshot();
    const result = matchPlan({ snapshot, state: intentState(snapshot) });
    const complete =
      optionsOf(result).find((item) => item.role === "complete") ?? result.selected;
    assert.ok(complete);
    const mag = complete.basket.find((item) => item.productName.includes("Magnesium"));
    assert.ok(mag);
    assert.equal(mag.servingsPerPack, 90);
    assert.equal(mag.quantity, 1);
    assert.equal(mag.lineTotalMinor, oracleLineTotal(mag.unitPriceMinor, mag.quantity));
    assert.equal(
      mag.availableServings,
      oracleAvailableServings(mag.servingsPerPack ?? 0, mag.quantity)
    );
    assert.equal(
      mag.daysOfSupply,
      oracleDaysSupplied(mag.servingsPerPack ?? 0, mag.quantity, mag.servingsPerDay)
    );
    assert.notEqual(mag.daysOfSupply, 30);
    const published = publicBasketItem(mag);
    assert.notEqual(published.daysOfSupply, 30);
    const economics = complete.economics;
    assert.ok(economics);
    assert.equal(
      economics.firstOrderSubtotalMinor + economics.shippingMinor + economics.otherCustomerCostMinor,
      economics.cashTotalMinor
    );
  });

  it("COST-02 separates cash from consumption and keeps long-supply leftovers", () => {
    const snapshot = sampleValueSnapshot();
    const result = matchPlan({ snapshot, state: intentState(snapshot) });
    const complete =
      optionsOf(result).find((item) => item.role === "complete") ?? result.selected;
    assert.ok(complete);
    const mag = complete.basket.find((item) => item.productName.includes("Magnesium"));
    assert.ok(mag?.servingsPerPack);
    const shipping = complete.economics?.shippingMinor ?? 0;
    assert.equal(
      mag.leftoverServings30,
      oracleLeftoverServings({
        dailyServings: mag.servingsPerDay,
        horizonDays: 30,
        servingsPerPack: mag.servingsPerPack
      })
    );
    assert.ok((mag.leftoverServings30 ?? 0) > 0);
    assert.equal(
      mag.leftoverServings90,
      oracleLeftoverServings({
        dailyServings: mag.servingsPerDay,
        horizonDays: 90,
        servingsPerPack: mag.servingsPerPack
      })
    );
    assert.equal(mag.replenishmentDay, mag.daysOfSupply);
    const magCash30 = oracleCashThroughHorizon({
      dailyServings: mag.servingsPerDay,
      horizonDays: 30,
      servingsPerPack: mag.servingsPerPack,
      shippingMinor: 0,
      unitPriceMinor: mag.unitPriceMinor
    });
    const magUse30 = oracleConsumptionThroughHorizon({
      dailyServings: mag.servingsPerDay,
      horizonDays: 30,
      servingsPerPack: mag.servingsPerPack,
      unitPriceMinor: mag.unitPriceMinor
    });
    assert.notEqual(magCash30, magUse30);
    assert.ok(complete.economics);
    assert.notEqual(complete.economics.cash30DayMinor, complete.economics.consumption30DayMinor);
    assert.notEqual(complete.economics.cash90DayMinor, complete.economics.consumption90DayMinor);
    void shipping;
  });

  it("COST-03 savings use a comparable baseline and avoided new cash only", () => {
    const snapshot = sampleValueSnapshot();
    const magProduct = snapshot.products[1]!;
    const mag = snapshot.supplements[1]!;
    const state = {
      ...intentState(snapshot),
      currentSupplements: [
        {
          dailyAmount: 150,
          daysRemaining: 90,
          name: mag.name,
          productId: magProduct.productId,
          supplementId: mag.supplementId,
          unit: "mg" as const
        }
      ]
    };
    const result = matchPlan({ snapshot, state });
    const recommended = result.selected;
    assert.ok(recommended?.economics);
    const economics = recommended.economics;
    assert.equal(economics.baseline.type, "separate_direct_products");
    assert.ok(economics.baseline.lines.length > 0);
    const optionCash = economics.cash90DayMinor;
    const baselineCash = economics.baseline.cash90DayMinor;
    const expected = oracleSavings(baselineCash, optionCash);
    assert.equal(economics.savings90DayMinor, expected.amount);
    if (baselineCash === 0) {
      assert.equal(economics.savings90DayPercent, null);
    } else {
      assert.equal(economics.savings90DayPercent, expected.percent);
    }
    assert.ok(economics.deltas);
    assert.equal(typeof economics.deltas.coverage, "number");
    assert.equal(typeof economics.deltas.products, "number");
    assert.equal(typeof economics.deltas.pills, "number");
    assert.equal(typeof economics.deltas.administrations, "number");
    assert.equal(
      recommended.basket.some((item) => item.productId === magProduct.productId),
      false
    );
  });

  it("COST-04 never presents a core-losing cheaper basket as the money-saving recommendation", () => {
    const snapshot = sampleValueSnapshot();
    const creatineId = snapshot.supplements[0]!.supplementId;
    const result = matchPlan({ snapshot, state: intentState(snapshot) });
    const options = optionsOf(result);
    const recommended = options.find((item) => item.recommended);
    assert.ok(recommended);
    const creatineRow = recommended.coverage.find((row) => row.supplementId === creatineId);
    assert.ok(creatineRow);
    assert.ok(
      creatineRow.status === "covered" ||
        creatineRow.status === "already_covered" ||
        (creatineRow.coveragePercent ?? 0) >= 90
    );
    for (const option of options) {
      const core = option.coverage.find((row) => row.supplementId === creatineId);
      if (core && core.status !== "covered" && core.status !== "already_covered") {
        assert.equal(option.recommended, false);
        assert.equal(option.economics?.equivalent, false);
        assert.notEqual(option.role, "minimum_core");
      }
      if ((option.economics?.savings90DayMinor ?? 0) <= 0) {
        assert.notEqual(option.economics?.savingClaim, "positive");
      }
    }
  });
});
