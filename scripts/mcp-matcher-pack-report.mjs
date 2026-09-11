import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  canonicalDetReport,
  freezeKey,
  loadDetCatalog,
  runDetPack
} from "../test/agentic-det-pack.test.ts";
import { canonicalComReport, runComPack } from "../test/agentic-com-pack.test.ts";
import { canonicalCvFixReport, runCvFixPack } from "../test/agentic-cv-fix-pack.test.ts";
import { canonicalCvImplReport, runCvImplPack } from "../test/agentic-cv-impl-pack.test.ts";
import { canonicalR2Report, runCvR2Pack } from "../test/agentic-cv-r2-pack.test.ts";
import { canonicalR3Report, runCvR3Pack } from "../test/agentic-cv-r3-pack.test.ts";
import { canonicalR4Report, runCvR4Pack } from "../test/agentic-cv-r4-pack.test.ts";
import { freezeImplCatalogue, freezeFinancialCatalogue } from "../test/agentic/value/impl-harness.ts";
import { frozenPackInput } from "../test/helpers/frozen-pack-input.ts";
import { assertRecordedMcpEvidence } from "../test/helpers/mcp-evidence.ts";
import { refreshAdminSafetyCeilings } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import { freezeLiveThailandCatalogue } from "../lib/agentic/value/freeze.ts";
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from "../lib/agentic/catalogue/snapshot.ts";
import { captureMatcherSafetySnapshot, resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { setAgenticRuntimeForTests } from "../lib/agentic/runtime.ts";

import { runCurrentProtocolPack } from "../test/simple-plan/documented-harness.ts";

// Current execution inventory. Historical JSON artifacts remain immutable.
export const MATCHER_BAR = 9;
export const BASELINE_PATH = fileURLToPath(new URL("./mcp-matcher-pack-v9-baseline.json", import.meta.url));
export const PACK_LABELS = ["contract", "commercial", "valueRemediation", "valueImplementation", "valueR2", "valueR3", "valueR4", "matcher"];
const canonicalisers = {commercial:canonicalComReport,valueRemediation:canonicalCvFixReport,valueImplementation:canonicalCvImplReport,valueR2:canonicalR2Report,valueR3:canonicalR3Report,valueR4:canonicalR4Report,matcher:canonicalDetReport};
export function canonicalPack(run) {
  for (const label of PACK_LABELS) assertRecordedMcpEvidence(run[label], label);
  return JSON.stringify(Object.fromEntries(PACK_LABELS.map(label => [label, label === "contract" ? run.contract : JSON.parse(canonicalisers[label](run[label]))])));
}
const MATCHER_CASE_SCORES = Object.freeze({
  "matching.official_5_fewest_pills": "matching",
  "safety.mag_ul_and_ckd": "safety",
  "efficiency.structural": "efficiency"
});
function caseResults(label, section) {
  if (label !== "matcher") return section?.cases ?? [];
  return (section?.cases ?? []).map(row => {
    const score = section.scores?.[MATCHER_CASE_SCORES[row.id]];
    return { ...row, result: Number.isFinite(score) && score >= MATCHER_BAR && score <= 10 ? "PASS" : "FAIL" };
  });
}
export function snapshotFromRun(run) {
  return Object.fromEntries(PACK_LABELS.map(label => [label, Object.fromEntries(caseResults(label, run[label]).map(row => [row.id, row.result]))]));
}
export function writeBaseline(run) { writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshotFromRun(run),null,2)}\n`, {flag:"wx"}); }
export function sectionTotals(run) {
  const totals = Object.fromEntries(PACK_LABELS.map(label => {
    const section = run[label], rows = caseResults(label, section);
    const total = label === "matcher" ? Object.keys(MATCHER_CASE_SCORES).length : section?.totalCases;
    const passedCount = rows.filter(row => row.result === "PASS").length;
    const complete = label === "matcher"
      ? Object.keys(MATCHER_CASE_SCORES).every(id => rows.filter(row => row.id === id).length === 1)
      : section?.passedCases === passedCount;
    return [label, { passed: Boolean(total > 0 && complete && rows.length === total && passedCount === total), text: `${passedCount}/${total ?? 0}` }];
  }));
  return {...totals, packPass: PACK_LABELS.every(label => totals[label].passed)};
}
export function printTable(run) {
  const totals = sectionTotals(run);
  for (const label of PACK_LABELS) {
    console.log(`${label}: ${totals[label].text} ${totals[label].passed ? "PASS" : "FAIL"}`);
    for (const row of caseResults(label, run[label])) console.log(`  ${row.id}: ${row.result}`);
  }
  return totals;
}
async function resetAfterMatcher(){replaceCatalogueSnapshot(null);resetCatalogueSnapshotCache();resetMatcherSafetyCeilings();setAgenticRuntimeForTests(null);}
export async function runPackOnce(inputs = {}) {
  const detInput = await frozenPackInput(inputs, "det", async () => {
    const catA = await loadDetCatalog();
    const catB = await loadDetCatalog();
    if (freezeKey(catA) !== freezeKey(catB)) throw new Error("FAIL freeze");
    return { ...catA, freezePeer: catB };
  });
  const matcher = await runDetPack(detInput);
  await resetAfterMatcher();
  const contract = await runCurrentProtocolPack();
  await resetAfterMatcher();
  const commercial = await runComPack();
  await resetAfterMatcher();
  const remediationInput = await frozenPackInput(inputs, "valueRemediation", async () => {
    await refreshAdminSafetyCeilings();
    const freeze = await freezeLiveThailandCatalogue("TH");
    return { freeze, references: captureMatcherSafetySnapshot(freeze.snapshot.runtimeRevision) };
  });
  const valueRemediation = await runCvFixPack(remediationInput.freeze, remediationInput.references);
  await resetAfterMatcher();
  const valueInput = await frozenPackInput(inputs, "value", async () => {
    const input = await freezeImplCatalogue();
    return { input, references: captureMatcherSafetySnapshot() };
  });
  setMatcherSafetyCeilings(valueInput.references.ceilings, valueInput.references.identity ?? undefined);
  const valueImplementation = await runCvImplPack(1, valueInput.input);
  await resetAfterMatcher();
  setMatcherSafetyCeilings(valueInput.references.ceilings, valueInput.references.identity ?? undefined);
  const valueR2 = await runCvR2Pack(1, valueInput.input);
  await resetAfterMatcher();
  const financialInput = await frozenPackInput(inputs, "financial", async () => {
    const input = await freezeFinancialCatalogue();
    return { input, references: captureMatcherSafetySnapshot() };
  });
  setMatcherSafetyCeilings(financialInput.references.ceilings, financialInput.references.identity ?? undefined);
  const valueR3 = await runCvR3Pack(1, financialInput.input);
  await resetAfterMatcher();
  setMatcherSafetyCeilings(financialInput.references.ceilings, financialInput.references.identity ?? undefined);
  const valueR4 = await runCvR4Pack(1, financialInput.input);
  return {
    contract,
    commercial,
    valueRemediation,
    valueImplementation,
    valueR2,
    valueR3,
    valueR4,
    matcher
  };
}
