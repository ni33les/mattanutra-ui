import type { AgentPrincipal } from "@/lib/admin-access-types";
import type { TaskAgentAccessScope } from "@/lib/task-service-types";

export function taskAgentAccessScopeFromPrincipal(
  principal: AgentPrincipal | null | undefined
): TaskAgentAccessScope | null {
  if (!principal) {
    return null;
  }

  return {
    agentId: principal.agentId,
    agentName: principal.agentName,
    capabilities: principal.capabilities,
    membershipId: principal.membershipId,
    organisationId: principal.organisation.id,
    role: principal.role
  };
}
