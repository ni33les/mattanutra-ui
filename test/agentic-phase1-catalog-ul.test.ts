import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import {
  ceilingsForSubjects,
  findReferenceNutrient,
  SUPPLEMENTAL_UL_REFERENCE
} from "../lib/agentic/catalogue/supplemental-ul-reference.ts";
import { upperLimitAmount } from "../lib/agentic/plan/limits.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { evaluateSafety, planStatus } from "../lib/agentic/plan/safety.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";

function installFixtureCatalogCeilings() {
  setMatcherSafetyCeilings(
    ceilingsForSubjects(
      FIXTURE_SUPPLEMENTS.flatMap((item) => [
        { aliases: item.aliases, id: item.supplementId, name: item.name },
        { aliases: item.aliases, id: item.uuid, name: item.name }
      ])
    )
  );
}

describe("Phase 1 catalog threshold table", () => {
  it("accounts for every matching fixture nutrient in the reference table", () => {
    const missing: string[] = [];

    for (const item of FIXTURE_SUPPLEMENTS) {
      const hasUl = findReferenceNutrient(item.name);
      const noUl = SUPPLEMENTAL_UL_REFERENCE.noEstablishedSupplementalUl.some(
        (name) => name.toLowerCase() === item.name.toLowerCase()
      );

      if (!hasUl && !noUl) {
        missing.push(item.name);
      }

      if (hasUl && noUl) {
        assert.fail(`${item.name} cannot both have a UL and be listed as no-UL`);
      }
    }

    assert.deepEqual(missing, []);
  });

  it("requires adult and child_4_8 supplemental bands for every referenced UL nutrient", () => {
    for (const nutrient of SUPPLEMENTAL_UL_REFERENCE.nutrients) {
      assert.equal(nutrient.sourceScope, "supplemental");
      const stages = new Set(nutrient.bands.map((band) => band.lifeStage));
      assert.equal(stages.has("adult"), true, `${nutrient.name} missing adult`);
      assert.equal(
        stages.has("child_4_8"),
        true,
        `${nutrient.name} missing child_4_8`
      );
    }
  });

  it("pins iron adult and pregnancy bands to 45 mg from the reference, not a matcher constant", () => {
    const iron = findReferenceNutrient("Iron");
    assert.ok(iron);
    assert.equal(
      iron.bands.find((band) => band.lifeStage === "adult")?.maxAmount,
      45
    );
    assert.equal(
      iron.bands.find((band) => band.lifeStage === "pregnant")?.maxAmount,
      45
    );
    const matcher = readFileSync("lib/matcher/safety-ceilings.ts", "utf8");
    assert.doesNotMatch(matcher, /maxAmount:\s*45/);
    assert.doesNotMatch(matcher, /return 45/);
  });

  it("reports pregnancy iron against catalog 45 mg and does not ready 48 mg", () => {
    installFixtureCatalogCeilings();
    const iron = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Iron");
    assert.ok(iron);
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "phase1-iron"
    });
    const state = aug25PlanState({
      profile: { ageYears: 30, lifeStage: "pregnant", sex: "female" },
      targets: [
        {
          amount: 48,
          name: "Iron",
          supplementId: iron.supplementId,
          unit: "mg"
        }
      ]
    });
    assert.equal(
      upperLimitAmount("Iron", "mg", {
        ceilings: ceilingsForSubjects([
          { aliases: iron.aliases, id: iron.supplementId, name: iron.name }
        ]),
        profile: state.profile,
        subjectId: iron.supplementId
      }),
      45
    );
    const matched = matchPlan({ snapshot, state });
    const row = matched.selected?.coverage[0];
    if (row) {
      assert.equal(row.upperLimitAmount, 45);
      assert.notEqual(row.upperLimitAmount, 100);
    }
    const guidance = evaluateSafety({
      locale: "en",
      selected: matched.selected,
      state
    });
    const status = planStatus({
      guidance,
      questions: [],
      selected: matched.selected,
      state,
      unmetRequirements: matched.unmetRequirements
    });
    assert.notEqual(status, "ready");
    resetMatcherSafetyCeilings();
  });
});
