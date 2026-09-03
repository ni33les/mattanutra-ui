export const QA_AUDIENCE = "mattanutra-dev-qa";

export function qaToken() {
  return (
    process.env.MCP_QA_TOKEN?.trim() ||
    process.env.AGENTIC_CAPABILITY_KEY?.trim() ||
    process.env.MCP_V2_ORDER_HANDLE_SECRET?.trim() ||
    ""
  );
}

export function authorizeQaRequest(
  request: Request,
  environment: "dev" | "prd" | "uat" = "dev"
) {
  if (environment === "dev") {
    return true;
  }

  const audience = request.headers.get("x-mattanutra-qa-audience") ?? "";
  if (audience !== QA_AUDIENCE) {
    return false;
  }

  const token = qaToken();
  if (!token) {
    return false;
  }

  return (request.headers.get("authorization") ?? "") === `Bearer ${token}`;
}
