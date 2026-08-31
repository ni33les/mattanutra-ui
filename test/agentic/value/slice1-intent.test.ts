import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AGENTIC_INPUT_SCHEMAS, validateToolInput } from "../../../lib/agentic/contract/index.ts";
import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import { planStatus } from "../../../lib/agentic/plan/safety.ts";
import { publicCoverage } from "../../../lib/agentic/public-mapper.ts";
import type { CanonicalPlanState } from "../../../lib/agentic/plan/types.ts";
import { VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";

function intentPlanArgs() {
  return {
    idempotencyKey: "value-pack-val01-intent-fields-01",
    operation: "create",
    request: {
      destinationCountry: "TH",
      locale: "en",
      optimization: "lowest_cost",
      profile: { ageYears: 35, lifeStage: "adult", sex: "female" },
      requirements: {},
      targets: [
        {
          acceptableRange: {
            maximum: VALUE_ROLE_REQUEST.creatine.maximum,
            minimum: VALUE_ROLE_REQUEST.creatine.minimum,
            unit: VALUE_ROLE_REQUEST.creatine.unit
          },
          amount: VALUE_ROLE_REQUEST.creatine.amount,
          importance: "core",
          name: "Creatine",
          unit: VALUE_ROLE_REQUEST.creatine.unit
        },
        {
          amount: VALUE_ROLE_REQUEST.magnesium.amount,
          importance: "optional",
          name: "Magnesium",
          unit: VALUE_ROLE_REQUEST.magnesium.unit
        },
        {
          amount: VALUE_ROLE_REQUEST.vitaminD3.amount,
          importance: "conditional",
          name: "Vitamin D3",
          prerequisite: {
            nextAction: "Confirm vitamin D status with a clinician.",
            reasonCode: "vitamin_d_status_unknown",
            status: "unsatisfied"
          },
          unit: VALUE_ROLE_REQUEST.vitaminD3.unit
        }
      ]
    }
  };
}

describe("Slice 1 target intent and conditional no-sale", () => {
  it("VAL-01.A1 accepts importance, range and prerequisite without unexpected_property", () => {
    const issue = validateToolInput(AGENTIC_INPUT_SCHEMAS.plan, intentPlanArgs());
    assert.equal(issue, null);
  });

  it("VAL-01 and VAL-03 preserve intent on a retail-shaped snapshot", async () => {
    const { freezeLiveThailandCatalogue, isUsableLiveFreeze } = await import(
      "../../../lib/agentic/value/freeze.ts"
    );
    const freeze = await freezeLiveThailandCatalogue("TH");

    if (!isUsableLiveFreeze(freeze)) {
      return;
    }

    const creatine = freeze.snapshot.supplements.find(
      (item) => item.name.toLowerCase() === "creatine"
    );
    const magnesium = freeze.snapshot.supplements.find(
      (item) => item.name.toLowerCase() === "magnesium"
    );
    const d3 = freeze.snapshot.supplements.find((item) =>
      item.name.toLowerCase().includes("vitamin d")
    );

    if (!creatine || !magnesium || !d3) {
      return;
    }

    const state: CanonicalPlanState = {
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

    const first = matchPlan({ snapshot: freeze.snapshot, state });
    const second = matchPlan({ snapshot: freeze.snapshot, state });
    const coverage = first.selected?.coverage ?? first.leftovers;
    const publicRows = (first.selected?.coverage ?? []).map((row) => publicCoverage(row));
    const d3Row = publicRows.find((row) => row.supplementId === d3.supplementId);
    const creatineRow = publicRows.find((row) => row.supplementId === creatine.supplementId);
    const magRow = publicRows.find((row) => row.supplementId === magnesium.supplementId);
    const status = planStatus({
      guidance: [],
      questions: [],
      selected: first.selected,
      state,
      unmetRequirements: first.unmetRequirements
    });

    assert.equal(publicRows.length, 3);
    assert.equal(creatineRow?.importance, "core");
    assert.equal(magRow?.importance, "optional");
    assert.equal(d3Row?.importance, "conditional");
    assert.equal(d3Row?.status, "conditional_deferred");
    assert.equal(d3Row?.deliveredAmount, 0);
    assert.equal(d3Row?.reasonCode, "vitamin_d_status_unknown");
    assert.equal(d3Row?.nextAction, "Confirm vitamin D status with a clinician.");
    assert.equal(
      (first.selected?.basket ?? []).some((item) =>
        item.contributionSupplementIds.includes(d3.supplementId)
      ),
      false
    );
    assert.notEqual(status, "ready");
    assert.equal(canonicalHash(coverage), canonicalHash(
      (second.selected?.coverage ?? second.leftovers)
    ));

    const onlyD3: CanonicalPlanState = {
      ...state,
      targets: state.targets.filter((item) => item.supplementId === d3.supplementId)
    };
    const deferredOnly = matchPlan({ snapshot: freeze.snapshot, state: onlyD3 });
    const deferredStatus = planStatus({
      guidance: [],
      questions: [],
      selected: deferredOnly.selected,
      state: onlyD3,
      unmetRequirements: deferredOnly.unmetRequirements
    });
    assert.equal((deferredOnly.selected?.basket ?? []).length, 0);
    assert.ok(deferredStatus === "needs_input" || deferredStatus === "no_purchase");
    assert.notEqual(deferredStatus, "ready");
  });
});
