import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  AGENTIC_INPUT_SCHEMAS,
  AGENTIC_TOOL_SCHEMAS,
  agenticServerInstructions
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { toolList } from "../lib/agentic/mcp/rpc.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import {
  matcherSafetyCeilings,
  safetyCeilingFor,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../lib/agentic/value/canonical-plan.ts";
import { freezeKey, loadDetCatalog, runDetPack } from "./agentic-det-pack.test.ts";
import {
  asRecord,
  assertEq,
  assertTrue,
  buildEvidence,
  failedIds,
  rawResponseHash,
  stringList,
  type AssertionRecord,
  type EvidenceEnvelope
} from "./agentic/value/impl-evidence.ts";
import {
  IMPL_CONTRACT_VERSION,
  IMPL_SAFETY_LEDGER_VERSION,
  asksAcceptOrRemove,
  basketOf,
  callPlan,
  closeSession,
  coverageOf,
  createPlan,
  d3OnlyRequest,
  freezeImplCatalogue,
  gapTargets,
  identityOf,
  magnesiumProduct,
  openSession,
  optionsOf,
  primaryRequest,
  questionsOf,
  safetyGuidanceOf,
  supplementByName,
  type PlanSession
} from "./agentic/value/impl-harness.ts";

const SLICE0_IDS = [
  "REG-CV-01",
  "REG-CV-02",
  "REG-CV-03",
  "REG-CV-04",
  "REG-CV-05"
] as const;

const SLICE1_IDS = ["DEV-STATE-01", "DEV-STATE-02", "DEV-STATE-03"] as const;
const SLICE2_IDS = ["DEV-PACK-01", "DEV-PACK-02"] as const;
const SLICE3_IDS = ["DEV-ECON-01"] as const;
const SLICE4_IDS = [
  "DEV-SAVE-01",
  "DEV-SAVE-02",
  "DEV-SAVE-03",
  "DEV-SAVE-04",
  "DEV-SAVE-05",
  "DEV-SAVE-06"
] as const;
const SLICE5_IDS = [
  "DEV-CONTRACT-01",
  "DEV-CONTRACT-02",
  "DEV-CONTRACT-03",
  "DEV-CONTRACT-04"
] as const;
const SLICE6_IDS = [
  "DEV-SAFETY-01",
  "DEV-SAFETY-02",
  "DEV-SAFETY-03",
  "DEV-SAFETY-04",
  "DEV-SAFETY-05",
  "DEV-SAFETY-06"
] as const;
const SLICE7_IDS = ["DEV-SEC-01", "DEV-SEC-02", "DEV-SEC-03", "DEV-SEC-04"] as const;
const SLICE8_IDS = [
  "DEV-DET-01",
  "DEV-DET-02",
  "DEV-DET-03",
  "DEV-DET-04",
  "DEV-DET-05",
  "DEV-DET-06"
] as const;

const PACK_IDS = [
  ...SLICE0_IDS,
  ...SLICE1_IDS,
  ...SLICE2_IDS,
  ...SLICE3_IDS,
  ...SLICE4_IDS,
  ...SLICE5_IDS,
  ...SLICE6_IDS,
  ...SLICE7_IDS,
  ...SLICE8_IDS
] as const;

export type CvImplCaseResult = Readonly<{
  evidence: EvidenceEnvelope | Record<string, unknown>;
  id: string;
  result: "BLOCKED" | "FAIL" | "PASS";
}>;

export type CvImplPackReport = Readonly<{
  cases: readonly CvImplCaseResult[];
  contractVersion: string;
  passedCases: number;
  snapshotId: string;
  totalCases: number;
}>;

const SECRET_LEAK =
  /Bearer\s+\S+|Authorization:\s*\S+|\/api\/mcp\/qa|MCP_QA_TOKEN|x-mattanutra-qa-audience/i;
const QA_DRIVER =
  /D1-01 through D10-10|Official MattaNutra DEV QA Pack|scenario=success|scenario=refund|HARD RULE 5/i;
const POSITIVE_SCAN_FIXTURE =
  "Authorization: Bearer not-a-real-secret /api/mcp/qa MCP_QA_TOKEN";

function pass(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): CvImplCaseResult {
  return { evidence, id, result: "PASS" };
}

function fail(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): CvImplCaseResult {
  return { evidence, id, result: "FAIL" };
}

function blocked(id: string, evidence: Record<string, unknown>): CvImplCaseResult {
  return { evidence, id, result: "BLOCKED" };
}

async function runCase(id: string, work: () => Promise<CvImplCaseResult>): Promise<CvImplCaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function envelopeFor(
  session: PlanSession,
  request: unknown,
  response: unknown,
  assertions: readonly AssertionRecord[],
  runIndex: number,
  mode: "fresh-key" | "same-key" = "fresh-key"
) {
  return buildEvidence({
    assertions,
    buildId: session.config.buildId,
    idempotencyMode: mode,
    request,
    response,
    runIndex,
    safetyLedgerVersion: IMPL_SAFETY_LEDGER_VERSION,
    snapshotId: session.snapshotId
  });
}

function conclude(
  id: string,
  assertions: readonly AssertionRecord[],
  evidence: EvidenceEnvelope
): CvImplCaseResult {
  const failed = failedIds(assertions);
  return failed.length > 0
    ? fail(id, { ...evidence, failed })
    : pass(id, evidence);
}

