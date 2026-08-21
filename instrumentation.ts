export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { keepDatabaseWarm } = await import("./lib/db");
  await keepDatabaseWarm();

  try {
    const { resolveAgenticEnvironment } = await import("./lib/agentic/config");
    const { warmupPlanRequest, warmAgenticCatalogue } = await import(
      "./lib/agentic/catalogue/warm"
    );
    const environment = resolveAgenticEnvironment();
    const markets = await warmAgenticCatalogue(environment);
    const { getLiveAgenticRuntime } = await import("./lib/agentic/live-runtime");
    const { handleJsonRpc } = await import("./lib/agentic/mcp/dispatcher");
    const runtime = getLiveAgenticRuntime();
    const countryCode = markets[0]?.countryCode ?? "TH";
    const created = await handleJsonRpc(runtime, {
      id: "warm-a2-create",
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          idempotencyKey: `warm-a2-${Date.now()}-create`,
          request: warmupPlanRequest(countryCode)
        },
        name: "plan"
      }
    });
    const plan =
      created &&
      typeof created === "object" &&
      "result" in created &&
      created.result &&
      typeof created.result === "object" &&
      "structuredContent" in created.result
        ? (created.result.structuredContent as {
            answers?: unknown;
            guidanceIds?: string[];
            planHandle?: string;
            questions?: Array<{
              choices?: Array<{ choice?: string }>;
              questionId?: string;
            }>;
            revision?: number;
          })
        : null;

    if (plan?.planHandle && plan.revision != null) {
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
        id: "warm-a2-patch",
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            answers,
            expectedRevision: plan.revision,
            idempotencyKey: `warm-a2-${Date.now()}-patch`,
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
  } catch (error) {
    console.warn("Unable to warm agentic catalogue", error);
  }
}
