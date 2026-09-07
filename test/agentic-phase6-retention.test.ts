import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS
} from "../lib/agentic/contract/instructions.ts";
import { fixtureSnapshot, recognisedSupplementNames } from "../lib/agentic/catalogue/fixtures.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { CLIENT_GUIDE_URI, readContractResource } from "../lib/agentic/contract/guide.ts";
import { matcherTelemetryFor } from "../lib/agentic/plan/matching.ts";
import { publicPlanFields } from "../lib/agentic/public-mapper.ts";
import { PLAN_MATCH_RETURN_BUDGET_MS } from "../lib/agentic/plan/service.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { DEFAULT_MATCHER_CONFIG } from "../lib/matcher/config.ts";
import { match } from "../lib/matcher/index.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase6-retention",
    products
  };
}

const d3 = qaTarget("d3", 2000);
const omega = qaTarget("omega", 1000);
const mag = qaTarget("mag", 200);
const b12 = qaTarget("b12", 250);

const G_B12_60 = qaProduct({
  facts: [{ amount: 158, key: "b12" }],
  id: "G-B12-60",
  pills: 1,
  priceThb: 90
});
const G_D3 = qaProduct({
  facts: [{ amount: 2000, key: "d3" }],
  id: "G-D3-2000",
  pills: 1,
  priceThb: 160
});
const G_O3 = qaProduct({
  dietary: "fish",
  facts: [{ amount: 1000, key: "omega" }],
  form: "softgel",
  id: "G-O3-FISH-1000",
  omega: "fish",
  pills: 2,
  priceThb: 300
});
const G_MAG = qaProduct({
  facts: [{ amount: 200, key: "mag" }],
  id: "G-MAG-200",
  pills: 1,
  priceThb: 190
});
const G_MULTI_WEAK_B12 = qaProduct({
  facts: [
    { amount: 2000, key: "d3" },
    { amount: 200, key: "mag" },
    { amount: 20, key: "b12" }
  ],
  id: "G-MULTI-WEAK-B12",
  pills: 3,
  priceThb: 80,
  title: "Incidental B12 multi"
});

describe("Phase 6 B12 retention, K2 copy, and latency split", () => {
  it("keeps the B12 contributor and selects the closer two-serving dose", () => {
    const isolated = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [b12]
      }),
      catalog([G_B12_60, G_MULTI_WEAK_B12, G_D3, G_O3, G_MAG])
    );
    assert.ok(isolated.selected);
    assert.equal(isolated.selected.productIds.includes("G-B12-60"), true);
    const coverage = Math.round(
      (isolated.selected.coverageBySubject.get(b12.subjectId) ?? 0) / 100
    );
    assert.equal(coverage, 100);
    assert.equal(isolated.selected.doseFit?.total, 0.264);
    assert.equal(isolated.selected.doseFit?.perTarget[0]?.exposure, 316);

    const combined = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag, b12]
      }),
      catalog([G_B12_60, G_MULTI_WEAK_B12, G_D3, G_O3, G_MAG])
    );
    assert.ok(combined.selected);
    assert.equal(combined.selected.productIds.includes("G-B12-60"), true);
    const combinedB12 = Math.round(
      (combined.selected.coverageBySubject.get(b12.subjectId) ?? 0) / 100
    );
    assert.equal(combinedB12 >= 55, true);
  });

  it("does not degrade B12 from 60% to incidental 8% or 0%", () => {
    const combined = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag, b12]
      }),
      catalog([G_B12_60, G_MULTI_WEAK_B12, G_D3, G_O3, G_MAG])
    );
    const percent = Math.round(
      (combined.selected?.coverageBySubject.get(b12.subjectId) ?? 0) / 100
    );
    assert.equal(percent === 8, false);
    assert.equal(percent === 0, false);
    assert.equal(percent >= 55, true);
  });

  it("lists K2 and MK-7 as recognised and not leftover not_in_catalogue", async () => {
    const names = recognisedSupplementNames();
    assert.equal(names.includes("Vitamin K2"), true);
    assert.equal(names.includes("MK-7"), true);
    assert.equal(names.includes("Menaquinone-7"), true);
    assert.ok(AGENTIC_SERVER_INSTRUCTIONS.includes(CLIENT_GUIDE_URI));
    const guide = readContractResource(CLIENT_GUIDE_URI)?.contents[0]?.text ?? "";
    assert.match(guide, /Vitamin K2 aliases resolve while nutrient forms and units remain distinct/);
    assert.doesNotMatch(guide, /K2 becomes leftover not_in_catalogue/i);
    const snapshot = fixtureSnapshot();
    const k2 = snapshot.supplements.find(item => item.name === "Vitamin K2");
    assert.ok(k2);
    for (const name of ["Vitamin K2", "MK-7", "Menaquinone-7"]) {
      const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
        locale: "en", destinationCountry: "TH", optimization: "balanced", profile: {}, requirements: {},
        targets: [{ name, amount: 100, unit: "mcg" }]
      } });
      assert.ok(!("error" in normalized), JSON.stringify(normalized));
      assert.equal(normalized.state.targets[0]?.supplementId, k2.supplementId);
      assert.equal(normalized.state.targets[0]?.amount, 100);
      assert.equal(normalized.state.targets[0]?.unit, "mcg");
      assert.equal(normalized.state.leftovers.length, 0);
    }
    assert.doesNotMatch(
      AGENTIC_TOOL_DESCRIPTIONS.plan,
      /Recognised names include[\s\S]*Vitamin K2/
    );
  });

  it("records ackMs, matchMs and searchDeadlineMs on DEV matcher telemetry", () => {
    assert.equal(PLAN_MATCH_RETURN_BUDGET_MS, 3_000);
    const telemetry = matcherTelemetryFor({
      ackMs: 180,
      leftovers: [],
      matchMs: 420,
      searchDeadlineMs: DEFAULT_MATCHER_CONFIG.searchDeadlineMs,
      selected: null,
      state: aug25PlanState({ targets: [aug25PlanState().targets[0]!] })
    });
    assert.equal(telemetry.ackMs, 180);
    assert.equal(telemetry.matchMs, 420);
    assert.equal(telemetry.searchDeadlineMs, 2_500);
    assert.ok(telemetry.targetSetHash);
    const payload = publicPlanFields({
      alternatives: [],
      basket: [],
      changeSummary: [],
      coverage: [],
      leftovers: [],
      matcherTelemetry: telemetry,
      questions: [],
      safetyGuidance: [],
      selected: null,
      status: "blocked",
      summary: "blocked",
      unmetRequirements: []
    });
    assert.equal("matcherTelemetry" in payload, false);
    assert.equal(JSON.stringify(payload).includes("ackMs"), false);
    assert.equal(JSON.stringify(payload).includes("matchMs"), false);
    assert.equal(JSON.stringify(payload).includes("matcherTelemetry"), false);
    assert.equal(typeof (payload as { canonical?: { snapshotId?: string } }).canonical?.snapshotId, "string");
  });
});
