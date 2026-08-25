import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS
} from "../lib/agentic/contract/instructions.ts";
import { recognisedSupplementNames } from "../lib/agentic/catalogue/fixtures.ts";
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
  it("keeps an isolated 60% B12 SKU when D3, omega-3 and magnesium are added", () => {
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
    assert.equal(coverage >= 55 && coverage < 90, true);

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
    const copy = await readFile("lib/agentic/contract/instructions.ts", "utf8");
    assert.doesNotMatch(copy, /K2 becomes leftover not_in_catalogue/i);
    assert.match(
      AGENTIC_SERVER_INSTRUCTIONS,
      /Vitamin K2, MK-7 and Menaquinone-7 map to one recognised supplement and do not become leftover not_in_catalogue/
    );
    assert.match(AGENTIC_TOOL_DESCRIPTIONS.plan, /Vitamin K2, MK-7 and Menaquinone-7/);
  });

  it("records ackMs, matchMs and searchDeadlineMs on DEV matcher telemetry", () => {
    assert.equal(PLAN_MATCH_RETURN_BUDGET_MS, 1_500);
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
    const publicTelemetry = payload.matcherTelemetry as {
      ackMs?: number;
      matchMs?: number;
      searchDeadlineMs?: number;
    };
    assert.equal(publicTelemetry.ackMs, 180);
    assert.equal(publicTelemetry.matchMs, 420);
    assert.equal(publicTelemetry.searchDeadlineMs, 2_500);
    assert.equal(JSON.stringify(payload).toLowerCase().includes("snapshot"), false);
  });
});
