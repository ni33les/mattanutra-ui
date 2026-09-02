export const QA_AUDIENCE = "mattanutra-dev-qa";

export function qaToken() {
  return process.env.MCP_QA_TOKEN?.trim() ?? "";
}

export function authorizeQaRequest(
  request: Request,
  environment: "dev" | "prd" | "uat" = "dev"
) {
  const audience = request.headers.get("x-mattanutra-qa-audience") ?? "";
  if (audience !== QA_AUDIENCE) {
    return false;
  }

  if (environment === "dev") {
    return true;
  }

  const token = qaToken();
  if (!token) {
    return false;
  }

  return (request.headers.get("authorization") ?? "") === `Bearer ${token}`;
}
