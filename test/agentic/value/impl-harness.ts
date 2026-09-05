import { randomUUID } from "node:crypto";

import {
  AGENTIC_CONTRACT_VERSION,
  GUIDANCE_RULES_VERSION,
  loadAgenticConfig
} from "../../../lib/agentic/config.ts";
import { planTool } from "../../../lib/agentic/plan/service.ts";
import { createMemoryStore } from "../../../lib/agentic/store/memory.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import {
  installedCatalogueSnapshot,
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache,
  runWithCatalogueSnapshot
} from "../../../lib/agentic/catalogue/snapshot.ts";
import { resetQaPersistForTests } from "../../../lib/agentic/qa/persist.ts";
import { pinCatalogueSnapshot, resetCataloguePins } from "../../../lib/agentic/catalogue/pin.ts";
import { catalogueSnapshotId } from "../../../lib/agentic/catalogue/freeze.ts";
import {
  freezeLiveThailandCatalogue,
  isLiveRetailFreeze,
  isUsableLiveFreeze,
  type ValueCatalogueFreeze
} from "../../../lib/agentic/value/freeze.ts";
import { VALUE_ROLE_REQUEST } from "./pack-scenario.ts";
import { asRecord, stringList } from "./impl-evidence.ts";
import type { AgenticStore } from "../../../lib/agentic/store/types.ts";

export type PlanSession = Readonly<{
  config: ReturnType<typeof loadAgenticConfig>;
  freeze: ValueCatalogueFreeze;
  runtime: AgenticRuntime;
  snapshotId: string;
  store: AgenticStore;
}>;

export function supplementByName(freeze: ValueCatalogueFreeze, name: string) {
  const needle = name.toLowerCase();
  return freeze.snapshot.supplements.find((item) => item.name.toLowerCase().includes(needle));
}

export function vitaminD3(freeze: ValueCatalogueFreeze) {
  return freeze.snapshot.supplements.find((item) => /vitamin d/i.test(item.name));
}

export function magnesiumProduct(freeze: ValueCatalogueFreeze) {
  const mag = supplementByName(freeze, "Magnesium");
  if (!mag) {
    return null;
  }
  return (
    freeze.snapshot.products.find((item) =>
      item.contributionSupplementIds.includes(mag.supplementId)
    ) ?? null
  );
}

export function primaryRequest(
  freeze: ValueCatalogueFreeze,
  extra: Record<string, unknown> = {}
) {
  const creatine = supplementByName(freeze, "Creatine");
  const magnesium = supplementByName(freeze, "Magnesium");
  const d3 = vitaminD3(freeze);
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

export function d3OnlyRequest(
  freeze: ValueCatalogueFreeze,
  status: "unknown" | "unsatisfied" | "satisfied"
) {
  const d3 = vitaminD3(freeze);
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
        amount: VALUE_ROLE_REQUEST.vitaminD3.amount,
        importance: "conditional" as const,
        name: d3?.name ?? "Vitamin D3",
        prerequisite: {
          nextAction: "Confirm vitamin D status with a clinician.",
          reasonCode: "vitamin_d_status_unknown",
          status
        },
        ...(d3 ? { supplementId: d3.supplementId } : {}),
        unit: VALUE_ROLE_REQUEST.vitaminD3.unit
      }
    ]
  };
}

export async function freezeImplCatalogue() {
  const freeze = await freezeLiveThailandCatalogue("TH");
  return {
    freeze,
    live: isLiveRetailFreeze(freeze),
    snapshotId: isUsableLiveFreeze(freeze) ? catalogueSnapshotId(freeze.snapshot) : "",
    usable: isUsableLiveFreeze(freeze)
  };
}

export function openSession(freeze: ValueCatalogueFreeze): PlanSession {
  replaceCatalogueSnapshot(freeze.snapshot);
  pinCatalogueSnapshot(freeze.snapshot, GUIDANCE_RULES_VERSION);
  const store = createMemoryStore();
  const config = loadAgenticConfig();
  const runtime = createAgenticRuntime({
    config,
    now: "2026-09-01T00:00:00.000Z",
    scope: {
      environment: "dev",
      principalScope: "cv-impl-pack",
      tenantScope: "mattanutra"
    },
    store
  });
  setAgenticRuntimeForTests(runtime);
  return {
    config,
    freeze,
    runtime,
    snapshotId: catalogueSnapshotId(freeze.snapshot),
    store
  };
}

export async function callPlan(
  session: PlanSession,
  payload: Record<string, unknown>
) {
  const snapshot = installedCatalogueSnapshot() ?? session.freeze.snapshot;
  const result = await runWithCatalogueSnapshot(snapshot, () =>
    planTool({
      config: session.config,
      now: "2026-09-01T00:00:00.000Z",
      payload: payload as Parameters<typeof planTool>[0]["payload"],
      scope: session.runtime.scope,
      store: session.store
    })
  );
  return asRecord(result);
}

export async function createPlan(
  session: PlanSession,
  request: Record<string, unknown>,
  idempotencyKey = `cv-impl-${randomUUID()}`
) {
  return callPlan(session, {
    idempotencyKey,
    operation: "create",
    request
  });
}

export function coverageOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
}

export function optionsOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.options) ? plan.options.map(asRecord) : [];
}

export function questionsOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.questions) ? plan.questions.map(asRecord) : [];
}

export function gapTargets(plan: Record<string, unknown>) {
  const review = asRecord(plan.gapReview);
  return Array.isArray(review.targets) ? review.targets.map(asRecord) : [];
}

export function basketOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.basket) ? plan.basket.map(asRecord) : [];
}

export function safetyGuidanceOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.safetyGuidance) ? plan.safetyGuidance.map(asRecord) : [];
}

export function identityOf(plan: Record<string, unknown>) {
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

export function asksAcceptOrRemove(
  rows: readonly Record<string, unknown>[],
  names: readonly string[]
) {
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

export function closeSession() {
  setAgenticRuntimeForTests(null);
  replaceCatalogueSnapshot(null);
  resetCatalogueSnapshotCache();
  resetQaPersistForTests();
  resetCataloguePins();
}

export const IMPL_CONTRACT_VERSION = AGENTIC_CONTRACT_VERSION;
export const IMPL_SAFETY_LEDGER_VERSION = GUIDANCE_RULES_VERSION;
