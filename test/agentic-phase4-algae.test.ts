import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

describe("Phase 4 algae source is intrinsic to the target name", () => {
  it("keeps algae_only as its own flag and deletes the Omega-3 rewrite copy", async () => {
    const planCopy = await readFile("lib/agentic/contract/instructions.ts", "utf8");
    assert.match(planCopy, /algae_only remains its own flag/);
    assert.doesNotMatch(planCopy, /Algae omega-3 matches Omega-3/);
    assert.match(AGENTIC_SERVER_INSTRUCTIONS, /algae-named omega-3 target is algae-source/);
    assert.match(AGENTIC_SERVER_INSTRUCTIONS, /fish DHA\/EPA is wrong_source/);
    assert.match(
      AGENTIC_TOOL_DESCRIPTIONS.plan,
      /algae-named omega-3 target is algae-source even without that flag/
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
    assert.equal("error" in request, false);
    if ("error" in request) {
      return;
    }
    assert.equal(request.omega3SourcePreference, "algae_only");
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
    assert.equal("error" in request, false);
    if ("error" in request) {
      return;
    }
    assert.equal(request.omega3SourcePreference, "fish_allowed");
  });

  it("normalize infers algae_only from Algae omega-3 even when fish_allowed is set", async () => {
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
    assert.equal("error" in normalized, false);
    if ("error" in normalized) {
      return;
    }
    assert.equal(normalized.state.targets[0]?.name, "Omega-3");
    assert.equal(normalized.state.targets[0]?.requestedName, "Algae omega-3");
    assert.equal(normalized.state.requirements.omega3SourcePreference, "algae_only");

    const request = toCanonicalRequest(normalized.state);
    assert.equal("error" in request, false);
    if ("error" in request) {
      return;
    }
    assert.equal(request.omega3SourcePreference, "algae_only");
  });

  it("does not select fish oil for an algae-named target after name rewrite", () => {
    const omega = supplement("Omega-3");
    const snapshot = fixtureSnapshot();
    const matched = matchPlan({
      snapshot,
      state: {
        ...aug25PlanState({
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
        targets: [qaTarget("omega", 500, "mg", "Algae omega-3")]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(result.selected?.productIds, ["G-O3-ALGAE-500"]);
    assert.ok(result.rejected.some((item) => item.reason === "wrong_source"));
  });

  it("M-01 still selects combo + fish oil when the target is plain Omega-3", () => {
    const result = match(
      qaRequest({ optimization: "fewest_pills" }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(result.selected?.productIds, [
      "G-BASE-COMBO",
      "G-O3-FISH-1000"
    ]);
    assert.equal(result.selected?.dailyPills, 4);
    assert.equal(
      impliedOmegaPreference("any", "any", ["Omega-3"]),
      "any"
    );
  });
});
