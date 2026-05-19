import type { AgentType } from "./task-service.ts";
import { normalizeCapabilities } from "./task-service-utils.ts";

export const AGENT_CAPABILITIES = {
  chatSend: "chat_send",
  clientSafetyFollowup: "client_safety_followup",
  communicationDispatch: "communication_dispatch",
  contentPublish: "content_publish",
  communicationRoute: "communication_route",
  doseNormalization: "dose_normalization",
  emailSend: "email_send",
  foodGuidanceGeneration: "food_guidance_generation",
  foodGuidanceReview: "food_guidance_review",
  foodReview: "food_review",
  formulationGeneration: "formulation_generation",
  formulationReview: "formulation_review",
  freeEmailSend: "free_email_send",
  freeExampleFoodGuidance: "free_example_food_guidance",
  freeExampleFormulation: "free_example_formulation",
  healthScoreAnalysis: "healthscore_analysis",
  hostingCostSync: "hosting_cost_sync",
  humanReview: "human_review",
  lineSend: "line_send",
  nutritionPlanChat: "nutrition_plan_chat",
  nutritionPlanRefinement: "nutrition_plan_refinement",
  nutritionReportGeneration: "nutrition_report_generation",
  productRecommendation: "product_recommendation",
  productRecommendationFullBeam: "product_recommendation_full_beam",
  productRefresh: "product_refresh",
  productReview: "product_review",
  reassessmentEmailSend: "reassessment_email_send",
  safetyReview: "safety_review",
  salesCopy: "sales_copy",
  scheduler: "scheduler",
  supplementGovernance: "supplement_governance",
  supplementReview: "supplement_review",
  supplementReviewTriage: "supplement_review_triage",
  supplementSafetyScan: "supplement_safety_scan",
  telegramSend: "telegram_send",
  whatsappSend: "whatsapp_send"
} as const;

export type SystemAgentKey =
  | "chatDispatcher"
  | "communicationsCoordinator"
  | "contentPublisher"
  | "emailDispatcher"
  | "foodGuidanceWorker"
  | "formulationWorker"
  | "healthScoreEngine"
  | "humanReviewer"
  | "nutritionPlanAdvisor"
  | "productMatcher"
  | "safetyScanner"
  | "scheduler";

export type SystemAgentDefinition = Readonly<{
  capabilities: readonly string[];
  id: string;
  metadata: Readonly<Record<string, unknown>>;
  model: string | null;
  name: string;
  type: AgentType;
}>;

