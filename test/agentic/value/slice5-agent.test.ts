import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MATCHER_VERSION } from "../../../lib/matcher/config.ts";
import { catalogueSnapshotId } from "../../../lib/agentic/catalogue/freeze.ts";
import { publicProductId, publicSupplementId } from "../../../lib/agentic/contract/ids.ts";
import { matchPlan } from "../../../lib/agentic/plan/matching.ts";
import { evaluateSafety, planStatus, safetyQuestions } from "../../../lib/agentic/plan/safety.ts";
import type {
  CanonicalPlanState,
  PlanResult,
  StackOption
} from "../../../lib/agentic/plan/types.ts";
import { publicPlanFields } from "../../../lib/agentic/public-mapper.ts";
import { canonicalHash } from "../../../lib/agentic/value/canonical.ts";
import { VALUE_PACK_VERSION, VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./sample-catalogue.ts";
import {
  oracleCanonicalHash,
  oracleCanonicalValue,
  oracleExplanation,
  type OraclePublishedPlan
} from "./explain-oracle.ts";

const OMEGA_UUID = "22222222-2222-2222-2222-222222222222";
const MEGA_MAG_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99";

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

function uniqueGuidance(
  options: readonly StackOption[],
  state: CanonicalPlanState
) {
  const seen = new Set<string>();
  const rows = [];

  for (const option of options) {
    for (const row of evaluateSafety({
      coverage: option.coverage,
      locale: "en",
      selected: option,
      state
    })) {
      if (seen.has(row.guidanceId)) {
        continue;
      }

      seen.add(row.guidanceId);
      rows.push(row);
    }
  }

  return rows;
}

function publishPlan(snapshot: ReturnType<typeof sampleValueSnapshot>, state: CanonicalPlanState) {
  const matched = matchPlan({ snapshot, state });
  const options = optionsOf(matched);
  const safetyGuidance = uniqueGuidance(options, state);
  const questions = safetyQuestions({
    alternatives: matched.alternatives,
    guidance: safetyGuidance,
    locale: "en",
    selected: matched.selected,
    shownRevision: 1,
    state,
    unmetRequirements: matched.unmetRequirements
  });
  const status = planStatus({
    guidance: safetyGuidance,
    questions,
    selected: matched.selected,
    state,
    unmetRequirements: matched.unmetRequirements
  });
  const result = {
    alternatives: matched.alternatives,
    basket: matched.selected?.basket ?? [],
    coverage: matched.selected?.coverage ?? [],
    leftovers: matched.leftovers,
    questions,
    requestSnapshot: state,
    safetyGuidance,
    selected: matched.selected,
    status,
    summary: status,
    unmetRequirements: matched.unmetRequirements
  } as PlanResult;
  const published = publicPlanFields(result) as ReturnType<typeof publicPlanFields> &
    OraclePublishedPlan;

  return { matched, options, published, result };
}

function withOmega(snapshot: ReturnType<typeof sampleValueSnapshot>) {
  const omega = {
    acceptedUnits: ["mg", "g"] as const,
    aliases: ["Fish oil", "Omega 3"],
    name: "Omega-3",
    supplementId: publicSupplementId(OMEGA_UUID),
    uuid: OMEGA_UUID
  };

  return {
    ...snapshot,
    products: [
      ...snapshot.products,
      sampleRetailProduct({
        amount: 1000,
        form: "softgel",
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05",
        name: "Omega-3",
        servingLabel: "1 softgel",
        supplementId: omega.supplementId,
        title: "Omega-3 Fish Oil",
        unit: "mg",
        unitPriceMinor: 18000
      })
    ],
    supplements: [...snapshot.supplements, omega]
  };
}

function withCheapMegaMag(snapshot: ReturnType<typeof sampleValueSnapshot>) {
  const mag = snapshot.supplements[1]!;
  return {
    ...snapshot,
    products: [
      ...snapshot.products,
      sampleRetailProduct({
        amount: 2000,
        form: "capsule",
        id: MEGA_MAG_UUID,
        name: "Magnesium",
        servingLabel: "1 capsule",
        supplementId: mag.supplementId,
        title: "Magnesium Mega 2000",
        unit: "mg",
        unitPriceMinor: 900
      })
    ]
  };
}

function shuffleTargets(targets: CanonicalPlanState["targets"], seed: number) {
  const copy = [...targets];
  let state = seed >>> 0;

  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = current;
  }

  return copy;
}

