import {
  RETAIL_AGENT_EXECUTABLE_TASK_TYPES,
  RETAIL_CARRIER_AGENT_EXECUTABLE_TASK_TYPES
} from "@/lib/retail-task-policy";
import type { SystemAgentKey } from "@/lib/system-agents";

export type WorkerProfileMode =
  | "advisor"
  | "analytics"
  | "carrier"
  | "chat"
  | "communications"
  | "content"
  | "email"
  | "food"
  | "formulation"
  | "healthscore"
  | "hosting"
  | "panya"
  | "products"
  | "stock";

export type RuntimeWorkerCredentialProfile = Readonly<{
  agentKey: SystemAgentKey;
  envKey: string;
  mode: WorkerProfileMode;
  role: "platform_agent" | "retail_agent";
  taskTypes: readonly string[];
}>;

function profile(
  mode: WorkerProfileMode,
  agentKey: SystemAgentKey,
  envKey: string,
  role: RuntimeWorkerCredentialProfile["role"],
  taskTypes: readonly string[]
): RuntimeWorkerCredentialProfile {
  return { agentKey, envKey, mode, role, taskTypes };
}

export const RUNTIME_WORKER_PROFILES: readonly RuntimeWorkerCredentialProfile[] = [
  profile("advisor", "nutritionPlanAdvisor", "WORKER_ADVISOR_AGENT_API_KEY", "platform_agent", [
    "nutrition_plan_chat_reply",
    "refine_nutrition_plan"
  ]),
  profile("analytics", "analytics", "WORKER_ANALYTICS_AGENT_API_KEY", "platform_agent", [
    "admin_catalogue_optimization_job"
  ]),
  profile("carrier", "carrierCoordinator", "WORKER_CARRIER_AGENT_API_KEY", "retail_agent", RETAIL_CARRIER_AGENT_EXECUTABLE_TASK_TYPES),
  profile("chat", "chatDispatcher", "WORKER_CHAT_AGENT_API_KEY", "platform_agent", [
    "dispatch_chat_communication_message"
  ]),
  profile(
    "communications",
    "communicationsCoordinator",
    "WORKER_COMMUNICATIONS_AGENT_API_KEY",
    "platform_agent",
    ["client_safety_followup", "route_admin_communication"]
  ),
  profile("content", "contentPublisher", "WORKER_CONTENT_AGENT_API_KEY", "platform_agent", [
    "content_status_change"
  ]),
  profile("email", "emailDispatcher", "WORKER_EMAIL_AGENT_API_KEY", "platform_agent", [
    "dispatch_email_communication_message",
    "send_example_email",
    "send_reassessment_email",
    "send_retail_order_workflow_email"
  ]),
  profile("food", "foodGuidanceWorker", "WORKER_FOOD_AGENT_API_KEY", "platform_agent", [
    "generate_food_gap_guidance"
  ]),
  profile(
    "formulation",
    "formulationWorker",
    "WORKER_FORMULATION_AGENT_API_KEY",
    "platform_agent",
    ["generate_example_supplement_guidance", "generate_supplement_guidance"]
  ),
  profile("healthscore", "healthScoreEngine", "WORKER_HEALTHSCORE_AGENT_API_KEY", "platform_agent", [
    "analyze_healthscore"
  ]),
  profile("hosting", "scheduler", "WORKER_HOSTING_AGENT_API_KEY", "platform_agent", [
    "sync_digitalocean_billing"
  ]),
  profile("panya", "panya", "WORKER_NONG MATA_AGENT_API_KEY", "platform_agent", [
    "customer_chat_reply"
  ]),
  profile("products", "productMatcher", "WORKER_PRODUCTS_AGENT_API_KEY", "platform_agent", [
    "generate_product_recommendations",
    "source_product_fda_approvals",
    "source_product_identifiers"
  ]),
  profile("stock", "retailStockPlanner", "WORKER_STOCK_AGENT_API_KEY", "retail_agent", RETAIL_AGENT_EXECUTABLE_TASK_TYPES)
] as const;

export const RUNTIME_WORKER_CREDENTIAL_PROFILES = RUNTIME_WORKER_PROFILES;

export const RUNTIME_WORKER_PROFILE_MODES = RUNTIME_WORKER_PROFILES.map(
  (workerProfile) => workerProfile.mode
);

export function runtimeWorkerProfileForMode(mode: WorkerProfileMode) {
  return RUNTIME_WORKER_PROFILES.find((profile) => profile.mode === mode) ?? null;
}
