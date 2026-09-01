import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import { publicCoverage } from "../../../lib/agentic/public-mapper.ts";
import type { CanonicalPlanState, StackOption } from "../../../lib/agentic/plan/types.ts";
import { VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { sampleValueSnapshot } from "./sample-catalogue.ts";
import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";

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

function optionList(selected: StackOption | null, alternatives: readonly StackOption[]) {
  return [selected, ...alternatives].filter((item): item is StackOption => Boolean(item));
}

describe("Slice 2 value options and current supplements", () => {
  it("VAL-02 returns one to three labelled options from one lowest_cost request", () => {
    const snapshot = sampleValueSnapshot();
    const state = intentState(snapshot);
    const first = matchPlan({ snapshot, state });
    const second = matchPlan({ snapshot, state });
    const options = optionList(first.selected, first.alternatives);
    const creatineId = snapshot.supplements[0]!.supplementId;
    const magId = snapshot.supplements[1]!.supplementId;
    const d3Id = snapshot.supplements[2]!.supplementId;
    const magProductId = snapshot.products[1]!.productId;
    const d3ProductIds = new Set(
      snapshot.products.filter((item) => item.contributionSupplementIds.includes(d3Id)).map((item) => item.productId)
    );

    assert.ok(options.length >= 1 && options.length <= 3);
    assert.equal(options.filter((item) => item.recommended).length, 1);
    const core = options.find((item) => item.role === "minimum_core");
    assert.ok(core);
    assert.equal(
      core.coverage.find((row) => row.supplementId === creatineId)?.status === "covered" ||
        (core.coverage.find((row) => row.supplementId === creatineId)?.coveragePercent ?? 0) >= 90,
      true
    );
    assert.equal(
      core.basket.some((item) => d3ProductIds.has(item.productId)),
      false
    );
    const magRow = core.coverage.find((row) => row.supplementId === magId);
    assert.ok(magRow?.status === "optional_omitted" || magRow?.status === "covered");
    const recommended = options.find((item) => item.recommended);
    assert.equal(recommended?.role, "minimum_core");
    const signatures = new Set(
      options.map((item) =>
        item.basket.map((row) => `${row.productId}:${row.quantity}`).slice().sort().join("|")
      )
    );
    assert.equal(signatures.size, options.length);
    const extra = options.filter((item) => item.optionId !== core.optionId);
    for (const option of extra) {
      assert.ok(option.tradeOff?.cash90DayDeltaMinor != null);
      assert.ok(option.tradeOff?.coverageDelta != null);
      assert.ok(option.tradeOff?.dailyPillsDelta != null);
    }
    assert.equal(
      canonicalHash(options.map((item) => item.optionId)),
      canonicalHash(optionList(second.selected, second.alternatives).map((item) => item.optionId))
    );
    void magProductId;
  });

  it("VAL-04 retains current magnesium instead of buying it", () => {
    const snapshot = sampleValueSnapshot();
    const state = intentState(snapshot);
    const mag = snapshot.supplements[1]!;
    const magProduct = snapshot.products[1]!;
    const creatineId = snapshot.supplements[0]!.supplementId;
    const d3Id = snapshot.supplements[2]!.supplementId;
    const withCurrent: CanonicalPlanState = {
      ...state,
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
    };
    const retained = matchPlan({ snapshot, state: withCurrent });
    const recommended = retained.selected;
    assert.ok(recommended);
    const magCoverage = recommended.coverage.find((row) => row.supplementId === mag.supplementId);
    const publicRow = magCoverage ? publicCoverage(magCoverage) : null;
    assert.equal(publicRow?.status, "already_covered");
    assert.equal(
      (publicRow?.contributors ?? []).some(
        (item) => item.source === "current" && item.productId === magProduct.productId
      ),
      true
    );
    assert.equal(
      recommended.basket.some((item) => item.productId === magProduct.productId),
      false
    );
    assert.equal(
      recommended.retainedCurrent?.some((item) => item.supplementId === mag.supplementId),
      true
    );
    const withoutCurrent = matchPlan({ snapshot, state });
    const restored = withoutCurrent.selected ?? withoutCurrent.alternatives.find((item) => item.role === "complete");
    assert.ok(
      restored?.basket.some((item) => item.productId === magProduct.productId) ||
        withoutCurrent.alternatives.some((item) =>
          item.basket.some((row) => row.productId === magProduct.productId)
        )
    );
    assert.equal(
      recommended.coverage.find((row) => row.supplementId === creatineId)?.importance,
      "core"
    );
    assert.equal(
      recommended.coverage.find((row) => row.supplementId === d3Id)?.status,
      "conditional_deferred"
    );
  });
});
