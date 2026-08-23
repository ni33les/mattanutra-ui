import type { AgenticEnvironment } from "@/lib/agentic/config";
import type { AgenticRuntime } from "@/lib/agentic/runtime";

const KEEP_WARM_FIRST_DELAY_MS = 60_000;
const KEEP_WARM_MS = 10 * 60_000;

const globalWarm = globalThis as typeof globalThis & {
  mattanutraLivePlanCount?: number;
  mattanutraPlanKeepWarm?: ReturnType<typeof setInterval>;
  mattanutraPlanWarming?: boolean;
  mattanutraCatalogueWarmInflight?: Promise<unknown> | null;
};

export async function withLivePlanRequest<T>(work: () => Promise<T>) {
  globalWarm.mattanutraLivePlanCount = (globalWarm.mattanutraLivePlanCount ?? 0) + 1;

  try {
    return await work();
  } finally {
    globalWarm.mattanutraLivePlanCount = Math.max(
      0,
      (globalWarm.mattanutraLivePlanCount ?? 1) - 1
    );
  }
}

export function isLivePlanInFlight() {
  return (globalWarm.mattanutraLivePlanCount ?? 0) > 0;
}

function livePlanInFlight() {
  return isLivePlanInFlight();
}

function eightTargetRequest() {
  return {
    destinationCountry: "TH",
    locale: "en",
    medicationCodes: ["apixaban"],
    optimization: "balanced",
    profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
    requirements: {},
    targets: [
      { amount: 2000, name: "Vitamin D3", unit: "IU" },
      { amount: 1000, name: "Algae omega-3", unit: "mg" },
      { amount: 300, name: "Magnesium", unit: "mg" },
      { amount: 1000, name: "Vitamin B12", unit: "mcg" },
      { amount: 1000, name: "Vitamin C", unit: "mg" },
      { amount: 25, name: "Zinc", unit: "mg" },
      { amount: 10, name: "Iron", unit: "mg" },
      { amount: 100, name: "CoQ10", unit: "mg" }
    ]
  };
}

function structuredPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = "result" in value ? (value as { result?: unknown }).result : value;
  if (!result || typeof result !== "object") {
    return null;
  }

  const nested =
    "structuredContent" in result
      ? (result as { structuredContent?: unknown }).structuredContent
      : result;
  if (!nested || typeof nested !== "object") {
    return null;
  }

  return nested as {
    guidanceIds?: string[];
    planHandle?: string;
    questions?: Array<{
      choices?: Array<{ choice?: string }>;
      questionId?: string;
    }>;
    revision?: number;
  };
}

async function pingPlanHotPath(runtime: AgenticRuntime) {
  if (globalWarm.mattanutraPlanWarming || livePlanInFlight()) {
    return;
  }

  globalWarm.mattanutraPlanWarming = true;
  try {
    const { handleJsonRpc } = await import("@/lib/agentic/mcp/dispatcher");
    const created = await handleJsonRpc(runtime, {
      id: "hot-create",
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          idempotencyKey: `hot-${Date.now()}-create`,
          request: eightTargetRequest()
        },
        name: "plan"
      }
    });
    const plan = structuredPlan(created);

    if (!plan?.planHandle || plan.revision == null) {
      return;
    }

    const answers = (plan.questions ?? []).flatMap((question) => {
      const choice = question.choices?.[0]?.choice;
      const questionId = question.questionId;
      if (
        choice &&
        (questionId === "q_safety_ack" || String(questionId).startsWith("q_gap_"))
      ) {
        return [{ choice, questionId }];
      }
      return [];
    });

    await handleJsonRpc(runtime, {
      id: "hot-patch",
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          answers,
          expectedRevision: plan.revision,
          idempotencyKey: `hot-${Date.now()}-patch`,
          planHandle: plan.planHandle,
          ...(plan.guidanceIds
            ? {
                safetyAcknowledgement: {
                  confirmed: true,
                  guidanceIds: plan.guidanceIds,
                  revision: plan.revision
                }
              }
            : {})
        },
        name: "plan"
      }
    });
  } finally {
    globalWarm.mattanutraPlanWarming = false;
  }
}

export async function ensureDevPlanHotPath(runtime: AgenticRuntime) {
  await pingPlanHotPath(runtime);
}

export async function keepPlanPathWarm(environment: AgenticEnvironment) {
  if (globalWarm.mattanutraPlanKeepWarm) {
    return;
  }

  const { warmAgenticCatalogue } = await import("@/lib/agentic/catalogue/warm");

  const warmOnce = () => {
    if (globalWarm.mattanutraCatalogueWarmInflight) {
      return;
    }

    globalWarm.mattanutraCatalogueWarmInflight = warmAgenticCatalogue(
      environment
    )
      .catch((error) => {
        console.warn("Unable to keep plan path warm", error);
      })
      .finally(() => {
        globalWarm.mattanutraCatalogueWarmInflight = null;
      });
  };

  const start = setTimeout(() => {
    warmOnce();
    const timer = setInterval(warmOnce, KEEP_WARM_MS);
    timer.unref?.();
    globalWarm.mattanutraPlanKeepWarm = timer;
  }, KEEP_WARM_FIRST_DELAY_MS);
  start.unref?.();
  globalWarm.mattanutraPlanKeepWarm = start;
}