export const SYSTEM_AGENTS: Readonly<Record<SystemAgentKey, SystemAgentDefinition>> = {
  chatDispatcher: {
    capabilities: [
      AGENT_CAPABILITIES.chatSend,
      AGENT_CAPABILITIES.lineSend,
      AGENT_CAPABILITIES.telegramSend,
      AGENT_CAPABILITIES.whatsappSend,
      AGENT_CAPABILITIES.communicationDispatch
    ],
    id: "8386c905-f607-4d5f-bb5f-3a98a598294d",
    metadata: {
      channelFamily: "chat",
      seeded: true
    },
    model: null,
    name: "Chat Dispatcher",
    type: "external"
  },
  communicationsCoordinator: {
    capabilities: [
      AGENT_CAPABILITIES.clientSafetyFollowup,
      AGENT_CAPABILITIES.communicationRoute,
      AGENT_CAPABILITIES.communicationDispatch
    ],
    id: "161f03a5-70ec-4e56-b54e-b23daee2e520",
    metadata: {
      channelFallbackOrder: ["chat", "email"],
      seeded: true
    },
    model: null,
    name: "Communications Coordinator",
    type: "deterministic"
  },
  contentPublisher: {
    capabilities: [AGENT_CAPABILITIES.contentPublish],
    id: "bd2db46f-149a-4d7c-8805-25efcb621b3d",
    metadata: {
      seeded: true
    },
    model: null,
    name: "Content Publisher",
    type: "deterministic"
  },
  emailDispatcher: {
    capabilities: [
      AGENT_CAPABILITIES.emailSend,
      AGENT_CAPABILITIES.freeEmailSend,
      AGENT_CAPABILITIES.reassessmentEmailSend
    ],
    id: "5a72e41c-4535-4d28-8043-51448af40343",
    metadata: {
      channelFamily: "email",
      seeded: true
    },
    model: null,
    name: "Email Dispatcher",
    type: "deterministic"
  },
  foodGuidanceWorker: {
    capabilities: [
      AGENT_CAPABILITIES.foodGuidanceGeneration,
      AGENT_CAPABILITIES.freeExampleFoodGuidance
    ],
    id: "6b58c999-ec78-471e-b179-17bdb42538a7",
    metadata: {
      seeded: true,
      usesModel: true
    },
    model: "grok:food-guidance",
    name: "Food Guidance Engine",
    type: "ai"
  },
  formulationWorker: {
    capabilities: [
      AGENT_CAPABILITIES.formulationGeneration,
      AGENT_CAPABILITIES.freeExampleFormulation
    ],
    id: "ef8472a6-2049-44e0-a001-3f5d6963499f",
    metadata: {
      seeded: true,
      usesModel: true
    },
    model: "grok:formulation",
    name: "Nutrition Plan Formulator",
    type: "ai"
  },
  healthScoreEngine: {
    capabilities: [
      AGENT_CAPABILITIES.healthScoreAnalysis,
      AGENT_CAPABILITIES.salesCopy
    ],
    id: "668ee3d3-00ec-48a0-86cc-8091af904eda",
    metadata: {
      seeded: true,
      usesModel: true
    },
    model: "grok:healthscore",
    name: "HealthScore Engine",
    type: "ai"
  },
  humanReviewer: {
    capabilities: [
      AGENT_CAPABILITIES.formulationReview,
      AGENT_CAPABILITIES.foodGuidanceReview,
      AGENT_CAPABILITIES.foodReview,
      AGENT_CAPABILITIES.humanReview,
      AGENT_CAPABILITIES.productReview,
      AGENT_CAPABILITIES.safetyReview,
      AGENT_CAPABILITIES.supplementGovernance,
      AGENT_CAPABILITIES.supplementReview
    ],
    id: "5ccf4955-5b2b-4240-aa75-d5d7dfc9b380",
    metadata: {
      seeded: true
    },
    model: null,
    name: "Human Reviewer",
    type: "human"
  },
  nutritionPlanAdvisor: {
    capabilities: [
      AGENT_CAPABILITIES.nutritionPlanChat,
      AGENT_CAPABILITIES.nutritionPlanRefinement,
      AGENT_CAPABILITIES.nutritionReportGeneration
    ],
    id: "b955a43d-2506-4f31-8955-ec7dd599a5f5",
    metadata: {
      seeded: true,
      usesModel: true
    },
    model: "grok:nutrition-advisor",
    name: "Nutrition Plan Advisor",
    type: "ai"
  },
  productMatcher: {
    capabilities: [
      AGENT_CAPABILITIES.doseNormalization,
      AGENT_CAPABILITIES.productRecommendationFullBeam,
      AGENT_CAPABILITIES.productRecommendation,
      AGENT_CAPABILITIES.productRefresh,
      AGENT_CAPABILITIES.supplementSafetyScan
    ],
    id: "28e0d3fd-4f6f-4877-92bc-bb77024496d4",
    metadata: {
      marketRegion: "TH",
      seeded: true
    },
    model: null,
    name: "Product Matcher",
    type: "deterministic"
  },
  safetyScanner: {
    capabilities: [
      AGENT_CAPABILITIES.doseNormalization,
      AGENT_CAPABILITIES.supplementReviewTriage,
      AGENT_CAPABILITIES.supplementSafetyScan
    ],
    id: "1fa305ca-e68c-40f1-bd6e-a7cbc632d210",
    metadata: {
      seeded: true
    },
    model: null,
    name: "Safety Scanner",
    type: "deterministic"
  },
  scheduler: {
    capabilities: [
      AGENT_CAPABILITIES.communicationDispatch,
      AGENT_CAPABILITIES.hostingCostSync,
      AGENT_CAPABILITIES.scheduler
    ],
    id: "436cc481-6639-402e-b639-bf5737e3acd4",
    metadata: {
      seeded: true
    },
    model: null,
    name: "Scheduler",
    type: "deterministic"
  }
} as const;