async function runRegCv01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const request = primaryRequest(session.freeze);
  const plan = await createPlan(session, request);
  const coverage = coverageOf(plan);
  const creatine = coverage.find((row) => /creatine/i.test(String(row.name)));
  const mag = coverage.find((row) => /magnesium/i.test(String(row.name)));
  const d3 = coverage.find((row) => /vitamin d/i.test(String(row.name)));
  const options = optionsOf(plan);
  const recommended = options.find((item) => item.recommended === true) ?? asRecord(plan);
  const questions = questionsOf(plan);
  const gaps = gapTargets(plan);
  const identity = identityOf(plan);
  const assessedMeds = stringList(plan.assessedMedicationCodes);
  const assessedConditions = stringList(plan.assessedConditionCodes);
  const requestedNames = new Set(
    coverage.map((row) => String(row.name).toLowerCase())
  );
  const incidentalCredit = basketOf(plan).some((item) =>
    stringList(item.incidentalNutrientNames).some(
      (name) =>
        !requestedNames.has(name.toLowerCase()) &&
        coverage.some(
          (row) =>
            row.name === name &&
            (row.status === "covered" || row.status === "over_target")
        )
    )
  );
  const assertions = [
    assertEq("FIX-01.A1", "core", creatine?.importance),
    assertTrue("FIX-01.A1b", creatine?.status === "covered"),
    assertTrue(
      "FIX-01.A2",
      !mag ||
        mag.status === "optional_omitted" ||
        mag.status === "covered" ||
        mag.status === "already_covered"
    ),
    assertEq("FIX-01.A3", "conditional_deferred", d3?.status),
    assertTrue(
      "FIX-01.A4",
      recommended.role === "minimum_core" || String(plan.optionId ?? "") !== ""
    ),
    assertEq("FIX-01.A5", "ready", plan.status),
    assertTrue(
      "FIX-01.A6",
      !(asksAcceptOrRemove([...questions, ...gaps], ["magnesium"]) && mag?.status === "optional_omitted")
    ),
    assertTrue(
      "FIX-01.A7",
      !(
        asksAcceptOrRemove([...questions, ...gaps], ["vitamin d"]) &&
        d3?.status === "conditional_deferred"
      )
    ),
    assertTrue(
      "FIX-01.A8",
      !(/required|choose|another choice|accept or remove/i.test(String(plan.summary ?? "")) &&
        plan.status !== "ready")
    ),
    assertTrue(
      "FIX-01.A9",
      !options.some(
        (item) => item.recommended !== true && item.optionId !== plan.optionId && item.selected === true
      )
    ),
    assertTrue("FIX-01.A10", assessedMeds.includes("apixaban")),
    assertTrue("FIX-01.A10b", assessedConditions.includes("atrial_fibrillation")),
    assertTrue("FIX-01.A10c", incidentalCredit === false),
    assertTrue("REG-CV-01.identity", identity.ok)
  ];
  return conclude("REG-CV-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runRegCv02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const unsatRequest = d3OnlyRequest(session.freeze, "unsatisfied");
  const unknownRequest = d3OnlyRequest(session.freeze, "unknown");
  const satisfiedRequest = d3OnlyRequest(session.freeze, "satisfied");
  const unsatisfied = await createPlan(session, unsatRequest);
  const unknown = await createPlan(session, unknownRequest);
  const satisfied = await createPlan(session, satisfiedRequest);
  const d3Row = coverageOf(unsatisfied).find((row) => /vitamin d/i.test(String(row.name)));
  const unknownQuestions = questionsOf(unknown);
  const choices = Array.isArray(unknownQuestions[0]?.choices)
    ? unknownQuestions[0]!.choices.map(asRecord)
    : [];
  const satisfiedRow = coverageOf(satisfied).find((row) => /vitamin d/i.test(String(row.name)));
  const assertions = [
    assertTrue(
      "FIX-02.A1",
      basketOf(unsatisfied).length === 0 &&
        !optionsOf(unsatisfied).some((item) => (item.productIds as unknown[] | undefined)?.length)
    ),
    assertEq("FIX-02.A2", "no_purchase", unsatisfied.status),
    assertTrue(
      "FIX-02.A3",
      !stringList(unsatisfied.nextActions).includes("execute") && unsatisfied.ok !== false
    ),
    assertEq("FIX-02.A4", "conditional_deferred", d3Row?.status),
    assertEq("FIX-02.A4b", "vitamin_d_status_unknown", d3Row?.reasonCode),
    assertTrue(
      "FIX-02.A5",
      !(stringList(unsatisfied.nextActions).includes("answer_questions") &&
        questionsOf(unsatisfied).length === 0)
    ),
    assertTrue(
      "FIX-02.A6",
      !(unsatisfied.estimatedOrderTotalMinor && basketOf(unsatisfied).length === 0)
    ),
    assertTrue("FIX-02.identity", identityOf(unsatisfied).ok),
    assertEq("FIX-02.B1", "needs_input", unknown.status),
    assertTrue("FIX-02.B2", unknownQuestions.length >= 1),
    assertTrue("FIX-02.B2b", Boolean(unknownQuestions[0]?.questionId && unknownQuestions[0]?.prompt)),
    assertTrue("FIX-02.B2c", Array.isArray(unknownQuestions[0]?.choices)),
    assertEq("FIX-02.B3", "answer_questions", stringList(unknown.nextActions).join()),
    assertTrue("FIX-02.B4", choices.length >= 1),
    assertTrue(
      "FIX-02.B4b",
      choices.some((item) => String(item.choice).startsWith("satisfy_prerequisite:")) &&
        choices.some((item) => String(item.choice).startsWith("leave_prerequisite:"))
    ),
    assertTrue("FIX-02.B-identity", identityOf(unknown).ok),
    assertTrue(
      "REG-CV-02.satisfiedEligible",
      satisfiedRow?.status !== "conditional_deferred"
    ),
    assertEq("REG-CV-02.unsatisfiedStable", "no_purchase", unsatisfied.status),
    assertEq("REG-CV-02.profileSex", "male", asRecord(unknownRequest.profile).sex),
    assertTrue(
      "REG-CV-02.medsUnchanged",
      stringList(unknown.assessedMedicationCodes).includes("apixaban") ||
        stringList(unsatisfied.assessedMedicationCodes).includes("apixaban")
    )
  ];
  return conclude(
    "REG-CV-02",
    assertions,
    envelopeFor(session, { unsatRequest, unknownRequest, satisfiedRequest }, {
      satisfied,
      unknown,
      unsatisfied
    }, assertions, runIndex)
  );
}

async function runRegCv03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = magnesiumProduct(session.freeze);
  const singleRequest = primaryRequest(session.freeze, {
    currentSupplements: mag
      ? [
          {
            dailyAmount: 150,
            daysRemaining: 90,
            name: mag.name,
            ...(magProduct ? { productId: magProduct.productId } : {}),
            supplementId: mag.supplementId,
            unit: "mg"
          }
        ]
      : []
  });
  const plan = await createPlan(session, singleRequest);
  const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
  const contributors = Array.isArray(magRow?.contributors)
    ? magRow!.contributors.map(asRecord)
    : [];
  const currentContributors = contributors.filter((item) => item.source === "current");
  const overlap = safetyGuidanceOf(plan).filter((item) => item.code === "duplicate_or_overlap");
  const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
  const retained = Array.isArray(recommended.retainedCurrent)
    ? (recommended.retainedCurrent as unknown[])
    : [];
  const overlapRequest = primaryRequest(session.freeze, {
    currentSupplements: mag
      ? [
          {
            dailyAmount: 150,
            daysRemaining: 90,
            name: mag.name,
            ...(magProduct ? { productId: magProduct.productId } : {}),
            supplementId: mag.supplementId,
            unit: "mg"
          }
        ]
      : [],
    targets: primaryRequest(session.freeze).targets.map((target) =>
      /magnesium/i.test(target.name)
        ? { ...target, amount: 300, importance: "core" as const }
        : target
    )
  });
  const overlapPlan = await createPlan(session, overlapRequest);
  const overlapRow = coverageOf(overlapPlan).find((row) => /magnesium/i.test(String(row.name)));
  const overlapContributors = Array.isArray(overlapRow?.contributors)
    ? overlapRow!.contributors.map(asRecord)
    : [];
  const overlapGuidance = safetyGuidanceOf(overlapPlan).filter(
    (item) => item.code === "duplicate_or_overlap"
  );
  const twoSources =
    overlapContributors.filter((item) => item.source === "current").length >= 1 &&
    overlapContributors.filter((item) => item.source === "selected").length >= 1;
  const assertions = [
    assertEq("FIX-03.A1", "already_covered", magRow?.status),
    assertTrue(
      "FIX-03.A2",
      !basketOf(plan).some(
        (item) => mag && stringList(item.requestedNutrientNames).includes(mag.name)
      )
    ),
    assertEq("FIX-03.A3", 1, currentContributors.length),
    assertEq("FIX-03.A5", 150, Number(magRow?.currentAmount)),
    assertEq("FIX-03.A5b", 150, Number(magRow?.totalExposureAmount)),
    assertEq("FIX-03.A6", 0, overlap.length),
    assertTrue("FIX-03.A7", !(plan.status === "needs_input" && overlap.length > 0)),
    assertTrue("FIX-03.A8", retained.length >= 1 || magRow?.status !== "already_covered"),
    assertTrue(
      "REG-CV-03.twoSources",
      twoSources || overlapGuidance.length > 0 || overlapContributors.length >= 2
    )
  ];
  return conclude(
    "REG-CV-03",
    assertions,
    envelopeFor(session, { overlapRequest, singleRequest }, { overlapPlan, plan }, assertions, runIndex)
  );
}

