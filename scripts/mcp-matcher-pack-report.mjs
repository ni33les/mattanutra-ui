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
import { freezeLiveThailandCatalogue } from "../lib/agentic/value/freeze.ts";
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from "../lib/agentic/catalogue/snapshot.ts";
import { matcherSafetyCeilings, resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
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
export function snapshotFromRun(run) {
  return Object.fromEntries(PACK_LABELS.map(label => [label, Object.fromEntries(run[label].cases.map(row => [row.id,row.result]))]));
}
export function writeBaseline(run) { writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshotFromRun(run),null,2)}\n`, {flag:"wx"}); }
export function sectionTotals(run) {
  const totals=Object.fromEntries(PACK_LABELS.map(label=>{
    const section=run[label];const passed=Boolean(section?.totalCases>0&&section.passedCases===section.totalCases&&section.cases.length===section.totalCases&&section.cases.every(row=>row.result==="PASS"));
    return [label,{passed:label==="matcher" ? passed&&["matching","safety","efficiency"].every(key=>Number(section.scores[key])>=MATCHER_BAR) : passed,text:`${section?.passedCases??0}/${section?.totalCases??0}`}];
  }));
  return {...totals,packPass:PACK_LABELS.every(label=>totals[label].passed)};
}
export function printTable(run) {
  const totals=sectionTotals(run);
  for(const label of PACK_LABELS){console.log(`${label}: ${totals[label].text} ${totals[label].passed?"PASS":"FAIL"}`);for(const row of run[label].cases)console.log(`  ${row.id}: ${row.result}`);}
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
  setMatcherSafetyCeilings(detInput.ceilings);
  const remediationInput = await frozenPackInput(inputs, "valueRemediation", async () => ({
    freeze: await freezeLiveThailandCatalogue("TH"), ceilings: [...matcherSafetyCeilings()]
  }));
  setMatcherSafetyCeilings(remediationInput.ceilings);
  const valueRemediation = await runCvFixPack(remediationInput.freeze);
  await resetAfterMatcher();
  setMatcherSafetyCeilings(detInput.ceilings);
  const valueInput = await frozenPackInput(inputs, "value", async () => ({
    input: await freezeImplCatalogue(), ceilings: [...matcherSafetyCeilings()]
  }));
  setMatcherSafetyCeilings(valueInput.ceilings);
  const valueImplementation = await runCvImplPack(1, valueInput.input);
  await resetAfterMatcher();
  setMatcherSafetyCeilings(valueInput.ceilings);
  const valueR2 = await runCvR2Pack(1, valueInput.input);
  await resetAfterMatcher();
  const financialInput = await frozenPackInput(inputs, "financial", async () => ({
    input: await freezeFinancialCatalogue(), ceilings: [...matcherSafetyCeilings()]
  }));
  setMatcherSafetyCeilings(financialInput.ceilings);
  const valueR3 = await runCvR3Pack(1, financialInput.input);
  await resetAfterMatcher();
  setMatcherSafetyCeilings(financialInput.ceilings);
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