export const SYSTEM_AGENT_LIST = Object.values(SYSTEM_AGENTS);

export const WORK_TASK_AGENT_KEYS: Readonly<Record<string, SystemAgentKey>> = {
  analyze_healthscore: "healthScoreEngine",
  client_safety_followup: "communicationsCoordinator",
  discover_products: "productMatcher",
  generate_example_food_guidance: "foodGuidanceWorker",
  generate_example_supplement_guidance: "formulationWorker",
  generate_food_guidance: "foodGuidanceWorker",
  generate_supplement_guidance: "formulationWorker",
  generate_nutrition_report: "nutritionPlanAdvisor",
  generate_product_recommendations: "productMatcher",
  nutrition_plan_chat_reply: "nutritionPlanAdvisor",
  parse_product_label: "productMatcher",
  refine_nutrition_plan: "nutritionPlanAdvisor",
  refresh_marketplace_product: "productMatcher",
  content_status_change: "contentPublisher",
  send_example_email: "emailDispatcher",
  send_reassessment_email: "emailDispatcher",
  sync_digitalocean_billing: "scheduler"
} as const;

export function systemAgentForKey(key: SystemAgentKey) {
  return SYSTEM_AGENTS[key];
}

export function systemAgentForWorkTaskType(taskType: string) {
  return SYSTEM_AGENTS[WORK_TASK_AGENT_KEYS[taskType] ?? "scheduler"];
}

export function requiredCapabilitiesForWorkTaskType(taskType: string) {
  const capabilitiesByTaskType: Record<string, readonly string[]> = {
    analyze_healthscore: [AGENT_CAPABILITIES.healthScoreAnalysis],
    client_safety_followup: [AGENT_CAPABILITIES.clientSafetyFollowup],
    discover_products: [
      AGENT_CAPABILITIES.productRecommendation
    ],
    generate_example_food_guidance: [
      AGENT_CAPABILITIES.freeExampleFoodGuidance
    ],
    generate_example_supplement_guidance: [
      AGENT_CAPABILITIES.freeExampleFormulation
    ],
    generate_food_guidance: [AGENT_CAPABILITIES.foodGuidanceGeneration],
    generate_supplement_guidance: [AGENT_CAPABILITIES.formulationGeneration],
    generate_nutrition_report: [
      AGENT_CAPABILITIES.nutritionReportGeneration
    ],
    generate_product_recommendations: [
      AGENT_CAPABILITIES.productRecommendationFullBeam,
      AGENT_CAPABILITIES.productRecommendation
    ],
    nutrition_plan_chat_reply: [AGENT_CAPABILITIES.nutritionPlanChat],
    parse_product_label: [AGENT_CAPABILITIES.productRecommendation],
    refine_nutrition_plan: [AGENT_CAPABILITIES.nutritionPlanRefinement],
    refresh_marketplace_product: [AGENT_CAPABILITIES.productRefresh],
    content_status_change: [AGENT_CAPABILITIES.contentPublish],
    send_example_email: [AGENT_CAPABILITIES.freeEmailSend],
    send_reassessment_email: [AGENT_CAPABILITIES.reassessmentEmailSend],
    sync_digitalocean_billing: [AGENT_CAPABILITIES.hostingCostSync]
  };

  return normalizeCapabilities(
    capabilitiesByTaskType[taskType] ?? []
  );
}
