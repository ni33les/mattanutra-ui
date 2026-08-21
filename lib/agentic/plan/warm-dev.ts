import type { AgenticRuntime } from "@/lib/agentic/runtime";

const globalWarm = globalThis as typeof globalThis & {
  mattanutraDevPlanHotPath?: Promise<void>;
  mattanutraDevPlanWarming?: boolean;
};

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

async function runDevPlanHotPath(runtime: AgenticRuntime) {
  const { handleJsonRpc } = await import("@/lib/agentic/mcp/dispatcher");
  const created = await handleJsonRpc(runtime, {
    id: "dev-hot-create",
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        idempotencyKey: `dev-hot-${Date.now()}-create`,
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
    id: "dev-hot-patch",
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        answers,
        expectedRevision: plan.revision,
        idempotencyKey: `dev-hot-${Date.now()}-patch`,
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
}

export async function ensureDevPlanHotPath(runtime: AgenticRuntime) {
  if (runtime.config.environment !== "dev" || globalWarm.mattanutraDevPlanWarming) {
    return;
  }

  if (!globalWarm.mattanutraDevPlanHotPath) {
    globalWarm.mattanutraDevPlanHotPath = (async () => {
      globalWarm.mattanutraDevPlanWarming = true;
      try {
        await runDevPlanHotPath(runtime);
      } catch (error) {
        console.warn("Unable to warm DEV plan hot path", error);
      } finally {
        globalWarm.mattanutraDevPlanWarming = false;
      }
    })();
  }

  await globalWarm.mattanutraDevPlanHotPath;
}