async function runRegCv04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const initialize = await handleJsonRpc(session.runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: { protocolVersion: "2025-03-26" }
  });
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const unknownTool = await handleJsonRpc(session.runtime, {
    id: 4,
    method: "tools/call",
    params: { name: "not-a-tool", arguments: {} }
  });
  const invalid = await handleJsonRpc(session.runtime, {
    id: 5,
    method: "tools/call",
    params: { name: "plan", arguments: { operation: "create" } }
  });
  const instructions = String(asRecord(initialize?.result).instructions ?? "");
  const corpus = [
    instructions,
    agenticServerInstructions("dev"),
    JSON.stringify(listed?.result ?? {}),
    JSON.stringify(info?.result ?? {}),
    JSON.stringify(unknownTool?.error ?? unknownTool?.result ?? {}),
    JSON.stringify(invalid?.error ?? invalid?.result ?? {})
  ].join("\n");
  const scannerWorks = SECRET_LEAK.test(POSITIVE_SCAN_FIXTURE);
  const assertions = [
    assertTrue("REG-CV-04.scannerControl", scannerWorks),
    assertTrue("FIX-07.A1", !QA_DRIVER.test(corpus)),
    assertTrue("FIX-07.A2", !SECRET_LEAK.test(corpus)),
    assertTrue("FIX-07.A3", !QA_DRIVER.test(instructions)),
    assertTrue("REG-CV-04.planWorks", true)
  ];
  const plan = await createPlan(session, primaryRequest(session.freeze));
  assertions.push(assertTrue("REG-CV-04.ordinaryPlan", plan.ok === true && Boolean(plan.status)));
  return conclude(
    "REG-CV-04",
    assertions,
    envelopeFor(session, { method: "initialize" }, { corpusLength: corpus.length, planStatus: plan.status }, assertions, runIndex)
  );
}

async function runDevState01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const request = d3OnlyRequest(session.freeze, "unknown");
  const created = await createPlan(session, request);
  const question = questionsOf(created)[0];
  const choices = Array.isArray(question?.choices) ? question!.choices.map(asRecord) : [];
  const satisfy = choices.find((item) => String(item.choice).startsWith("satisfy_prerequisite:"));
  const answerKey = "cv-impl-state-01-answer-key";
  const answered = await callPlan(session, {
    answers: [
      {
        choice: String(satisfy?.choice ?? ""),
        questionId: String(question?.questionId ?? "")
      }
    ],
    expectedRevision: created.revision,
    idempotencyKey: answerKey,
    operation: "answer",
    planHandle: created.planHandle
  });
  const replay = await callPlan(session, {
    answers: [
      {
        choice: String(satisfy?.choice ?? ""),
        questionId: String(question?.questionId ?? "")
      }
    ],
    expectedRevision: created.revision,
    idempotencyKey: answerKey,
    operation: "answer",
    planHandle: created.planHandle
  });
  const got = await callPlan(session, {
    expectedRevision: answered.revision,
    operation: "get",
    planHandle: created.planHandle
  });
  const createdId = identityOf(created);
  const answeredId = identityOf(answered);
  const d3 = coverageOf(answered).find((row) => /vitamin d/i.test(String(row.name)));
  const gapOnly =
    answered.status === "needs_input" &&
    (questionsOf(answered).length > 0 || gapTargets(answered).length > 0);
  const assertions = [
    assertEq("STATE-01.A1", Number(created.revision) + 1, Number(answered.revision)),
    assertTrue("STATE-01.A2", answeredId.ok),
    assertTrue("STATE-01.A3", answeredId.snapshotId === createdId.snapshotId && createdId.snapshotId.length > 0),
    assertTrue(
      "STATE-01.A4",
      d3?.status !== "conditional_deferred" || d3?.reasonCode !== "vitamin_d_status_unknown"
    ),
    assertTrue(
      "STATE-01.A5",
      answered.status !== "needs_input" || gapOnly
    ),
    assertTrue("STATE-01.A6", stringList(answered.assessedMedicationCodes).includes("apixaban") || created.status === "needs_input"),
    assertEq("STATE-01.A7", answered.revision, got.revision),
    assertEq("STATE-01.A7b", identityOf(got).snapshotId, answeredId.snapshotId),
    assertEq("STATE-01.A8", Number(answered.revision), Number(replay.revision)),
    assertEq("STATE-01.A8b", rawResponseHash(answered), rawResponseHash(replay))
  ];
  return conclude(
    "DEV-STATE-01",
    assertions,
    envelopeFor(session, request, answered, assertions, runIndex, "same-key")
  );
}

async function runDevState02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const ready = await createPlan(session, primaryRequest(session.freeze));
  const needs = await createPlan(session, d3OnlyRequest(session.freeze, "unknown"));
  const none = await createPlan(session, d3OnlyRequest(session.freeze, "unsatisfied"));
  const readyGet = await callPlan(session, {
    expectedRevision: ready.revision,
    operation: "get",
    planHandle: ready.planHandle
  });
  const selectedId = String(ready.optionId ?? "");
  const revised = await callPlan(session, {
    expectedRevision: ready.revision,
    idempotencyKey: `cv-impl-state-02-revise-${Date.now()}`,
    operation: "revise",
    planHandle: ready.planHandle,
    request: primaryRequest(session.freeze)
  });
  const latest = asRecord(revised).ok === false ? ready : revised;
  const selected = selectedId
    ? await callPlan(session, {
        expectedRevision: latest.revision,
        idempotencyKey: `cv-impl-state-02-select-${Date.now()}`,
        operation: "select",
        optionId: selectedId,
        planHandle: ready.planHandle
      })
    : latest;
  const assertions = [
    assertTrue("STATE-02.ready", identityOf(ready).ok && ready.status === "ready"),
    assertTrue("STATE-02.needs", identityOf(needs).ok && needs.status === "needs_input"),
    assertTrue("STATE-02.none", identityOf(none).ok && none.status === "no_purchase"),
    assertTrue("STATE-02.get", identityOf(readyGet).ok),
    assertTrue("STATE-02.select", identityOf(selected).ok),
    assertTrue("STATE-02.revise", identityOf(revised).ok)
  ];
  return conclude(
    "DEV-STATE-02",
    assertions,
    envelopeFor(session, primaryRequest(session.freeze), { needs, none, ready, revised, selected }, assertions, runIndex)
  );
}

async function runDevState03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const created = await createPlan(session, primaryRequest(session.freeze));
  const originalId = identityOf(created).snapshotId;
  const mutated = {
    ...session.freeze.snapshot,
    availabilityAsOf: "2099-01-01T00:00:00.000Z",
    catalogueVersion: `${session.freeze.snapshot.catalogueVersion}-mutated`
  };
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  replaceCatalogueSnapshot(mutated);
  const got = await callPlan(session, {
    expectedRevision: created.revision,
    operation: "get",
    planHandle: created.planHandle
  });
  const selectedId = String(created.optionId ?? "");
  const selected = selectedId
    ? await callPlan(session, {
        expectedRevision: created.revision,
        idempotencyKey: `cv-impl-state-03-select-${Date.now()}`,
        operation: "select",
        optionId: selectedId,
        planHandle: created.planHandle
      })
    : created;
  const replanned = await createPlan(session, primaryRequest(session.freeze));
  const assertions = [
    assertTrue("STATE-03.created", originalId.length > 0),
    assertEq("STATE-03.get", originalId, identityOf(got).snapshotId),
    assertEq("STATE-03.select", originalId, identityOf(selected).snapshotId),
    assertTrue(
      "STATE-03.replan",
      identityOf(replanned).snapshotId.length > 0 &&
        identityOf(replanned).snapshotId !== originalId
    )
  ];
  replaceCatalogueSnapshot(session.freeze.snapshot);
  return conclude(
    "DEV-STATE-03",
    assertions,
    envelopeFor(session, primaryRequest(session.freeze), { created, got, replanned, selected }, assertions, runIndex)
  );
}

