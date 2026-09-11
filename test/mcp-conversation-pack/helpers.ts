import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { PlanSuccessWire } from "../../lib/agentic/contract/outputs.ts";
import type { PlanResult, StackOption } from "../../lib/agentic/plan/types.ts";
import { aug25PlanState } from "../../lib/agentic/plan/mode-d.ts";
import { runtime } from "../ax-refinement/helpers.ts";
import { issueCapability } from "../../lib/agentic/capabilities.ts";

export function d3Fixture(): PlanSuccessWire {
  // Preserve the historical wire capture; adapt its private basket keys only for current internal fixtures.
  return JSON.parse(readFileSync(new URL("./d3-fixture.json", import.meta.url), "utf8"), (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/OptionId/g, "CandidateKey").replace(/optionId/g, "candidateKey"), item])) : value);
}
// An in-memory committed record for presentation tests, not a reconstructed
// historical matching run. Public products, doses and prices are frozen above.
export function internalFixture(): PlanResult {
  const wire = d3Fixture();
  const options = wire.options!.map(option => ({ ...option, basket: option.basket,
    dailyPills: option.stackSummary.totalDailyPills, totalPriceMinor: option.stackSummary.totalPriceMinor,
    snapshotId: "presentation-fixture", matcherVersion: "unchanged", safety: { guidance: [] } })) as unknown as StackOption[];
  const selected = options.find(option => option.candidateKey === wire.candidateKey); assert.ok(selected?.basket.length);
  return { status: "ready", summary: wire.summary, selected, alternatives: options.filter(option => option !== selected),
    basket: selected.basket, coverage: selected.coverage, safetyGuidance: [], questions: [], changeSummary: [], unmetRequirements: [],
    requestSnapshot: aug25PlanState(), contractVersion: AGENTIC_CONTRACT_VERSION, matcherTelemetry: { snapshotId: "presentation-fixture", matcherVersion: "unchanged" }
  } as unknown as PlanResult;
}
export async function storedFixture(result: PlanResult) {
  const app = runtime("conversation-pack"), now = app.now!, id = "conversation-pack-plan";
  await app.store.insertPlan({ id, currentRevision: 1, ...app.scope, createdAt: now, updatedAt: now });
  await app.store.insertPlanRevision({ planId: id, revision: 1, result, requestSnapshot: result.requestSnapshot,
    status: result.status, createdAt: now, availabilityAsOf: now, catalogueVersion: "fixture", guidanceRulesVersion: "unchanged" });
  const { handle } = await issueCapability({ config: app.config, store: app.store, scope: app.scope, now, resourceId: id,
    resourceType: "plan", allowedActions: ["plan.read"] });
  return { app, handle };
}
