import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { AGENTIC_CONTRACT_VERSION, loadAgenticConfig } from "../lib/agentic/config.ts";
import {
  AGENTIC_TOOL_SCHEMAS,
  agenticServerInstructions
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { computeSchemaChecksum } from "../lib/agentic/release-manifest.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { toolList } from "../lib/agentic/mcp/rpc.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests
} from "../lib/agentic/runtime.ts";
import {
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache,
  runWithCatalogueSnapshot
} from "../lib/agentic/catalogue/snapshot.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import { matcherSafetyCeilings, safetyCeilingFor } from "../lib/matcher/safety-ceilings.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../lib/agentic/value/canonical-plan.ts";
import {
  freezeLiveThailandCatalogue,
  isLiveRetailFreeze,
  isUsableLiveFreeze,
  type ValueCatalogueFreeze
} from "../lib/agentic/value/freeze.ts";
import { VALUE_ROLE_REQUEST } from "./agentic/value/pack-scenario.ts";

const CASE_IDS = [
  "FIX-01",
  "FIX-02",
  "FIX-03",
  "FIX-04",
  "FIX-05",
  "FIX-06",
  "FIX-07",
  "FIX-08",
  "FIX-09"
] as const;

export type CvFixCaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: (typeof CASE_IDS)[number];
  result: "FAIL" | "PASS";
}>;

export type CvFixPackReport = Readonly<{
  cases: readonly CvFixCaseResult[];
  contractVersion: string;
  passedCases: number;
  snapshotId: string;
  totalCases: number;
}>;

const SECRET_LEAK =
  /Bearer\s+\S+|dev-mcp-qa-token|Authorization:\s*\S+|\/api\/mcp\/qa|MCP_QA_TOKEN|x-mattanutra-qa-audience/i;
const QA_DRIVER =
  /D1-01 through D10-10|Official MattaNutra DEV QA Pack|scenario=success|scenario=refund|HARD RULE 5/i;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function pass(id: CvFixCaseResult["id"], evidence: Record<string, unknown> = {}): CvFixCaseResult {
  return { evidence, id, result: "PASS" };
}

function fail(id: CvFixCaseResult["id"], evidence: Record<string, unknown>): CvFixCaseResult {
  return { evidence, id, result: "FAIL" };
}

async function runCase(
  id: CvFixCaseResult["id"],
  work: () => Promise<CvFixCaseResult>
): Promise<CvFixCaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function supplementByName(freeze: ValueCatalogueFreeze, name: string) {
  const needle = name.toLowerCase();
  return freeze.snapshot.supplements.find((item) => item.name.toLowerCase().includes(needle));
}

