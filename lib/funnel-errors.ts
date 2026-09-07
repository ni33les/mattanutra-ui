import { createLogger } from "@/lib/logger";

const log = createLogger("web-funnel");

export class FunnelError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "FunnelError";
    this.status = status;
    this.code = code;
  }
}

export function funnelErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) error = new FunnelError("Invalid JSON request", 400, "invalid_json");
  if (!(error instanceof FunnelError)) log.error("request_failed", { error });
  return Response.json({
    message: error instanceof FunnelError ? error.message : "Unable to complete this request. Please retry.",
    code: error instanceof FunnelError ? error.code : "request_failed"
  }, { status: error instanceof FunnelError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