describe("Slice 5 agent explanation safety and determinism", () => {
  it("AGENT-01 one plan response explains recommendation purchases omissions cash burden and next action", () => {
    const snapshot = sampleValueSnapshot();
    const mag = snapshot.supplements[1]!;
    const magProduct = snapshot.products[1]!;
    const { matched, published } = publishPlan(snapshot, {
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
    });
    assert.equal(matched.selected != null, true);
    const explanation = published.explanation;
    assert.ok(explanation);
    const recommended = (published.options ?? []).find((item) => item.recommended);
    assert.ok(recommended);
    const expected = oracleExplanation({
      coverage: recommended.coverage ?? published.coverage,
      nextActions: published.nextActions ?? [],
      option: recommended,
      safetyState: published.acknowledgementStatus ?? published.status ?? ""
    });
    assert.equal(explanation.recommendedOptionId, expected.recommendedOptionId);
    assert.ok(Array.isArray(explanation.purchases));
    assert.ok((explanation.purchases as unknown[]).length >= 1);
    assert.ok(Array.isArray(explanation.retainedCurrent));
    assert.ok((explanation.retainedCurrent as unknown[]).length >= 1);
    assert.ok(Array.isArray(explanation.optionalOmissions));
    assert.ok(Array.isArray(explanation.conditionalDeferrals));
    assert.ok((explanation.conditionalDeferrals as unknown[]).length >= 1);
    assert.equal(typeof explanation.firstOrderCashMinor, "number");
    assert.equal(typeof explanation.cash30DayMinor, "number");
    assert.equal(typeof explanation.cash90DayMinor, "number");
    assert.equal(typeof explanation.savings90DayMinor, "number");
    assert.equal(typeof explanation.pills, "number");
    assert.equal(typeof explanation.administrations, "number");
    assert.equal(typeof explanation.productCount, "number");
    assert.ok(String(explanation.safetyState).length > 0);
    assert.ok(String(explanation.nextAction).length > 0);
    assert.equal(typeof explanation.nextActionKey, "string");
    assert.ok((published.nextActions ?? []).length > 0);

    for (const option of published.options ?? []) {
      assert.ok(Array.isArray(option.coverage));
      assert.ok(option.economics);
      assert.ok(option.burden);
      assert.ok(option.safety);
      assert.ok(Array.isArray(option.productIds));
    }
  });

  it("SAFE-01.A atrial fibrillation and apixaban are assessed on every option", () => {
    const snapshot = sampleValueSnapshot();
    const { published } = publishPlan(snapshot, {
      ...intentState(snapshot),
      conditionCodes: ["atrial_fibrillation"],
      medicationCodes: ["apixaban"]
    });
    assert.ok((published.assessedMedicationCodes ?? []).includes("apixaban"));
    assert.ok((published.assessedConditionCodes ?? []).includes("atrial_fibrillation"));
    const options = published.options ?? [];
    assert.ok(options.length >= 1);
    for (const option of options) {
      assert.ok((option.safety?.assessedMedicationCodes ?? []).includes("apixaban"));
      assert.ok((option.safety?.assessedConditionCodes ?? []).includes("atrial_fibrillation"));
    }
  });

  it("SAFE-01.B apixaban plus omega-3 is a frozen acknowledgement on every option, never a cheaper hard block", () => {
    const snapshot = withOmega(sampleValueSnapshot());
    const omega = snapshot.supplements.find((item) => item.name === "Omega-3")!;
    const { published, options } = publishPlan(snapshot, {
      ...intentState(snapshot),
      conditionCodes: ["atrial_fibrillation"],
      medicationCodes: ["apixaban"],
      targets: [
        ...intentState(snapshot).targets,
        {
          amount: 1000,
          importance: "optional",
          name: omega.name,
          supplementId: omega.supplementId,
          unit: "mg"
        }
      ]
    });
    const coveringOmega = (published.options ?? []).filter((option) =>
      (option.coverage ?? []).some(
        (row) => row.supplementId === omega.supplementId && row.status === "covered"
      )
    );
    assert.ok(coveringOmega.length > 0);
    for (const option of coveringOmega) {
      const interaction = (option.safety?.guidance ?? []).find(
        (row) => row.code === "medication_interaction"
      );
      assert.ok(interaction);
      assert.equal(interaction.action, "acknowledge");
      assert.notEqual(interaction.action, "block");
      assert.ok(String(interaction.ruleId ?? "").length > 0);
      assert.ok(String(interaction.rulesVersion ?? "").length > 0);
    }
    assert.equal(
      options.some((option) => option.economics?.savingClaim === "positive" && option.recommended &&
        option.coverage.every((row) => row.supplementId !== omega.supplementId || row.status !== "covered") &&
        (published.safetyGuidance ?? []).some((row) => row.action === "block")),
      false
    );
  });

  it("SAFE-01.C a cheaper over-UL magnesium is never returned in an option", () => {
    const snapshot = withCheapMegaMag(sampleValueSnapshot());
    const megaId = publicProductId(MEGA_MAG_UUID);
    const { options, published } = publishPlan(snapshot, intentState(snapshot));
    assert.ok(options.length >= 1);
    for (const option of options) {
      assert.equal(
        option.basket.some((item) => item.productId === megaId),
        false
      );
    }
    for (const option of published.options ?? []) {
      assert.equal((option.productIds ?? []).includes(megaId), false);
    }
  });

  it("SAFE-01.D deferred and omitted targets add zero proposed exposure", () => {
    const snapshot = sampleValueSnapshot();
    const d3 = snapshot.supplements[2]!;
    const mag = snapshot.supplements[1]!;
    const { published, options } = publishPlan(snapshot, intentState(snapshot));
    const recommended = (published.options ?? []).find((item) => item.recommended);
    assert.ok(recommended);
    const d3Row = (recommended.coverage ?? published.coverage ?? []).find(
      (row) => row.supplementId === d3.supplementId
    );
    assert.equal(d3Row?.status, "conditional_deferred");
    assert.equal(d3Row?.deliveredAmount ?? 0, 0);
    assert.equal(
      recommended.productIds?.some((id) =>
        snapshot.products.some(
          (product) =>
            product.productId === id && product.contributionSupplementIds.includes(d3.supplementId)
        )
      ),
      false
    );
    const magRow = (recommended.coverage ?? []).find((row) => row.supplementId === mag.supplementId);
    if (magRow?.status === "optional_omitted") {
      assert.equal(
        recommended.productIds?.includes(snapshot.products[1]!.productId),
        false
      );
    }
    for (const option of options) {
      const deferred = option.coverage.find((row) => row.status === "conditional_deferred");
      if (deferred) {
        assert.equal(deferred.deliveredAmount, 0);
        assert.equal(
          option.basket.some((item) =>
            item.contributionSupplementIds.includes(deferred.supplementId)
          ),
          false
        );
      }
    }
  });

  it("SAFE-01.E missing required safety data fails closed", () => {
    const snapshot = sampleValueSnapshot();
    const { published } = publishPlan(snapshot, {
      ...intentState(snapshot),
      medicationCodes: ["mystery_anticoagulant"]
    });
    assert.equal(published.status, "needs_input");
    assert.ok((published.unassessedMedicationCodes ?? []).includes("mystery_anticoagulant"));
  });

  it("SAFE-01.F acknowledgement is scoped to guidance ids and revision", () => {
    const snapshot = withOmega(sampleValueSnapshot());
    const omega = snapshot.supplements.find((item) => item.name === "Omega-3")!;
    const base = {
      ...intentState(snapshot),
      conditionCodes: ["atrial_fibrillation"],
      medicationCodes: ["apixaban"],
      targets: [
        ...intentState(snapshot).targets,
        {
          amount: 1000,
          importance: "optional",
          name: omega.name,
          supplementId: omega.supplementId,
          unit: "mg"
        }
      ]
    };
    const pending = publishPlan(snapshot, base);
    const guidanceIds = (pending.published.safetyGuidance ?? [])
      .filter((row) => row.action === "acknowledge")
      .map((row) => row.guidanceId)
      .filter((id): id is string => Boolean(id));
    assert.ok(guidanceIds.length > 0);
    assert.equal(pending.published.acknowledgementStatus, "pending");

    const wrong = publishPlan(snapshot, {
      ...base,
      safetyAcknowledgement: {
        confirmed: true,
        guidanceIds: ["gdn:not-this-issue"],
        revision: 1
      }
    });
    assert.equal(wrong.published.acknowledgementStatus, "pending");

    const ok = publishPlan(snapshot, {
      ...base,
      safetyAcknowledgement: {
        confirmed: true,
        guidanceIds,
        revision: 1
      }
    });
    assert.equal(ok.published.acknowledgementStatus, "acknowledged");
  });

  it("DET-01.A two canonical runs are byte-identical and keep prices products roles savings and safety", () => {
    const snapshot = sampleValueSnapshot();
    const state = intentState(snapshot);
    const first = publishPlan(snapshot, state);
    const second = publishPlan(snapshot, state);
    const left = oracleCanonicalValue(first.published);
    const right = oracleCanonicalValue(second.published);
    assert.equal(canonicalHash(left), canonicalHash(right));
    assert.equal(oracleCanonicalHash(first.published), oracleCanonicalHash(second.published));
    assert.ok(first.published.canonical);
    assert.equal(first.published.canonical?.hash, second.published.canonical?.hash);
    assert.equal(first.published.canonical?.matcherVersion, MATCHER_VERSION);
    assert.equal(first.published.canonical?.snapshotId, catalogueSnapshotId(snapshot));
    assert.equal(typeof first.published.canonical?.buildId, "string");
    assert.equal(typeof first.published.canonical?.contractVersion, "string");
    assert.equal(first.published.canonical?.packVersion, VALUE_PACK_VERSION);
    assert.ok(String(first.published.canonical?.hash).length >= 32);
    const option = (first.published.options ?? [])[0];
    assert.ok(option);
    assert.equal(typeof option.economics?.cash90DayMinor, "number");
    assert.ok((option.productIds ?? []).length >= 1);
    assert.ok(option.role);
  });

  it("DET-01.B ten fresh plans hash identically", () => {
    const snapshot = sampleValueSnapshot();
    const state = intentState(snapshot);
    const hashes = Array.from({ length: 10 }, () =>
      oracleCanonicalHash(publishPlan(snapshot, state).published)
    );
    assert.equal(new Set(hashes).size, 1);
    const production = Array.from({ length: 10 }, () => {
      const hash = publishPlan(snapshot, state).published.canonical?.hash;
      assert.equal(typeof hash, "string");
      return hash;
    });
    assert.equal(new Set(production).size, 1);
  });

  it("DET-01.C equivalent creatine units normalize identically", () => {
    const snapshot = sampleValueSnapshot();
    const grams = publishPlan(snapshot, intentState(snapshot));
    const milligrams = publishPlan(snapshot, {
      ...intentState(snapshot),
      targets: intentState(snapshot).targets.map((item) =>
        item.name === "Creatine"
          ? { ...item, amount: 3000, unit: "mg" as const }
          : item
      )
    });
    assert.deepEqual(
      (grams.published.options ?? []).map((item) => item.productIds),
      (milligrams.published.options ?? []).map((item) => item.productIds)
    );
    assert.deepEqual(
      (grams.published.options ?? []).map((item) => item.role),
      (milligrams.published.options ?? []).map((item) => item.role)
    );
    assert.equal(grams.published.canonical?.hash, milligrams.published.canonical?.hash);
  });

  it("DET-01.D twenty hidden target-order permutations hash identically", () => {
    const snapshot = sampleValueSnapshot();
    const base = intentState(snapshot);
    const hashes = Array.from({ length: 20 }, (_, index) => {
      const published = publishPlan(snapshot, {
        ...base,
        targets: shuffleTargets(base.targets, index + 1)
      }).published;
      return published.canonical?.hash ?? oracleCanonicalHash(published);
    });
    assert.equal(new Set(hashes).size, 1);
  });

  it("DET-01.E compare fails when price product quantity role savings leftover or safety changes", () => {
    const snapshot = sampleValueSnapshot();
    const published = publishPlan(snapshot, intentState(snapshot)).published;
    const base = oracleCanonicalValue(published);
    const mutated = {
      ...base,
      options: base.options.map((item, index) =>
        index === 0 ? { ...item, cash90DayMinor: (item.cash90DayMinor ?? 0) + 1 } : item
      )
    };
    assert.notEqual(canonicalHash(base), canonicalHash(mutated));
    assert.notEqual(
      canonicalHash(base),
      canonicalHash({
        ...base,
        options: base.options.map((item, index) =>
          index === 0 ? { ...item, productIds: [...item.productIds, "prd_mutated"] } : item
        )
      })
    );
    assert.notEqual(
      canonicalHash(base),
      canonicalHash({
        ...base,
        options: base.options.map((item, index) =>
          index === 0 ? { ...item, role: "mutated-role" } : item
        )
      })
    );
    assert.notEqual(
      canonicalHash(base),
      canonicalHash({
        ...base,
        leftovers: [...base.leftovers, { name: "mutated" }]
      })
    );
    assert.notEqual(
      canonicalHash(base),
      canonicalHash({
        ...base,
        safety: [...base.safety, { action: "block", code: "mutated" }]
      })
    );
  });
});