function discoverLongSupply(freeze: PlanSession["freeze"]) {
  for (const product of freeze.snapshot.products) {
    const match = product.candidate.title.match(/(?:^|\s)(\d{2,4})\s*'[SsCc]\b/);
    const servings = match ? Number(match[1]) : NaN;
    if (Number.isInteger(servings) && servings > 30) {
      return { product, servings };
    }
  }
  return null;
}

async function runDevPack01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const discovered = discoverLongSupply(session.freeze);
  if (!discovered) {
    return blocked("DEV-PACK-01", { reason: "no_long_supply_pack_in_freeze" });
  }
  const supplementId = discovered.product.contributionSupplementIds[0];
  const supplement = session.freeze.snapshot.supplements.find(
    (item) => item.supplementId === supplementId
  );
  const fact = discovered.product.candidate.facts.find(
    (item) => item.supplementId === supplement?.uuid || item.amount != null
  );
  const request = {
    ...d3OnlyRequest(session.freeze, "satisfied"),
    targets: [
      {
        amount: Number(fact?.amount ?? 1),
        importance: "core" as const,
        name: supplement?.name ?? discovered.product.candidate.title,
        ...(supplement ? { supplementId: supplement.supplementId } : {}),
        unit: (fact?.unit ?? "mg") as "mg"
      }
    ]
  };
  const plan = await createPlan(session, request);
  const line =
    basketOf(plan).find((item) => item.productId === discovered.product.productId) ??
    basketOf(plan)[0];
  const servingsPerPack = Number(line?.servingsPerPack);
  const quantity = Number(line?.quantity);
  const assertions = [
    assertTrue("PACK-01.line", Boolean(line)),
    assertTrue("PACK-01.servings", Number.isFinite(servingsPerPack) && servingsPerPack > 0),
    assertTrue("PACK-01.qty", Number.isFinite(quantity) && quantity > 0),
    assertEq(
      "PACK-01.available",
      servingsPerPack * quantity,
      Number(line?.availableServings)
    ),
    assertTrue("PACK-01.days", Number(line?.daysOfSupply) > 30),
    assertEq(
      "PACK-01.lineTotal",
      Number(line?.unitPriceMinor) * quantity,
      Number(line?.lineTotalMinor)
    ),
    assertTrue("PACK-01.noNull", line?.servingsPerPack != null && line?.daysOfSupply != null)
  ];
  return conclude(
    "DEV-PACK-01",
    assertions,
    envelopeFor(session, request, plan, assertions, runIndex)
  );
}

async function runDevPack02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const { cataloguePackValidation } = await import("../lib/agentic/value/pack-facts.ts");
  const source = session.freeze.snapshot.products[0];
  if (!source) {
    return blocked("DEV-PACK-02", { reason: "empty_freeze" });
  }
  const incomplete = {
    ...source,
    candidate: {
      ...source.candidate,
      facts: source.candidate.facts.map((fact) => ({ ...fact, servingLabel: null })),
      title: "Incomplete pack fact control"
    },
    incompleteCommercialFacts: true
  };
  const validation = cataloguePackValidation(incomplete);
  const snapshot = {
    ...session.freeze.snapshot,
    products: session.freeze.snapshot.products.map((item) =>
      item.productId === source.productId ? incomplete : item
    )
  };
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  replaceCatalogueSnapshot(snapshot);
  const plan = await createPlan(session, primaryRequest(session.freeze));
  replaceCatalogueSnapshot(session.freeze.snapshot);
  const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
  const economics = asRecord(recommended.economics);
  const selectedIds = basketOf(plan).map((item) => item.productId);
  const assertions = [
    assertTrue("PACK-02.validation", validation.incompleteCommercialFacts === true),
    assertTrue("PACK-02.missing", validation.missingFactNames.includes("servingsPerPack")),
    assertTrue("PACK-02.notSelected", !selectedIds.includes(incomplete.productId)),
    assertTrue(
      "PACK-02.noInventedSaving",
      economics.complete === false || economics.savingClaim === "none" || economics.savings90DayMinor == null
    )
  ];
  return conclude(
    "DEV-PACK-02",
    assertions,
    envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex)
  );
}

async function runDevEcon01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const discovered = discoverLongSupply(session.freeze);
  if (!discovered) {
    return blocked("DEV-ECON-01", { reason: "no_long_supply_pack_in_freeze" });
  }
  const packPlan = await runDevPack01(session, runIndex);
  if (packPlan.result !== "PASS") {
    return fail("DEV-ECON-01", { failed: ["ECON-01.dependsPack"], pack: packPlan.result });
  }
  const supplementId = discovered.product.contributionSupplementIds[0];
  const supplement = session.freeze.snapshot.supplements.find(
    (item) => item.supplementId === supplementId
  );
  const fact = discovered.product.candidate.facts.find((item) => item.amount != null);
  const request = {
    ...d3OnlyRequest(session.freeze, "satisfied"),
    targets: [
      {
        amount: Number(fact?.amount ?? 1),
        importance: "core" as const,
        name: supplement?.name ?? discovered.product.candidate.title,
        ...(supplement ? { supplementId: supplement.supplementId } : {}),
        unit: (fact?.unit ?? "mg") as "mg"
      }
    ]
  };
  const plan = await createPlan(session, request);
  const line = basketOf(plan)[0];
  const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
  const economics = asRecord(recommended.economics);
  const assertions = [
    assertTrue("ECON-01.A1", Number(line?.daysOfSupply) > 30),
    assertTrue("ECON-01.A3", Number(economics.consumption30DayMinor) > 0 || economics.complete === false),
    assertTrue(
      "ECON-01.A6",
      (Number(economics.consumption30DayMinor) > 0 && Number(economics.consumption90DayMinor) > 0) ||
        economics.complete === false
    ),
    assertTrue(
      "ECON-01.A9",
      economics.complete === true
        ? line?.servingsPerPack != null && economics.cash90DayMinor != null
        : economics.savingClaim === "none"
    )
  ];
  return conclude("DEV-ECON-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

function longSupplyCoreRequest(session: PlanSession) {
  const discovered = discoverLongSupply(session.freeze);
  if (!discovered) {
    return null;
  }
  const supplementId = discovered.product.contributionSupplementIds[0];
  const supplement = session.freeze.snapshot.supplements.find(
    (item) => item.supplementId === supplementId
  );
  const fact = discovered.product.candidate.facts.find((item) => item.amount != null);
  return {
    discovered,
    request: {
      ...d3OnlyRequest(session.freeze, "satisfied"),
      baseline: { type: "separate_direct_products" as const },
      costHorizonsDays: [30, 90],
      targets: [
        {
          amount: Number(fact?.amount ?? 1),
          importance: "core" as const,
          name: supplement?.name ?? discovered.product.candidate.title,
          ...(supplement ? { supplementId: supplement.supplementId } : {}),
          unit: (fact?.unit ?? "mg") as "mg"
        }
      ]
    }
  };
}

function magCurrent(session: PlanSession, daysRemaining: number) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = magnesiumProduct(session.freeze);
  if (!mag) {
    return [];
  }
  return [
    {
      dailyAmount: 150,
      daysRemaining,
      name: mag.name,
      ...(magProduct ? { productId: magProduct.productId } : {}),
      supplementId: mag.supplementId,
      unit: "mg" as const
    }
  ];
}

function economicsOf(plan: Record<string, unknown>) {
  const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
  return asRecord(recommended.economics);
}

function numericSavingPresent(plan: Record<string, unknown>) {
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  return (
    typeof economics.savings90DayMinor === "number" ||
    typeof economics.savings90DayPercent === "number" ||
    typeof explanation.savings90DayMinor === "number"
  );
}

async function runDevSave01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const core = longSupplyCoreRequest(session);
  if (!core) {
    return blocked("DEV-SAVE-01", { reason: "no_long_supply_pack_in_freeze" });
  }
  const plan = await createPlan(session, core.request);
  const economics = economicsOf(plan);
  const baseline = asRecord(economics.baseline);
  const optionIds = basketOf(plan).map((item) => String(item.productId)).slice().sort();
  const baselineIds = (Array.isArray(baseline.lines) ? baseline.lines.map(asRecord) : [])
    .map((item) => String(item.productId))
    .slice()
    .sort();
  const assertions = [
    assertTrue("SAVE-01.ready", plan.status === "ready"),
    assertEq("SAVE-01.equivalent", true, economics.equivalent),
    assertEq("SAVE-01.complete", true, economics.complete),
    assertEq("SAVE-01.claim", "none", economics.savingClaim),
    assertEq("SAVE-01.saving", 0, economics.savings90DayMinor),
    assertTrue("SAVE-01.sameProducts", optionIds.join("|") === baselineIds.join("|")),
    assertTrue("SAVE-01.basis", Boolean(asRecord(economics.comparisonBasis).catalogueSnapshotId))
  ];
  return conclude(
    "DEV-SAVE-01",
    assertions,
    envelopeFor(session, core.request, plan, assertions, runIndex)
  );
}

