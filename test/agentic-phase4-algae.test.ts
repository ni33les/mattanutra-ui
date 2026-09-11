import { closestDoseOption } from "./matcher/flexible-v5-fixtures.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS
} from "../lib/agentic/contract/instructions.ts";
import { fixtureSnapshot, FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { matchPlan, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import type { AgenticConfig } from "../lib/agentic/config.ts";
import { CLIENT_GUIDE_URI, readContractResource } from "../lib/agentic/contract/guide.ts";
import { impliedOmegaPreference, targetImpliesAlgaeOmega } from "../lib/matcher/canonicalizer.ts";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function supplement(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function testConfig(): AgenticConfig {
  return {
    activeMarkets: ["TH"],
    buildId: "phase4-algae",
    capabilitySecret: "test",
    checkoutTtlMs: 1000,
    continuation: "polling_only",
    environment: "dev",
    internalQaHarness: true,
    paymentProvider: "mock",
    planTtlMs: 1000,
    siteUrl: "http://127.0.0.1",
    thailandRetailerAdapter: "mock_thailand",
    userAccountRequired: false
  };
}

describe("Phase 4 source preservation under contract 7", () => {
  it("documents the explicit source choice required by the exact algae alias", () => {
    const resource = readContractResource(CLIENT_GUIDE_URI);
    assert.ok(resource);
    const planCopy = resource.contents[0].text;
    assert.match(planCopy, /Algae Omega-3.*explicit algae_only/i);
    assert.match(planCopy, /source.*preserv/i);
    assert.match(AGENTIC_SERVER_INSTRUCTIONS, /info is optional; client_guide provides templates and plan_schema returns this same unified schema/);
    assert.match(
      AGENTIC_TOOL_DESCRIPTIONS.plan,
      /exclusions, diet and physical quantities bind/
    );
  });

  it("reads the raw requested name after catalogue rewrite to Omega-3", () => {
    const omega = supplement("Omega-3");
    const request = toCanonicalRequest(
      aug25PlanState({
        requirements: { omega3SourcePreference: "fish_allowed" },
        targets: [
          {
            amount: 1000,
            name: omega.name,
            requestedName: "Algae omega-3",
            supplementId: omega.supplementId,
            unit: "mg"
          }
        ]
      })
    );
    assert.ok(!("error" in request));
    assert.equal(request.omega3SourcePreference, "fish_allowed");
    assert.equal(targetImpliesAlgaeOmega("Algae omega-3"), true);
    assert.equal(targetImpliesAlgaeOmega(omega.name), false);
  });

  it("does not force algae_only when the requested name is plain Omega-3", () => {
    const omega = supplement("Omega-3");
    const request = toCanonicalRequest(
      aug25PlanState({
        requirements: { omega3SourcePreference: "fish_allowed" },
        targets: [
          {
            amount: 1000,
            name: omega.name,
            requestedName: "Omega-3",
            supplementId: omega.supplementId,
            unit: "mg"
          }
        ]
      })
    );
    assert.ok(!("error" in request));
    assert.equal(request.omega3SourcePreference, "fish_allowed");
  });

  it("normalize preserves fish_allowed and explains the unresolved algae alias", async () => {
    const normalized = await normalizePlanRequest({
      config: testConfig(),
      snapshot: fixtureSnapshot(),
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: { omega3SourcePreference: "fish_allowed" },
        targets: [{ amount: 1000, name: "Algae omega-3", unit: "mg" }]
      }
    });
    assert.ok(!("error" in normalized));
    assert.equal(normalized.state.targets.length, 0);
    assert.equal(normalized.state.leftovers[0]?.name, "Algae omega-3");
    assert.match(normalized.state.leftovers[0]?.note ?? "", /algae_only/);
    assert.equal(normalized.state.requirements.omega3SourcePreference, "fish_allowed");

    const request = toCanonicalRequest(normalized.state);
    assert.ok(!("error" in request));
    assert.equal(request.omega3SourcePreference, "fish_allowed");
  });

  it("does not select fish oil for an algae-named target after name rewrite", () => {
    const omega = supplement("Omega-3");
    const snapshot = fixtureSnapshot();
    const matched = matchPlan({
      snapshot,
      state: {
        ...aug25PlanState({
          requirements: { omega3SourcePreference: "algae_only" },
          targets: [
            {
              amount: 1000,
              name: omega.name,
              requestedName: "Algae omega-3",
              supplementId: omega.supplementId,
              unit: "mg"
            }
          ]
        })
      }
    });
    const names = (matched.selected?.basket ?? []).map((item) => item.productName);
    assert.equal(
      names.some((name) => /fish oil|sesamin|3-6-9|lecithin|krill/i.test(name)),
      false
    );
    assert.ok(names.some((name) => /algae/i.test(name)));
    assert.ok(matched.rejected.some((item) => item.reason === "wrong_source"));
  });

  it("E-02 still selects G-O3-ALGAE-500 for an algae-named target", () => {
    const result = match(
      qaRequest({
        omega3SourcePreference: "algae_only",
        targets: [qaTarget("omega", 500, "mg", "Algae omega-3")]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(result.selected?.productIds, ["G-O3-ALGAE-500"]);
    assert.ok(result.rejected.some((item) => item.reason === "wrong_source"));
  });

  it("M-01 still selects combo + algae when the target is plain Omega-3", () => {
    const result = match(
      qaRequest({ optimization: "fewest_pills" }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(closestDoseOption(result)?.productIds, [
      "G-BASE-COMBO",
      "G-O3-ALGAE-500"
    ]);
    assert.equal(closestDoseOption(result)?.dailyPills, 4);
    assert.equal(
      impliedOmegaPreference("any", "any", ["Omega-3"]),
      "any"
    );
    assert.equal(closestDoseOption(result)?.priceMinor, 61000);
    assert.equal(closestDoseOption(result)?.doseFit?.total, 0);
    assert.equal(closestDoseOption(result)?.coveredCount, 5);
  });
});
