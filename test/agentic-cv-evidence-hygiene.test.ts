import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidence, significantCvEvidence } from "./agentic/value/impl-evidence.ts";

function evidence(response: Record<string, unknown>, request = { targets: [{ amount: 100, name: "Magnesium", unit: "mg" }] }) {
  return significantCvEvidence(buildEvidence({
    assertions: [{ id: "same-passing-check", expected: true, observed: true, pass: true }],
    buildId: "a".repeat(40), idempotencyMode: "fresh-key", request, response,
    runIndex: 1, safetyLedgerVersion: "fixture-safety", snapshotId: "fixture-catalogue"
  }));
}

describe("customer-value acceptance evidence", () => {
  it("detects changed business results even when all assertion outcomes are unchanged", () => {
    const base = {
      doseFit: { score: 0.5 }, coverage: [{ currentAmount: 25, deliveredAmount: 50, remainingGap: 25 }],
      advice: [{ severity: "important", threshold: 200 }], priceMinor: 12345,
      candidateKey: "option-a", revision: 2, status: "ready", requirements: { maxProductCount: 2 }
    };
    for (const patch of [
      { doseFit: { score: 0.6 } }, { coverage: [{ currentAmount: 25, deliveredAmount: 51, remainingGap: 24 }] },
      { advice: [{ severity: "important", threshold: 201 }] }, { priceMinor: 12346 },
      { candidateKey: "option-b" }, { revision: 3 }, { status: "no_purchase" }, { requirements: { maxProductCount: null } }
    ]) assert.notDeepEqual(evidence(base), evidence({ ...base, ...patch }), JSON.stringify(patch));
  });

  it("normalizes declared generated identities, clocks and latency without changing business evidence", () => {
    assert.deepEqual(
      evidence({ planHandle: "plan-run-a", createdAt: "2026-01-01", matchMs: 1, dose: 50, revision: 1 }),
      evidence({ planHandle: "plan-run-b", createdAt: "2026-02-02", matchMs: 999, dose: 50, revision: 1 })
    );
  });

  it("retains customer request changes as acceptance inputs", () => {
    const response = { status: "no_purchase" };
    assert.notDeepEqual(evidence(response), evidence(response, { targets: [{ amount: 101, name: "Magnesium", unit: "mg" }] }));
  });
});