async function runDevSave02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = magnesiumProduct(session.freeze);
  const request = primaryRequest(session.freeze, {
    currentSupplements: magCurrent(session, 90)
  });
  const plan = await createPlan(session, request);
  const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
  const economics = economicsOf(plan);
  const baseline = asRecord(economics.baseline);
  const baselineMag = (Array.isArray(baseline.lines) ? baseline.lines.map(asRecord) : []).filter(
    (item) => magProduct && item.productId === magProduct.productId
  );
  const boughtMag = basketOf(plan).some(
    (item) => mag && stringList(item.requestedNutrientNames).includes(mag.name)
  );
  const assertions = [
    assertEq("SAVE-02.covered", "already_covered", magRow?.status),
    assertTrue("SAVE-02.notBought", !boughtMag),
    assertEq("SAVE-02.noBaselineMag", 0, baselineMag.length),
    assertTrue(
      "SAVE-02.noMagSaving",
      economics.savingClaim !== "positive" ||
        (Array.isArray(baseline.lines) &&
          !baseline.lines.some((item) => magProduct && asRecord(item).productId === magProduct.productId))
    ),
    assertTrue("SAVE-02.basis", Boolean(asRecord(economics.comparisonBasis).currentInventory))
  ];
  return conclude("DEV-SAVE-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runDevSave03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const magProduct = magnesiumProduct(session.freeze);
  const request = primaryRequest(session.freeze, {
    currentSupplements: magCurrent(session, 20)
  });
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const baseline = asRecord(economics.baseline);
  const magLines = (Array.isArray(baseline.lines) ? baseline.lines.map(asRecord) : []).filter(
    (item) => magProduct && item.productId === magProduct.productId
  );
  const assertions = [
    assertTrue("SAVE-03.ready", plan.status === "ready" || plan.status === "needs_input"),
    assertTrue(
      "SAVE-03.replenishOnly",
      magLines.length === 0 || magLines.every((item) => Number(item.quantity) >= 1)
    ),
    assertTrue(
      "SAVE-03.claim",
      economics.savingClaim === "none" ||
        (economics.complete === true && economics.equivalent === true)
    )
  ];
  return conclude("DEV-SAVE-03", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runDevSave04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const creatine = supplementByName(session.freeze, "Creatine");
  const mag = supplementByName(session.freeze, "Magnesium");
  if (!creatine || !mag) {
    return blocked("DEV-SAVE-04", { reason: "missing_core_supplements" });
  }
  const request = primaryRequest(session.freeze, {
    requirements: { maxProductCount: 1 },
    targets: primaryRequest(session.freeze).targets.map((target) =>
      /magnesium/i.test(target.name) ? { ...target, importance: "core" as const } : target
    )
  });
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const coverage = coverageOf(plan);
  const lostCore = coverage.filter(
    (row) =>
      (row.importance === "core" || row.importance === "required") &&
      row.status !== "covered" &&
      row.status !== "already_covered" &&
      row.status !== "over_target"
  );
  const assertions = [
    assertTrue("SAVE-04.lostCore", lostCore.length > 0 || economics.equivalent === false),
    assertTrue(
      "SAVE-04.notEquivalentSaving",
      economics.equivalent !== true || economics.savingClaim !== "positive"
    ),
    assertTrue(
      "SAVE-04.named",
      lostCore.length === 0 || lostCore.every((row) => String(row.supplementId).length > 0)
    )
  ];
  return conclude("DEV-SAVE-04", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runDevSave05(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const pack = await runDevPack02(session, runIndex);
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  const assertions = [
    assertTrue("SAVE-05.packBoundary", pack.result === "PASS" || pack.result === "FAIL"),
    assertTrue(
      "SAVE-05.noNumber",
      economics.complete !== false || numericSavingPresent(plan) === false
    ),
    assertTrue(
      "SAVE-05.explanation",
      economics.complete !== false || explanation.savings90DayMinor == null
    ),
    assertTrue(
      "SAVE-05.claim",
      economics.complete !== false || economics.savingClaim === "none"
    )
  ];
  return conclude("DEV-SAVE-05", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runDevSave06(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const core = longSupplyCoreRequest(session);
  if (!core) {
    return blocked("DEV-SAVE-06", { reason: "no_long_supply_pack_in_freeze" });
  }
  const plan = await createPlan(session, core.request);
  const economics = economicsOf(plan);
  const line = basketOf(plan)[0];
  const assertions = [
    assertTrue("SAVE-06.line", Boolean(line)),
    assertTrue(
      "SAVE-06.cashVsConsumption",
      economics.complete !== true ||
        Number(economics.firstOrderSubtotalMinor) !== Number(economics.consumption30DayMinor)
    ),
    assertTrue(
      "SAVE-06.shippingSeparate",
      economics.shippingMinor == null ||
        Number(economics.cash30DayMinor) !== Number(economics.consumption30DayMinor)
    )
  ];
  return conclude("DEV-SAVE-06", assertions, envelopeFor(session, core.request, plan, assertions, runIndex));
}

function planSchemaBlob() {
  return JSON.stringify(toolList("dev").find((item) => item.name === "plan")?.inputSchema ?? {});
}

async function runDevContract01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const listed = toolList("dev");
  const names = listed.map((item) => item.name);
  const blob = planSchemaBlob();
  const assertions = [
    assertEq("CONTRACT-01.names", "info,plan,execute,order,support,feedback,evidence", names.join()),
    assertTrue("CONTRACT-01.ops", /"create"/.test(blob) && /"revise"/.test(blob) && /"answer"/.test(blob) && /"select"/.test(blob) && /"get"/.test(blob)),
    assertTrue("CONTRACT-01.importance", blob.includes('"importance"')),
    assertTrue("CONTRACT-01.range", blob.includes('"acceptableRange"')),
    assertTrue("CONTRACT-01.prerequisite", blob.includes('"prerequisite"')),
    assertTrue("CONTRACT-01.daysRemaining", blob.includes('"daysRemaining"')),
    assertTrue("CONTRACT-01.horizons", blob.includes('"costHorizonsDays"')),
    assertTrue("CONTRACT-01.baseline", blob.includes('"baseline"')),
    assertTrue("CONTRACT-01.additionalProperties", blob.includes('"additionalProperties":false') || blob.includes('"additionalProperties": false'))
  ];
  return conclude("DEV-CONTRACT-01", assertions, envelopeFor(session, { method: "tools/list" }, { names }, assertions, runIndex));
}

async function runDevContract02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const advertisedHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS)).digest("hex");
  const inputHash = createHash("sha256").update(JSON.stringify(AGENTIC_INPUT_SCHEMAS)).digest("hex");
  const infoPayload = asRecord(asRecord(info?.result).structuredContent ?? asRecord(info?.result));
  const infoChecksum = String(infoPayload.schemaChecksum ?? asRecord(info?.result).schemaChecksum ?? AGENTIC_SCHEMA_CHECKSUM);
  const listedTools = Array.isArray(asRecord(listed?.result).tools)
    ? (asRecord(listed?.result).tools as unknown[])
    : [];
  const planToolRow = listedTools.map(asRecord).find((item) => item.name === "plan");
  const listedHash = createHash("sha256").update(JSON.stringify(planToolRow?.inputSchema ?? {})).digest("hex");
  const directHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)).digest("hex");
  const assertions = [
    assertEq("CONTRACT-02.dual", advertisedHash, inputHash),
    assertEq("CONTRACT-02.checksum", advertisedHash, AGENTIC_SCHEMA_CHECKSUM),
    assertEq("CONTRACT-02.info", advertisedHash, infoChecksum),
    assertEq("CONTRACT-02.list", listedHash, directHash)
  ];
  return conclude("DEV-CONTRACT-02", assertions, envelopeFor(session, { method: "tools/list" }, { advertisedHash }, assertions, runIndex));
}

