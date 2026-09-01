import { NextResponse } from "next/server";
import { assertInternalQaHarness } from "@/lib/agentic/config";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import type { AgenticRuntime } from "@/lib/agentic/runtime";

export const QA_AUDIENCE = "mattanutra-dev-qa";

export function qaToken() {
  return process.env.MCP_QA_TOKEN?.trim() ?? "";
}

export function authorizeQaRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const audience = request.headers.get("x-mattanutra-qa-audience") ?? "";
  return header === `Bearer ${qaToken()}` && audience === QA_AUDIENCE;
}

export function qaRuntimeOrDeny(request: Request):
  | { ok: true; runtime: AgenticRuntime }
  | { ok: false; response: NextResponse } {
  let runtime: AgenticRuntime;

  try {
    runtime = getLiveAgenticRuntime(request);
    assertInternalQaHarness(runtime.config);
  } catch (error) {
    const reason =
      error && typeof error === "object" && "reasonCode" in error
        ? String((error as { reasonCode?: string }).reasonCode)
        : "not_found";

    if (reason === "adapter_mismatch") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: {
              category: "validation",
              fieldPath: "adapter",
              message: "The QA harness cannot run with this adapter.",
              reasonCode: "adapter_mismatch",
              retryable: false
            }
          },
          { status: 404 }
        )
      };
    }

    return {
      ok: false,
      response: NextResponse.json({ message: "Not found." }, { status: 404 })
    };
  }

  if (!authorizeQaRequest(request)) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    };
  }

  return { ok: true, runtime };
}

export function qaJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
    status
  });
}
