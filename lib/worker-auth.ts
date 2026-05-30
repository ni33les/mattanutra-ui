import {
  bearerToken,
  configuredLegacyToken,
  legacyTokenMatches
} from "@/lib/legacy-token-auth";
import {
  resolveAccessPrincipal,
  type AgentPrincipal
} from "@/lib/access-principal";
import { taskAgentAccessScopeFromPrincipal } from "@/lib/task-agent-access";
import type { TaskAgentAccessScope } from "@/lib/task-service-types";

const noStoreHeaders = {
  "Cache-Control": "no-store"
} as const;

const unauthorizedHeaders = {
  ...noStoreHeaders,
  "WWW-Authenticate": 'Bearer realm="mattanutra-worker-api"'
} as const;

function configuredWorkerToken() {
  return configuredLegacyToken("worker");
}

export function workerApiTokenConfigured() {
  return Boolean(configuredWorkerToken());
}

export function workerApiTokenAllowed(token: unknown) {
  return legacyTokenMatches("worker", token);
}

export function workerRequestAllowed(request: Request) {
  return (
    workerApiTokenAllowed(bearerToken(request)) ||
    workerApiTokenAllowed(request.headers.get("x-worker-api-token"))
  );
}

export function workerUnauthorized() {
  return Response.json(
    { message: "Worker API access is not authorized" },
    {
      headers: unauthorizedHeaders,
      status: 401
    }
  );
}

export function requireWorkerRequest(request: Request) {
  return workerRequestAllowed(request) ? null : workerUnauthorized();
}

export type WorkerAccess = Readonly<{
  legacy: boolean;
  principal: AgentPrincipal | null;
  scope: TaskAgentAccessScope | null;
  unauthorized: Response | null;
}>;

export async function requireWorkerAccess(request: Request): Promise<WorkerAccess> {
  const principal = await resolveAccessPrincipal(request, {
    allowAgent: true,
    allowLegacy: "worker",
    requiredPermission: "tasks.write"
  });

  if (principal?.type === "agent") {
    return {
      legacy: false,
      principal,
      scope: taskAgentAccessScopeFromPrincipal(principal),
      unauthorized: null
    };
  }

  if (principal?.type === "legacy_token") {
    return {
      legacy: true,
      principal: null,
      scope: null,
      unauthorized: null
    };
  }

  return {
    legacy: false,
    principal: null,
    scope: null,
    unauthorized: workerUnauthorized()
  };
}