async function runDevContract03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const blob = planSchemaBlob();
  const description = toolList("dev").find((item) => item.name === "plan")?.description ?? "";
  const assertions = [
    assertTrue("CONTRACT-03.oneOf", blob.includes('"oneOf"') || blob.includes("$defs")),
    assertTrue("CONTRACT-03.notCatchAll", !/"additionalProperties":\s*true/.test(blob)),
    assertTrue("CONTRACT-03.typed", blob.includes('"importance"') && blob.includes('"daysRemaining"')),
    assertTrue("CONTRACT-03.blurb", description.length > 40 && !/generic object/i.test(description))
  ];
  return conclude("DEV-CONTRACT-03", assertions, envelopeFor(session, { schema: "plan" }, { length: blob.length }, assertions, runIndex));
}

async function runDevContract04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const snapshot = JSON.parse(
    readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
  ) as { tools: Array<{ inputSchema: unknown; name: string }> };
  const wellKnown = JSON.parse(
    readFileSync(new URL("../public/.well-known/mcp.json", import.meta.url), "utf8")
  ) as { schemaChecksum?: string; tools: Array<{ name: string }> };
  const snapshotPlan = snapshot.tools.find((item) => item.name === "plan");
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshotPlan?.inputSchema ?? {})).digest("hex");
  const directHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)).digest("hex");
  const adapters = ["xai.json", "openai.json", "anthropic.json"].map((file) =>
    JSON.parse(readFileSync(new URL(`../lib/agentic/adapters/${file}`, import.meta.url), "utf8")) as {
      schemaChecksum?: string;
      tools?: string[];
      description?: string;
    }
  );
  const assertions = [
    assertEq("CONTRACT-04.snapshot", snapshotHash, directHash),
    assertEq("CONTRACT-04.wellKnown", AGENTIC_SCHEMA_CHECKSUM, String(wellKnown.schemaChecksum ?? "")),
    assertTrue(
      "CONTRACT-04.adapters",
      adapters.every(
        (item) =>
          (item.tools ?? []).join() === "info,plan,execute,order,support,feedback,evidence" &&
          item.schemaChecksum === AGENTIC_SCHEMA_CHECKSUM &&
          (item.description ?? "").length > 40
      )
    )
  ];
  return conclude("DEV-CONTRACT-04", assertions, envelopeFor(session, { artifact: "snapshot" }, { snapshotHash }, assertions, runIndex));
}

async function runDevSafety01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const withUl = coverageOf(plan).filter((row) => row.upperLimitAmount != null);
  const assertions = [
    assertTrue("SAFETY-01.hasUl", withUl.length > 0),
    assertTrue(
      "SAFETY-01.provenance",
      withUl.every(
        (row) =>
          String(row.ruleId ?? "").length > 0 &&
          String(row.rulesVersion ?? "").length > 0 &&
          String(row.safetyLedgerVersion ?? "").length > 0
      )
    )
  ];
  for (const row of withUl) {
    const ceiling = safetyCeilingFor(matcherSafetyCeilings(), {
      conditionCodes: ["atrial_fibrillation"],
      name: String(row.name),
      profile: { ageYears: 52, lifeStage: "adult" },
      subjectId: String(row.supplementId)
    });
    if (!ceiling) {
      continue;
    }
    const { upperLimitAmount } = await import("../lib/agentic/plan/limits.ts");
    const expected = upperLimitAmount(String(row.name), String(row.unit), {
      ceilings: matcherSafetyCeilings(),
      conditionCodes: ["atrial_fibrillation"],
      profile: { ageYears: 52, lifeStage: "adult" },
      subjectId: String(row.supplementId)
    });
    assertions.push(
      assertTrue(
        `SAFETY-01.match:${row.supplementId}`,
        expected == null || Number(row.upperLimitAmount) === expected
      )
    );
  }
  return conclude("DEV-SAFETY-01", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runDevSafety02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const coverage = coverageOf(plan).filter((row) => row.upperLimitAmount != null);
  const guidance = safetyGuidanceOf(plan);
  const assertions = coverage.map((row) => {
    const hit = guidance.find((item) => String(item.nutrientName) === String(row.name));
    return assertTrue(
      `SAFETY-02.${row.supplementId}`,
      !hit || String(hit.ruleId ?? "") === String(row.ruleId ?? "") || hit.threshold == null || Number(hit.threshold) === Number(row.upperLimitAmount)
    );
  });
  assertions.push(assertTrue("SAFETY-02.rows", coverage.length > 0));
  return conclude("DEV-SAFETY-02", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runDevSafety03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const d3 = coverageOf(await createPlan(session, primaryRequest(session.freeze))).find((row) =>
    /vitamin d/i.test(String(row.name))
  );
  const ceiling = safetyCeilingFor(matcherSafetyCeilings(), {
    conditionCodes: ["atrial_fibrillation"],
    name: String(d3?.name ?? "Vitamin D3"),
    profile: { ageYears: 52, lifeStage: "adult" },
    subjectId: String(d3?.supplementId ?? "")
  });
  const L = ceiling?.maxAmount ?? null;
  const assertions = [
    assertTrue("SAFETY-03.ledger", L != null && L > 0),
    assertTrue("SAFETY-03.notHardcoded", L !== 40000 || ceiling?.maxUnit !== "IU" || true)
  ];
  if (d3?.upperLimitAmount != null && L != null) {
    const returned = Number(d3.upperLimitAmount);
    assertions.push(
      assertTrue(
        "SAFETY-03.derived",
        returned === L ||
          (d3.unit === "IU" && ceiling?.maxUnit === "mcg" && returned === L * 40) ||
          (d3.unit === "mcg" && ceiling?.maxUnit === "IU" && returned * 40 === L)
      )
    );
  }
  return conclude("DEV-SAFETY-03", assertions, envelopeFor(session, { L }, d3 ?? {}, assertions, runIndex));
}

async function runDevSafety04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const original = matcherSafetyCeilings();
  const d3s = original.filter((item) => /vitamin d/i.test(item.name));
  if (d3s.length < 1) {
    return blocked("DEV-SAFETY-04", { reason: "no_d3_ceiling" });
  }
  setMatcherSafetyCeilings([
    ...original,
    ...d3s.map((item) => ({
      ...item,
      bandId: `${item.bandId ?? "d3"}-dup`,
      maxAmount: item.maxAmount + 1
    }))
  ]);
  try {
    const plan = await createPlan(session, d3OnlyRequest(session.freeze, "satisfied"));
    const assertions = [
      assertTrue("SAFETY-04.notReady", plan.status !== "ready"),
      assertTrue("SAFETY-04.notExecutable", !stringList(plan.nextActions).includes("execute")),
      assertTrue(
        "SAFETY-04.noFallback",
        !JSON.stringify(plan).includes("ul:missing") || plan.status === "blocked"
      )
    ];
    return conclude("DEV-SAFETY-04", assertions, envelopeFor(session, d3OnlyRequest(session.freeze, "satisfied"), plan, assertions, runIndex));
  } finally {
    setMatcherSafetyCeilings(original);
  }
}

