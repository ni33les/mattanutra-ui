import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { installRealCatalogue, uninstallRealCatalogue, runtime } from "../ax-refinement/helpers.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { evaluateSafety, assessedSafetyCodes } from "../../lib/agentic/plan/safety.ts";
import { handleLightweightJsonRpc } from "../../lib/agentic/mcp/rpc.ts";
let catalogue: Awaited<ReturnType<typeof installRealCatalogue>>;
before(async () => { catalogue = await installRealCatalogue("dev"); });
after(uninstallRealCatalogue);
test("test_listed_medication_without_row_is_unassessed_not_cleared", async () => {
  for (const locale of ["en", "th", "zh-CN"] as const) {
    const normalized = await normalizePlanRequest({ config: runtime("medications").config, snapshot: catalogue.snapshot,
      request: { locale, destinationCountry: "TH", optimization: "lowest_cost", profile: { ageYears: 60, sex: "female", lifeStage: "adult" }, requirements: {},
        medicationCodes: ["eliquis"], conditionCodes: ["atrial_fibrillation"], targets: [{ name: "Vitamin K2", amount: 100, unit: "mcg", basis: "supplemental" }], currentSupplements: [] } });
    assert.ok("state" in normalized, JSON.stringify(normalized));
    assert.ok(normalized.state.medicationCodes.includes("apixaban"));
    const findings = evaluateSafety({ state: normalized.state, selected: null, locale });
    const interaction = findings.some(row => row.kind === "interaction" && row.code === "medication_interaction");
    assert.ok(interaction || findings.some(row => row.uncertaintyCodes?.includes("medication_unassessed:apixaban")), "Listed code is not proof of interaction assessment");
    if (!interaction) assert.ok(!assessedSafetyCodes(normalized.state).assessedMedicationCodes.includes("apixaban"));
    assert.ok(findings.some(row => /apixaban/i.test(row.message)), "Unassessed medication must be speakable, not hidden in diagnostics");
  }
});
test("test_info_does_not_claim_interaction_coverage", async () => {
  const response = await handleLightweightJsonRpc(runtime("med-info").config, { id: 1, method: "tools/call", params: { name: "info", arguments: {} } });
  const value = response!.result!.structuredContent as Record<string, unknown>;
  assert.match(String(value.clientInstructions), /accepted inputs.*not interaction coverage/i);
  assert.doesNotMatch(String(value.description), /assess(?:es)? apixaban|clear(?:s|ed)? interactions/i);
});
