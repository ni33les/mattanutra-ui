import { hashAdminToken } from "@/lib/admin-session-cookie";
import type { SystemAgentKey } from "@/lib/system-agents";

export type RuntimeWorkerCredentialProfile = Readonly<{
  agentKey: SystemAgentKey;
  envKey: string;
  role: "platform_agent" | "retail_agent";
}>;

export const RUNTIME_WORKER_CREDENTIAL_PROFILES: readonly RuntimeWorkerCredentialProfile[] = [
  { agentKey: "nutritionPlanAdvisor", envKey: "WORKER_ADVISOR_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "chatDispatcher", envKey: "WORKER_CHAT_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "communicationsCoordinator", envKey: "WORKER_COMMUNICATIONS_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "contentPublisher", envKey: "WORKER_CONTENT_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "emailDispatcher", envKey: "WORKER_EMAIL_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "foodGuidanceWorker", envKey: "WORKER_FOOD_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "formulationWorker", envKey: "WORKER_FORMULATION_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "healthScoreEngine", envKey: "WORKER_HEALTHSCORE_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "scheduler", envKey: "WORKER_HOSTING_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "productMatcher", envKey: "WORKER_PRODUCTS_AGENT_API_KEY", role: "platform_agent" },
  { agentKey: "retailStockPlanner", envKey: "WORKER_STOCK_AGENT_API_KEY", role: "retail_agent" }
] as const;

export function runtimeWorkerCredentialProfileForToken(
  token: string | null | undefined
) {
  const tokenHash = token ? hashAdminToken(token.trim()) : "";

  if (!tokenHash) {
    return null;
  }

  return (
    RUNTIME_WORKER_CREDENTIAL_PROFILES.find((profile) => {
      const configuredToken = process.env[profile.envKey]?.trim();

      return configuredToken
        ? hashAdminToken(configuredToken) === tokenHash
        : false;
    }) ?? null
  );
}