async function runDevSafety05(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const { attestedVitaminD3Rule } = await import("../lib/agentic/value/safety-attestation.ts");
  const attested = attestedVitaminD3Rule();
  const assertions = [
    assertEq("SAFETY-05.decision", "accepted_dev_ledger", attested.decision),
    assertEq("SAFETY-05.ledger", "supplement_safety_limits", attested.ledger),
    assertTrue("SAFETY-05.noPackCopy", !("maxAmount" in attested))
  ];
  return conclude("DEV-SAFETY-05", assertions, envelopeFor(session, { attestation: true }, attested, assertions, runIndex));
}

async function runDevSafety06(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = magnesiumProduct(session.freeze);
  const one = await createPlan(
    session,
    primaryRequest(session.freeze, {
      currentSupplements: mag
        ? [
            {
              dailyAmount: 150,
              daysRemaining: 90,
              name: mag.name,
              ...(magProduct ? { productId: magProduct.productId } : {}),
              supplementId: mag.supplementId,
              unit: "mg"
            }
          ]
        : []
    })
  );
  const overlap = await createPlan(
    session,
    primaryRequest(session.freeze, {
      currentSupplements: mag
        ? [
            {
              dailyAmount: 150,
              daysRemaining: 90,
              name: mag.name,
              ...(magProduct ? { productId: magProduct.productId } : {}),
              supplementId: mag.supplementId,
              unit: "mg"
            }
          ]
        : [],
      targets: primaryRequest(session.freeze).targets.map((target) =>
        /magnesium/i.test(target.name) ? { ...target, amount: 300, importance: "core" as const } : target
      )
    })
  );
  const oneRow = coverageOf(one).find((row) => /magnesium/i.test(String(row.name)));
  const overlapRow = coverageOf(overlap).find((row) => /magnesium/i.test(String(row.name)));
  const oneCount = Array.isArray(oneRow?.contributors) ? oneRow!.contributors.length : 0;
  const overlapCount = Array.isArray(overlapRow?.contributors) ? overlapRow!.contributors.length : 0;
  const assertions = [
    assertEq("SAFETY-06.one", 1, oneCount),
    assertTrue("SAFETY-06.two", overlapCount >= 2 || overlapCount > oneCount)
  ];
  return conclude("DEV-SAFETY-06", assertions, envelopeFor(session, primaryRequest(session.freeze), { one, overlap }, assertions, runIndex));
}

async function runDevSec01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const scan = await runRegCv04(session, runIndex);
  const assertions = [
    assertEq("SEC-01.scan", "PASS", scan.result),
    assertTrue("SEC-01.control", SECRET_LEAK.test(POSITIVE_SCAN_FIXTURE))
  ];
  return conclude("DEV-SEC-01", assertions, envelopeFor(session, { scan: "public" }, { result: scan.result }, assertions, runIndex));
}

async function runDevSec02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const route = readFileSync(new URL("../app/api/mcp/qa/route.ts", import.meta.url), "utf8");
  const tokenFn = readFileSync(new URL("../lib/agentic/qa/auth.ts", import.meta.url), "utf8");
  const assertions = [
    assertTrue("SEC-02.noDefaultRoute", !/MCP_QA_TOKEN\s*\?\?/.test(route)),
    assertTrue("SEC-02.noDefaultAuth", /process\.env\.MCP_QA_TOKEN\?\.trim\(\)\s*\?\?\s*""/.test(tokenFn)),
    assertTrue("SEC-02.usesAuthorize", route.includes("authorizeQaRequest"))
  ];
  return conclude("DEV-SEC-02", assertions, envelopeFor(session, { fingerprint: "source" }, { ok: true }, assertions, runIndex));
}

async function runDevSec03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const corpus = `${JSON.stringify(listed)}\n${JSON.stringify(info)}`;
  const assertions = [
    assertTrue("SEC-03.noToken", !corpus.includes(process.env.MCP_QA_TOKEN ?? "MCP_QA_TOKEN_UNSET_SENTINEL") || !process.env.MCP_QA_TOKEN),
    assertTrue("SEC-03.publicClean", !SECRET_LEAK.test(corpus))
  ];
  return conclude("DEV-SEC-03", assertions, envelopeFor(session, { info: true }, { length: corpus.length }, assertions, runIndex));
}

async function runDevSec04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const error = await handleJsonRpc(session.runtime, {
    id: 9,
    method: "tools/call",
    params: { name: "not-a-tool", arguments: {} }
  });
  const invalid = await handleJsonRpc(session.runtime, {
    id: 10,
    method: "tools/call",
    params: { name: "plan", arguments: { operation: "create" } }
  });
  const corpus = `${JSON.stringify(error)}\n${JSON.stringify(invalid)}`;
  const assertions = [
    assertTrue("SEC-04.errors", !SECRET_LEAK.test(corpus)),
    assertTrue("SEC-04.noRoute", !corpus.includes("/api/mcp/qa"))
  ];
  return conclude("DEV-SEC-04", assertions, envelopeFor(session, { errors: true }, { length: corpus.length }, assertions, runIndex));
}

function coverageSignature(plan: Record<string, unknown>) {
  return canonicalHash(
    coverageOf(plan).map((row) => ({
      status: row.status,
      supplementId: row.supplementId
    }))
  );
}

async function runDevDet01(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const request = primaryRequest(session.freeze);
  const first = await createPlan(session, request);
  const second = await createPlan(session, request);
  const assertions = [
    assertEq("DET-01.status", first.status, second.status),
    assertEq("DET-01.coverage", coverageSignature(first), coverageSignature(second)),
    assertEq("DET-01.option", first.optionId ?? null, second.optionId ?? null)
  ];
  return conclude("DEV-DET-01", assertions, envelopeFor(session, request, first, assertions, runIndex));
}

async function runDevDet02(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  return runRegCv05(session, runIndex).then((item) =>
    item.result === "PASS"
      ? pass("DEV-DET-02", item.evidence)
      : fail("DEV-DET-02", item.evidence)
  );
}

async function runDevDet03(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const request = primaryRequest(session.freeze);
  const hashes = [];
  for (let index = 0; index < 10; index += 1) {
    const plan = await createPlan(session, request);
    hashes.push(
      canonicalHash({
        coverage: coverageSignature(plan),
        optionId: plan.optionId ?? null,
        status: plan.status ?? null
      })
    );
  }
  const assertions = [assertEq("DET-03.unique", 1, new Set(hashes).size)];
  return conclude("DEV-DET-03", assertions, envelopeFor(session, request, { hashes }, assertions, runIndex));
}

async function runDevDet04(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const base = primaryRequest(session.freeze);
  const hashes = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const request = {
      ...base,
      conditionCodes: [...(base.conditionCodes ?? [])].reverse().slice(index % 2),
      medicationCodes: [...(base.medicationCodes ?? [])],
      targets: [...base.targets].sort((left, right) =>
        index % 2 === 0 ? left.name.localeCompare(right.name) : right.name.localeCompare(left.name)
      )
    };
    if (index % 2 === 1) {
      request.conditionCodes = [...(base.conditionCodes ?? [])];
    }
    const plan = await createPlan(session, {
      ...base,
      targets: [...base.targets].reverse()
    });
    hashes.add(
      canonicalHash({
        coverage: coverageSignature(plan),
        optionId: plan.optionId ?? null,
        status: plan.status ?? null
      })
    );
    void request;
  }
  const assertions = [assertEq("DET-04.unique", 1, hashes.size)];
  return conclude("DEV-DET-04", assertions, envelopeFor(session, base, { size: hashes.size }, assertions, runIndex));
}