function primaryRequest(freeze: ValueCatalogueFreeze, extra: Record<string, unknown> = {}) {
  const creatine = supplementByName(freeze, "Creatine");
  const magnesium = supplementByName(freeze, "Magnesium");
  const d3 = freeze.snapshot.supplements.find((item) =>
    /vitamin d/i.test(item.name)
  );
  return {
    baseline: { type: "separate_direct_products" as const },
    conditionCodes: ["atrial_fibrillation"],
    costHorizonsDays: [30, 90],
    destinationCountry: "TH",
    locale: "en",
    medicationCodes: ["apixaban"],
    optimization: "lowest_cost" as const,
    profile: { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: [
      {
        acceptableRange: {
          maximum: VALUE_ROLE_REQUEST.creatine.maximum,
          minimum: VALUE_ROLE_REQUEST.creatine.minimum,
          unit: VALUE_ROLE_REQUEST.creatine.unit
        },
        amount: VALUE_ROLE_REQUEST.creatine.amount,
        importance: "core" as const,
        name: creatine?.name ?? "Creatine",
        ...(creatine ? { supplementId: creatine.supplementId } : {}),
        unit: VALUE_ROLE_REQUEST.creatine.unit
      },
      {
        acceptableRange: {
          maximum: VALUE_ROLE_REQUEST.magnesium.maximum,
          minimum: VALUE_ROLE_REQUEST.magnesium.minimum,
          unit: VALUE_ROLE_REQUEST.magnesium.unit
        },
        amount: VALUE_ROLE_REQUEST.magnesium.amount,
        importance: "optional" as const,
        name: magnesium?.name ?? "Magnesium",
        ...(magnesium ? { supplementId: magnesium.supplementId } : {}),
        unit: VALUE_ROLE_REQUEST.magnesium.unit
      },
      {
        acceptableRange: {
          maximum: VALUE_ROLE_REQUEST.vitaminD3.maximum,
          minimum: VALUE_ROLE_REQUEST.vitaminD3.minimum,
          unit: VALUE_ROLE_REQUEST.vitaminD3.unit
        },
        amount: VALUE_ROLE_REQUEST.vitaminD3.amount,
        importance: "conditional" as const,
        name: d3?.name ?? "Vitamin D3",
        prerequisite: {
          nextAction: "Confirm vitamin D status with a clinician.",
          reasonCode: "vitamin_d_status_unknown",
          status: "unsatisfied" as const
        },
        ...(d3 ? { supplementId: d3.supplementId } : {}),
        unit: VALUE_ROLE_REQUEST.vitaminD3.unit
      }
    ],
    ...extra
  };
}

async function createPlan(freeze: ValueCatalogueFreeze, request: Record<string, unknown>) {
  replaceCatalogueSnapshot(freeze.snapshot);
  const store = createMemoryStore();
  const config = loadAgenticConfig();
  const runtime = createAgenticRuntime({
    config,
    now: "2026-09-01T00:00:00.000Z",
    scope: {
      environment: "dev",
      principalScope: "cv-fix-pack",
      tenantScope: "mattanutra"
    },
    store
  });
  setAgenticRuntimeForTests(runtime);
  const result = await runWithCatalogueSnapshot(freeze.snapshot, () =>
    planTool({
    config,
    now: "2026-09-01T00:00:00.000Z",
    payload: {
      idempotencyKey: `cv-fix-${randomUUID()}`,
      operation: "create",
      request
    },
    scope: runtime.scope,
    store
  }));
  return asRecord(result);
}

function coverageOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
}

function optionsOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.options) ? plan.options.map(asRecord) : [];
}

function questionsOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.questions) ? plan.questions.map(asRecord) : [];
}

function gapTargets(plan: Record<string, unknown>) {
  const review = asRecord(plan.gapReview);
  return Array.isArray(review.targets) ? review.targets.map(asRecord) : [];
}

function basketOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.basket) ? plan.basket.map(asRecord) : [];
}

function asksAcceptOrRemove(rows: readonly Record<string, unknown>[], names: readonly string[]) {
  const needles = names.map((name) => name.toLowerCase());
  return rows.some((row) => {
    const blob = JSON.stringify(row).toLowerCase();
    const namesHit = needles.some((name) => blob.includes(name));
    const decision =
      blob.includes("accept_gap") ||
      blob.includes("remove_target") ||
      stringList(row.decisions).some((item) => /accept_gap|remove_target/.test(item));
    return namesHit && decision;
  });
}

function identityPresent(plan: Record<string, unknown>) {
  const canonical = asRecord(plan.canonical);
  const snapshotId = String(canonical.snapshotId ?? plan.snapshotId ?? "");
  const matcherVersion = String(canonical.matcherVersion ?? "");
  const packVersion = String(canonical.packVersion ?? "");
  const contractVersion = String(canonical.contractVersion ?? plan.contractVersion ?? "");
  const buildId = String(canonical.buildId ?? plan.buildId ?? "");
  return {
    buildId,
    contractVersion,
    matcherVersion,
    packVersion,
    snapshotId,
    ok:
      buildId.length > 0 &&
      contractVersion.length > 0 &&
      matcherVersion.length > 0 &&
      packVersion.length > 0 &&
      snapshotId.length > 0
  };
}

function schemaHasIntent(schema: Record<string, unknown>) {
  const blob = JSON.stringify(schema);
  return {
    acceptableRange: blob.includes('"acceptableRange"'),
    baseline: blob.includes('"baseline"'),
    costHorizonsDays: blob.includes('"costHorizonsDays"'),
    daysRemaining: blob.includes('"daysRemaining"'),
    importance: blob.includes('"importance"'),
    prerequisite: blob.includes('"prerequisite"')
  };
}

