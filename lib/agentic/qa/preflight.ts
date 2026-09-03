import { createHash } from "node:crypto";
import type { AgenticEnvironment } from "@/lib/agentic/config";
import { AGENTIC_SCHEMA_CHECKSUM } from "@/lib/agentic/info";
import { CONNECTOR_COPY } from "@/lib/agentic/discovery/content";
import { DISCOVERY_CONTENT_VERSION } from "@/lib/agentic/discovery/versions";
import { agenticMessageKeys } from "@/lib/agentic/i18n";
import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import { QA_PACK_CLOCK, resolveQaSession } from "@/lib/agentic/qa/session";

export const QA_PACK_VERSION = "3.0.0";
export const QA_FULFILMENT_DRIVE = ["preparing", "dispatched", "delivered"] as const;
export const QA_OBSERVERS = ["funnel", "queries", "contribution"] as const;

export const QA_FIXTURE_RECIPES = {
  F_HAVE_90: {
    currentSupplements: [{ dailyAmount: 300, daysRemaining: 90, name: "Magnesium", unit: "mg" }],
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  },
  F_MISSING_DAYS: {
    currentSupplements: [{ dailyAmount: 300, name: "Magnesium", unit: "mg" }],
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  },
  F_MIXED: {
    targets: [
      { amount: 3000, importance: "core", name: "Creatine", unit: "mg" },
      { amount: 300, importance: "optional", name: "Magnesium", unit: "mg" },
      {
        amount: 2000,
        importance: "conditional",
        name: "Vitamin D3",
        prerequisite: { status: "unsatisfied" },
        unit: "IU"
      }
    ]
  },
  F_READY_MAG: {
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  },
  S349: {
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  },
  S350: {
    medicationCodes: ["apixaban"],
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
  },
  S351: {
    profile: { ageYears: 8, lifeStage: "child" },
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  }
} as const;

export function localeBundleChecksum() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        compactKeys: agenticMessageKeys().filter((key) => key.startsWith("plan.compact.")),
        copy: CONNECTOR_COPY,
        version: DISCOVERY_CONTENT_VERSION
      })
    )
    .digest("hex");
}

export async function qaPreflight(namespace?: string, environment: AgenticEnvironment = "dev") {
  const session = namespace ? await resolveQaSession(namespace) : null;
  const snapshot = session?.frozenSnapshot ?? (await ensureCatalogueSnapshot(environment, "TH"));
  return {
    ok: true as const,
    packVersion: QA_PACK_VERSION,
    clock: {
      now: session?.now ?? QA_PACK_CLOCK,
      settable: true as const
    },
    namespaces: { begin: true as const, reset: true as const },
    fulfilment: [...QA_FULFILMENT_DRIVE],
    observer: [...QA_OBSERVERS],
    manifest: {
      catalogueChecksum: catalogueSnapshotId(snapshot),
      catalogueVersion: snapshot.catalogueVersion,
      fixtures: QA_FIXTURE_RECIPES,
      localeBundle: localeBundleChecksum(),
      locales: ["en", "th", "zh-CN"],
      schemaChecksum: AGENTIC_SCHEMA_CHECKSUM
    }
  };
}

export const QA_CONTROL_TOOLS = [
  "preflight",
  "beginRun",
  "reset",
  "setClock",
  "simulate",
  "simulateFulfilment",
  "setChannel",
  "observe",
  "evidence",
  "isolationProof",
  "checkoutContinuityProof",
  "latencyProof",
  "packProof"
] as const;