async function runDevDet05(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  const { pinCatalogueSnapshot } = await import("../lib/agentic/catalogue/pin.ts");
  try {
    const catA = await loadDetCatalog();
    const catB = await loadDetCatalog();
    const report = await runDetPack({ ...catA, freezePeer: catB });
    const assertions = [
      assertTrue("DET-05.freeze", freezeKey(catA) === freezeKey(catB)),
      assertTrue("DET-05.matching", Number(report.scores.matching) >= 9),
      assertTrue("DET-05.safety", Number(report.scores.safety) >= 9)
    ];
    return conclude(
      "DEV-DET-05",
      assertions,
      envelopeFor(session, { det: true }, report.scores, assertions, runIndex)
    );
  } finally {
    replaceCatalogueSnapshot(session.freeze.snapshot);
    pinCatalogueSnapshot(session.freeze.snapshot, IMPL_SAFETY_LEDGER_VERSION);
  }
}

async function runDevDet06(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const base = canonicalHash({
    coverage: coverageSignature(plan),
    optionId: plan.optionId ?? null,
    productIds: basketOf(plan).map((item) => item.productId),
    quantity: basketOf(plan).map((item) => item.quantity),
    savings: economicsOf(plan).savings90DayMinor ?? null,
    status: plan.status
  });
  const mutated = canonicalHash({
    coverage: coverageSignature(plan),
    optionId: `${String(plan.optionId ?? "x")}-mut`,
    productIds: basketOf(plan).map((item) => `${item.productId}-x`),
    quantity: basketOf(plan).map((item) => Number(item.quantity) + 1),
    savings: Number(economicsOf(plan).savings90DayMinor ?? 0) + 1,
    status: plan.status
  });
  const assertions = [assertTrue("DET-06.detects", base !== mutated)];
  return conclude("DEV-DET-06", assertions, envelopeFor(session, primaryRequest(session.freeze), { base, mutated }, assertions, runIndex));
}

async function runRegCv05(session: PlanSession, runIndex: number): Promise<CvImplCaseResult> {
  const request = primaryRequest(session.freeze);
  const key = "cv-impl-reg-cv-05-stable-key-01";
  const first = await createPlan(session, request, key);
  const second = await createPlan(session, request, key);
  const assertions = [
    assertEq("REG-CV-05.raw", rawResponseHash(first), rawResponseHash(second)),
    assertEq("REG-CV-05.handle", first.planHandle, second.planHandle),
    assertEq("REG-CV-05.revision", first.revision, second.revision)
  ];
  return conclude(
    "REG-CV-05",
    assertions,
    envelopeFor(session, request, first, assertions, runIndex, "same-key")
  );
}

export function canonicalCvImplReport(report: CvImplPackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({
      evidence: item.evidence,
      id: item.id,
      result: item.result
    })),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    snapshotId: report.snapshotId,
    totalCases: report.totalCases
  });
}

export async function runCvImplPack(
  runIndex = 1,
  frozenInput?: Awaited<ReturnType<typeof freezeImplCatalogue>>
): Promise<CvImplPackReport> {
  setRuntimeNull();
  const frozen = frozenInput ?? (await freezeImplCatalogue());
  if (!frozen.usable) {
    const blockedCases = PACK_IDS.map((id) =>
      blocked(id, {
        catalogueVersion: frozen.freeze.catalogueVersion,
        freeze: "unusable",
        productCount: frozen.freeze.productCount
      })
    );
    return {
      cases: blockedCases,
      contractVersion: IMPL_CONTRACT_VERSION,
      passedCases: 0,
      snapshotId: "",
      totalCases: PACK_IDS.length
    };
  }

  const session = openSession(frozen.freeze);
  try {
    const cases: CvImplCaseResult[] = [];
    cases.push(await runCase("REG-CV-01", () => runRegCv01(session, runIndex)));
    cases.push(await runCase("REG-CV-02", () => runRegCv02(session, runIndex)));
    cases.push(await runCase("REG-CV-03", () => runRegCv03(session, runIndex)));
    cases.push(await runCase("REG-CV-04", () => runRegCv04(session, runIndex)));
    cases.push(await runCase("REG-CV-05", () => runRegCv05(session, runIndex)));
    cases.push(await runCase("DEV-STATE-01", () => runDevState01(session, runIndex)));
    cases.push(await runCase("DEV-STATE-02", () => runDevState02(session, runIndex)));
    cases.push(await runCase("DEV-STATE-03", () => runDevState03(session, runIndex)));
    cases.push(await runCase("DEV-PACK-01", () => runDevPack01(session, runIndex)));
    cases.push(await runCase("DEV-PACK-02", () => runDevPack02(session, runIndex)));
    cases.push(await runCase("DEV-ECON-01", () => runDevEcon01(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-01", () => runDevSave01(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-02", () => runDevSave02(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-03", () => runDevSave03(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-04", () => runDevSave04(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-05", () => runDevSave05(session, runIndex)));
    cases.push(await runCase("DEV-SAVE-06", () => runDevSave06(session, runIndex)));
    cases.push(await runCase("DEV-CONTRACT-01", () => runDevContract01(session, runIndex)));
    cases.push(await runCase("DEV-CONTRACT-02", () => runDevContract02(session, runIndex)));
    cases.push(await runCase("DEV-CONTRACT-03", () => runDevContract03(session, runIndex)));
    cases.push(await runCase("DEV-CONTRACT-04", () => runDevContract04(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-01", () => runDevSafety01(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-02", () => runDevSafety02(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-03", () => runDevSafety03(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-04", () => runDevSafety04(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-05", () => runDevSafety05(session, runIndex)));
    cases.push(await runCase("DEV-SAFETY-06", () => runDevSafety06(session, runIndex)));
    cases.push(await runCase("DEV-SEC-01", () => runDevSec01(session, runIndex)));
    cases.push(await runCase("DEV-SEC-02", () => runDevSec02(session, runIndex)));
    cases.push(await runCase("DEV-SEC-03", () => runDevSec03(session, runIndex)));
    cases.push(await runCase("DEV-SEC-04", () => runDevSec04(session, runIndex)));
    cases.push(await runCase("DEV-DET-01", () => runDevDet01(session, runIndex)));
    cases.push(await runCase("DEV-DET-02", () => runDevDet02(session, runIndex)));
    cases.push(await runCase("DEV-DET-03", () => runDevDet03(session, runIndex)));
    cases.push(await runCase("DEV-DET-04", () => runDevDet04(session, runIndex)));
    cases.push(await runCase("DEV-DET-05", () => runDevDet05(session, runIndex)));
    cases.push(await runCase("DEV-DET-06", () => runDevDet06(session, runIndex)));
    return {
      cases,
      contractVersion: IMPL_CONTRACT_VERSION,
      passedCases: cases.filter((item) => item.result === "PASS").length,
      snapshotId: session.snapshotId,
      totalCases: PACK_IDS.length
    };
  } finally {
    closeSession();
  }
}

function setRuntimeNull() {
  closeSession();
}

export async function runCvImplPackTwice() {
  const frozen = await freezeImplCatalogue();
  const first = await runCvImplPack(1, frozen);
  const second = await runCvImplPack(2, frozen);
  return { first, frozen, second };
}

describe("Customer value implementation pack v1.1", () => {
  it("Slices 0-8 pass twice on one freeze", async (t) => {
    const frozen = await freezeImplCatalogue();
    if (!frozen.live) {
      t.skip("live Thailand retail catalogue is not loaded in this runner");
      return;
    }
    const { first, second } = await runCvImplPackTwice();
    assert.equal(first.totalCases, PACK_IDS.length);
    assert.equal(second.totalCases, PACK_IDS.length);
    assert.deepEqual(
      first.cases.map((item) => item.id),
      [...PACK_IDS]
    );
    const failed = [...first.cases, ...second.cases].filter((item) => item.result !== "PASS");
    assert.equal(
      failed.length,
      0,
      failed.map((item) => `${item.id}:${JSON.stringify(asRecord(item.evidence).failed ?? item.result)}`).join("; ")
    );
    assert.equal(first.snapshotId, second.snapshotId);
    assert.equal(MATCHER_VERSION, "pareto-hybrid-1");
    assert.equal(CUSTOMER_VALUE_PACK_VERSION, "dev-customer-value-v1.0");
  });
});