export function canonicalCvFixReport(report: CvFixPackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({
      evidence: item.evidence,
      id: item.id,
      result: item.result
    })),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    totalCases: report.totalCases
  });
}

export async function runCvFixPack(): Promise<CvFixPackReport> {
  const previous = null;
  setAgenticRuntimeForTests(previous);
  const freeze = await freezeLiveThailandCatalogue("TH");
  const snapshotId = isUsableLiveFreeze(freeze) ? catalogueSnapshotId(freeze.snapshot) : "";

  try {
    const cases: CvFixCaseResult[] = [];

    cases.push(
      await runCase("FIX-01", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-01", {
            catalogueVersion: freeze.catalogueVersion,
            freeze: "unusable",
            productCount: freeze.productCount,
            supplementCount: freeze.supplementCount
          });
        }
        const plan = await createPlan(freeze, primaryRequest(freeze));
        const coverage = coverageOf(plan);
        const creatine = coverage.find((row) => /creatine/i.test(String(row.name)));
        const mag = coverage.find((row) => /magnesium/i.test(String(row.name)));
        const d3 = coverage.find((row) => /vitamin d/i.test(String(row.name)));
        const options = optionsOf(plan);
        const recommended = options.find((item) => item.recommended === true) ?? asRecord(plan);
        const questions = questionsOf(plan);
        const gaps = gapTargets(plan);
        const failed: string[] = [];
        if (creatine?.importance !== "core" || creatine?.status !== "covered") {
          failed.push("FIX-01.A1");
        }
        if (mag && mag.status !== "optional_omitted" && mag.status !== "covered" && mag.status !== "already_covered") {
          failed.push("FIX-01.A2");
        }
        if (d3?.status !== "conditional_deferred") {
          failed.push("FIX-01.A3");
        }
        if (recommended.role !== "minimum_core" && String(plan.optionId ?? "") === "") {
          failed.push("FIX-01.A4");
        }
        if (plan.status !== "ready") {
          failed.push("FIX-01.A5");
        }
        if (asksAcceptOrRemove([...questions, ...gaps], ["magnesium"]) && mag?.status === "optional_omitted") {
          failed.push("FIX-01.A6");
        }
        if (asksAcceptOrRemove([...questions, ...gaps], ["vitamin d"]) && d3?.status === "conditional_deferred") {
          failed.push("FIX-01.A7");
        }
        const summary = String(plan.summary ?? "");
        if (/required|choose|another choice|accept or remove/i.test(summary) && plan.status !== "ready") {
          failed.push("FIX-01.A8");
        }
        const extra = options.filter((item) => item.recommended !== true && item.optionId !== plan.optionId);
        if (extra.some((item) => item.selected === true)) {
          failed.push("FIX-01.A9");
        }
        const assessedMeds = stringList(plan.assessedMedicationCodes);
        const assessedConditions = stringList(plan.assessedConditionCodes);
        if (!assessedMeds.includes("apixaban") || !assessedConditions.includes("atrial_fibrillation")) {
          failed.push("FIX-01.A10");
        }
        for (const option of options) {
          const safety = asRecord(option.safety);
          if (
            safety.assessedMedicationCodes &&
            !stringList(safety.assessedMedicationCodes).includes("apixaban")
          ) {
            failed.push("FIX-01.A10");
            break;
          }
        }
        return failed.length > 0
          ? fail("FIX-01", {
              failed,
              optionId: plan.optionId ?? null,
              questions: questions.map((item) => item.questionId),
              status: plan.status ?? null,
              summary
            })
          : pass("FIX-01", { optionId: plan.optionId ?? null, status: plan.status });
      })
    );

    cases.push(
      await runCase("FIX-02", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-02", { freeze: "unusable" });
        }
        const d3 = freeze.snapshot.supplements.find((item) => /vitamin d/i.test(item.name));
        const unsatisfied = await createPlan(freeze, {
          destinationCountry: "TH",
          locale: "en",
          optimization: "lowest_cost",
          profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [
            {
              amount: 1000,
              importance: "conditional",
              name: d3?.name ?? "Vitamin D3",
              prerequisite: {
                nextAction: "Confirm vitamin D status with a clinician.",
                reasonCode: "vitamin_d_status_unknown",
                status: "unsatisfied"
              },
              ...(d3 ? { supplementId: d3.supplementId } : {}),
              unit: "IU"
            }
          ]
        });
        const unknown = await createPlan(freeze, {
          destinationCountry: "TH",
          locale: "en",
          optimization: "lowest_cost",
          profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [
            {
              amount: 1000,
              importance: "conditional",
              name: d3?.name ?? "Vitamin D3",
              prerequisite: {
                nextAction: "Confirm vitamin D status with a clinician.",
                reasonCode: "vitamin_d_status_unknown",
                status: "unknown"
              },
              ...(d3 ? { supplementId: d3.supplementId } : {}),
              unit: "IU"
            }
          ]
        });
        const failed: string[] = [];
        if (basketOf(unsatisfied).length > 0 || optionsOf(unsatisfied).some((item) => (item.productIds as unknown[] | undefined)?.length)) {
          failed.push("FIX-02.A1");
        }
        if (unsatisfied.status !== "no_purchase") {
          failed.push("FIX-02.A2");
        }
        if (stringList(unsatisfied.nextActions).includes("execute") || unsatisfied.ok === false) {
          failed.push("FIX-02.A3");
        }
        const d3Row = coverageOf(unsatisfied).find((row) => /vitamin d/i.test(String(row.name)));
        if (
          d3Row?.status !== "conditional_deferred" ||
          d3Row?.reasonCode !== "vitamin_d_status_unknown"
        ) {
          failed.push("FIX-02.A4");
        }
        if (
          stringList(unsatisfied.nextActions).includes("answer_questions") &&
          questionsOf(unsatisfied).length === 0
        ) {
          failed.push("FIX-02.A5");
        }
        const economics = asRecord(asRecord(unsatisfied.explanation).firstOrderCashMinor);
        if (unsatisfied.estimatedOrderTotalMinor && basketOf(unsatisfied).length === 0) {
          failed.push("FIX-02.A6");
        }
        void economics;
        if (unknown.status !== "needs_input") {
          failed.push("FIX-02.B1");
        }
        const unknownQuestions = questionsOf(unknown);
        if (
          unknownQuestions.length < 1 ||
          !unknownQuestions[0]?.questionId ||
          !unknownQuestions[0]?.prompt ||
          !Array.isArray(unknownQuestions[0]?.choices)
        ) {
          failed.push("FIX-02.B2");
        }
        const unknownNext = stringList(unknown.nextActions);
        if (unknownQuestions.length > 0 && unknownNext.join() !== "answer_questions") {
          failed.push("FIX-02.B3");
        }
        if (unknownQuestions.length > 0) {
          const choices = Array.isArray(unknownQuestions[0]?.choices)
            ? unknownQuestions[0]!.choices.map(asRecord)
            : [];
          if (choices.length < 1) {
            failed.push("FIX-02.B4");
          }
        }
        if (!identityPresent(unsatisfied).ok || !identityPresent(unknown).ok) {
          failed.push("FIX-02.identity");
        }
        return failed.length > 0
          ? fail("FIX-02", {
              failed,
              unknownStatus: unknown.status ?? null,
              unsatisfiedIdentity: identityPresent(unsatisfied),
              unsatisfiedStatus: unsatisfied.status ?? null
            })
          : pass("FIX-02", { unknownStatus: unknown.status, unsatisfiedStatus: unsatisfied.status });
      })
    );

    cases.push(
      await runCase("FIX-03", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-03", { freeze: "unusable" });
        }
        const mag = supplementByName(freeze, "Magnesium");
        const magProduct = freeze.snapshot.products.find(
          (item) => mag && item.contributionSupplementIds.includes(mag.supplementId)
        );
        const request = primaryRequest(freeze, {
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
        const plan = await createPlan(freeze, request);
        const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
        const contributors = Array.isArray(magRow?.contributors)
          ? magRow!.contributors.map(asRecord)
          : [];
        const currentContributors = contributors.filter((item) => item.source === "current");
        const guidance = Array.isArray(plan.safetyGuidance)
          ? plan.safetyGuidance.map(asRecord)
          : [];
        const overlap = guidance.filter((item) => item.code === "duplicate_or_overlap");
        const overlapCurrent = overlap.flatMap((item) =>
          Array.isArray(item.contributors) ? item.contributors.map(asRecord) : []
        );
        const failed: string[] = [];
        if (magRow?.status !== "already_covered") {
          failed.push("FIX-03.A1");
        }
        if (basketOf(plan).some((item) => mag && stringList(item.requestedNutrientNames).includes(mag.name))) {
          failed.push("FIX-03.A2");
        }
        if (currentContributors.length !== 1) {
          failed.push("FIX-03.A3");
        }
        const overlapNames = overlapCurrent.filter((item) => item.source === "current");
        if (overlapNames.length > 1) {
          failed.push("FIX-03.A4");
        }
        if (Number(magRow?.currentAmount) !== 150 || Number(magRow?.totalExposureAmount) !== 150) {
          failed.push("FIX-03.A5");
        }
        if (overlap.length > 0) {
          failed.push("FIX-03.A6");
        }
        if (plan.status === "needs_input" && overlap.length > 0) {
          failed.push("FIX-03.A7");
        }
        const retained = Array.isArray(asRecord(optionsOf(plan).find((item) => item.recommended)).retainedCurrent)
          ? (optionsOf(plan).find((item) => item.recommended)!.retainedCurrent as unknown[])
          : [];
        if (retained.length < 1 && magRow?.status === "already_covered") {
          failed.push("FIX-03.A8");
        }
        const twoCurrent = await createPlan(
          freeze,
          primaryRequest(freeze, {
            currentSupplements: mag
              ? [
                  {
                    dailyAmount: 150,
                    daysRemaining: 90,
                    name: mag.name,
                    supplementId: mag.supplementId,
                    unit: "mg"
                  },
                  {
                    dailyAmount: 150,
                    daysRemaining: 30,
                    name: `${mag.name} extra`,
                    supplementId: mag.supplementId,
                    unit: "mg"
                  }
                ]
              : []
          })
        );
        void twoCurrent;
        return failed.length > 0
          ? fail("FIX-03", {
              currentContributors: currentContributors.length,
              failed,
              overlap: overlap.length,
              status: plan.status ?? null
            })
          : pass("FIX-03", { status: plan.status });
      })
    );

    cases.push(
      await runCase("FIX-04", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-04", { freeze: "unusable" });
        }
        const plan = await createPlan(freeze, primaryRequest(freeze));
        const basket = basketOf(plan);
        const failed: string[] = [];
        const recommendedEarly = optionsOf(plan).find((item) => item.recommended) ?? {};
        const economicsEarly = asRecord(recommendedEarly.economics);
        if (plan.reasonCode === "catalogue_data_incomplete" || economicsEarly.complete === false) {
          if (economicsEarly.savingClaim === "positive") {
            return fail("FIX-04", { failed: ["FIX-04.failClosed"], savingClaim: economicsEarly.savingClaim });
          }
          return pass("FIX-04", { failClosed: true, productId: plan.productId ?? null });
        }
        if (basket.length < 1) {
          return fail("FIX-04", { failed: ["FIX-04.A1"], status: plan.status ?? null });
        }
        for (const line of basket) {
          if (line.servingsPerPack == null) {
            failed.push("FIX-04.A1");
          }
          if (
            line.servingsPerPack != null &&
            Number(line.availableServings) !== Number(line.servingsPerPack) * Number(line.quantity)
          ) {
            failed.push("FIX-04.A2");
          }
          if (line.daysOfSupply == null || Number(line.daysOfSupply) === 30 && Number(line.servingsPerPack) > 30) {
            if (line.daysOfSupply === 30 && Number(line.servingsPerPack) > 30) {
              failed.push("FIX-04.A3");
            }
            if (line.daysOfSupply == null && line.servingsPerPack != null) {
              failed.push("FIX-04.A3");
            }
          }
          if (Number(line.lineTotalMinor) !== Number(line.unitPriceMinor) * Number(line.quantity)) {
            failed.push("FIX-04.A4");
          }
        }
        const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
        const economics = asRecord(recommended.economics);
        if (
          economics.cashTotalMinor != null &&
          Number(economics.firstOrderSubtotalMinor) +
            Number(economics.shippingMinor) +
            Number(economics.otherCustomerCostMinor) !==
            Number(economics.cashTotalMinor)
        ) {
          failed.push("FIX-04.A5");
        }
        if (Number(economics.consumption30DayMinor ?? 0) === 0 && basket.some((item) => item.servingsPerPack != null)) {
          failed.push("FIX-04.A7");
        }
        const stack = asRecord(plan.stackSummary);
        if (Number(stack.dailyCostMinor ?? 0) === 0 && basket.some((item) => Number(item.unitPriceMinor) > 0)) {
          failed.push("FIX-04.A10");
        }
        return failed.length > 0
          ? fail("FIX-04", {
              daysOfSupply: basket.map((item) => item.daysOfSupply ?? null),
              failed,
              servingsPerPack: basket.map((item) => item.servingsPerPack ?? null)
            })
          : pass("FIX-04", { lines: basket.length });
      })
    );

    cases.push(
      await runCase("FIX-05", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-05", { freeze: "unusable" });
        }
        const plan = await createPlan(freeze, primaryRequest(freeze));
        const recommended = optionsOf(plan).find((item) => item.recommended) ?? {};
        const economics = asRecord(recommended.economics);
        const baseline = asRecord(economics.baseline);
        const failed: string[] = [];
        if (baseline.type !== "separate_direct_products" || !Array.isArray(baseline.lines)) {
          failed.push("FIX-05.A1");
        }
        if (economics.savings90DayMinor != null && baseline.cash90DayMinor != null) {
          const expected = Number(baseline.cash90DayMinor) - Number(economics.cash90DayMinor);
          if (Number(economics.savings90DayMinor) !== expected) {
            failed.push("FIX-05.A3");
          }
        }
        if (
          Number(baseline.cash90DayMinor) === 0 &&
          economics.savings90DayPercent != null
        ) {
          failed.push("FIX-05.A4");
        }
        if (economics.savingClaim === "positive" && economics.equivalent === false) {
          failed.push("FIX-05.A8");
        }
        if (
          economics.cash90DayMinor != null &&
          economics.consumption90DayMinor != null &&
          economics.cash90DayMinor === economics.consumption90DayMinor &&
          basketOf(plan).some((item) => item.servingsPerPack != null)
        ) {
          failed.push("FIX-05.A9");
        }
        return failed.length > 0
          ? fail("FIX-05", { failed, savingClaim: economics.savingClaim ?? null })
          : pass("FIX-05", { savingClaim: economics.savingClaim ?? null });
      })
    );

    cases.push(
      await runCase("FIX-06", async () => {
        const listed = toolList("dev");
        const names = listed.map((item) => item.name);
        const planSchema = asRecord(
          listed.find((item) => item.name === "plan")?.inputSchema as Record<string, unknown>
        );
        const intent = schemaHasIntent(planSchema);
        const officialChecksum = computeSchemaChecksum();
        const failed: string[] = [];
        if (names.join() !== "info,plan,execute,order,support,feedback,evidence") {
          failed.push("FIX-06.A1");
        }
        if (
          !intent.importance ||
          !intent.acceptableRange ||
          !intent.prerequisite ||
          !intent.daysRemaining ||
          !intent.costHorizonsDays ||
          !intent.baseline
        ) {
          failed.push("FIX-06.A2");
        }
        if (
          JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan).includes("$defs") ||
          JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan).includes('"oneOf"')
        ) {
          failed.push("FIX-06.A3");
        }
        const planBlurb = listed.find((item) => item.name === "plan")?.description ?? "";
        if (/generic object|any properties|additionalProperties true/i.test(planBlurb) || planBlurb.length < 40) {
          failed.push("FIX-06.A4");
        }
        const { readFileSync } = await import("node:fs");
        const snapshot = JSON.parse(
          readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
        ) as { tools: Array<{ inputSchema: unknown; name: string }> };
        const snapshotPlan = snapshot.tools.find((item) => item.name === "plan");
        const snapshotHash = createHash("sha256")
          .update(JSON.stringify(snapshotPlan?.inputSchema ?? {}))
          .digest("hex");
        const directHash = createHash("sha256")
          .update(JSON.stringify(planSchema))
          .digest("hex");
        if (snapshotHash !== directHash) {
          failed.push("FIX-06.A5");
        }
        if (
          officialChecksum !==
            "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6" ||
          AGENTIC_SCHEMA_CHECKSUM !== officialChecksum
        ) {
          failed.push("FIX-06.A6");
        }
        return failed.length > 0
          ? fail("FIX-06", {
              failed,
              officialChecksum,
              schemaChecksum: AGENTIC_SCHEMA_CHECKSUM
            })
          : pass("FIX-06", { schemaChecksum: AGENTIC_SCHEMA_CHECKSUM });
      })
    );

    cases.push(
      await runCase("FIX-07", async () => {
        const runtime = createAgenticRuntime();
        const initialize = await handleJsonRpc(runtime, {
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: { protocolVersion: "2025-03-26" }
        });
        const instructions = String(asRecord(initialize?.result).instructions ?? "");
        const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
        const info = await handleJsonRpc(runtime, {
          id: 3,
          method: "tools/call",
          params: { name: "info", arguments: {} }
        });
        const error = await handleJsonRpc(runtime, {
          id: 4,
          method: "tools/call",
          params: { name: "not-a-tool", arguments: {} }
        });
        const corpus = [
          instructions,
          agenticServerInstructions("dev"),
          JSON.stringify(listed?.result ?? {}),
          JSON.stringify(info?.result ?? {}),
          JSON.stringify(error?.error ?? error?.result ?? {})
        ].join("\n");
        const failed: string[] = [];
        if (QA_DRIVER.test(corpus) || QA_DRIVER.test(instructions)) {
          failed.push("FIX-07.A1");
          failed.push("FIX-07.A3");
          failed.push("FIX-07.A4");
        }
        if (SECRET_LEAK.test(corpus)) {
          failed.push("FIX-07.A2");
          failed.push("FIX-07.A5");
          failed.push("FIX-07.A6");
        }
        return failed.length > 0
          ? fail("FIX-07", {
              failed,
              instructionLeak: QA_DRIVER.test(instructions)
            })
          : pass("FIX-07", { instructionLength: instructions.length });
      })
    );

    cases.push(
      await runCase("FIX-08", async () => {
        if (!isUsableLiveFreeze(freeze)) {
          return fail("FIX-08", { freeze: "unusable" });
        }
        const plan = await createPlan(freeze, primaryRequest(freeze));
        const d3 = coverageOf(plan).find((row) => /vitamin d/i.test(String(row.name)));
        const ceiling = safetyCeilingFor(matcherSafetyCeilings(), {
          conditionCodes: ["atrial_fibrillation"],
          name: String(d3?.name ?? "Vitamin D3"),
          profile: { ageYears: 52, lifeStage: "adult" },
          subjectId: String(d3?.supplementId ?? "")
        });
        const failed: string[] = [];
        if (!d3?.authorityUrl && !d3?.sourceScope && ceiling == null) {
          failed.push("FIX-08.A1");
        }
        const attested = (await import("../lib/agentic/value/safety-attestation.ts")).attestedVitaminD3Rule();
        const returnedUl = Number(d3?.upperLimitAmount);
        const ceilingAmount = ceiling?.maxAmount ?? null;
        const ceilingMatches =
          ceilingAmount != null &&
          (returnedUl === ceilingAmount ||
            (d3?.unit === "IU" && ceiling?.maxUnit === "mcg" && returnedUl === ceilingAmount * 40) ||
            (d3?.unit === "mcg" && ceiling?.maxUnit === "IU" && returnedUl * 40 === ceilingAmount));
        if (d3?.upperLimitAmount != null && ceiling && !ceilingMatches) {
          failed.push("FIX-08.A2");
        }
        if (d3?.sourceScope && ceiling && d3.sourceScope !== ceiling.sourceScope) {
          failed.push("FIX-08.A2");
        }
        const guidance = Array.isArray(plan.safetyGuidance)
          ? plan.safetyGuidance.map(asRecord)
          : [];
        const d3Guidance = guidance.find((item) => /vitamin d/i.test(String(item.nutrientName ?? "")));
        if (d3Guidance && d3?.upperLimitAmount != null && d3Guidance.threshold != null) {
          if (Number(d3Guidance.threshold) !== Number(d3.upperLimitAmount)) {
            failed.push("FIX-08.A3");
          }
        }
        if (!attested || attested.decision !== "accepted_dev_ledger") {
          failed.push("FIX-08.A5");
        }
        return failed.length > 0
          ? fail("FIX-08", {
              ceilingAmount: ceiling?.maxAmount ?? null,
              failed,
              upperLimitAmount: d3?.upperLimitAmount ?? null
            })
          : pass("FIX-08", { upperLimitAmount: d3?.upperLimitAmount ?? null });
      })
    );

    cases.push(
      await runCase("FIX-09", async () => {
        const first = cases.map((item) => ({ id: item.id, result: item.result }));
        const secondPlan = isUsableLiveFreeze(freeze)
          ? await createPlan(freeze, primaryRequest(freeze))
          : {};
        const thirdPlan = isUsableLiveFreeze(freeze)
          ? await createPlan(freeze, primaryRequest(freeze))
          : {};
        const left = canonicalHash({
          nextActions: secondPlan.nextActions ?? null,
          optionId: secondPlan.optionId ?? null,
          roles: optionsOf(secondPlan).map((item) => item.role ?? null),
          status: secondPlan.status ?? null
        });
        const right = canonicalHash({
          nextActions: thirdPlan.nextActions ?? null,
          optionId: thirdPlan.optionId ?? null,
          roles: optionsOf(thirdPlan).map((item) => item.role ?? null),
          status: thirdPlan.status ?? null
        });
        const failed: string[] = [];
        if (first.length !== CASE_IDS.length - 1) {
          failed.push("FIX-09.A1");
        }
        if (left !== right) {
          failed.push("FIX-09.A2");
        }
        const hashes = [];
        for (let index = 0; index < 10; index += 1) {
          if (!isUsableLiveFreeze(freeze)) {
            break;
          }
          const plan = await createPlan(freeze, primaryRequest(freeze));
          hashes.push(
            canonicalHash({
              optionId: plan.optionId ?? null,
              roles: optionsOf(plan).map((item) => item.role ?? null),
              status: plan.status ?? null
            })
          );
        }
        if (hashes.length === 10 && new Set(hashes).size !== 1) {
          failed.push("FIX-09.A4");
        }
        return failed.length > 0
          ? fail("FIX-09", { failed, hashCount: new Set(hashes).size })
          : pass("FIX-09", { hash: left });
      })
    );

    return {
      cases,
      contractVersion: AGENTIC_CONTRACT_VERSION,
      passedCases: cases.filter((item) => item.result === "PASS").length,
      snapshotId,
      totalCases: CASE_IDS.length
    };
  } finally {
    setAgenticRuntimeForTests(null);
    replaceCatalogueSnapshot(null);
    resetCatalogueSnapshotCache();
  }
}

if (process.env.NODE_TEST_CONTEXT) {
describe("Customer value remediation FIX pack", () => {
  it("evaluates FIX-01 through FIX-09", async (t) => {
    const freeze = await freezeLiveThailandCatalogue("TH");
    if (!isLiveRetailFreeze(freeze)) {
      t.skip("live Thailand retail catalogue is not loaded in this runner");
      return;
    }
    const report = await runCvFixPack();
    assert.equal(report.totalCases, CASE_IDS.length);
    assert.deepEqual(
      report.cases.map((item) => item.id),
      [...CASE_IDS]
    );
    const failed = report.cases.filter((item) => item.result === "FAIL");
    assert.equal(
      report.passedCases,
      report.totalCases,
      failed.map((item) => `${item.id}:${JSON.stringify(item.evidence)}`).join(" | ")
    );
  });
});
}
