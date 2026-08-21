const runtimeWorkerProfiles = [
  { envKey: "WORKER_ADVISOR_AGENT_API_KEY", mode: "advisor" },
  { envKey: "WORKER_ANALYTICS_AGENT_API_KEY", mode: "analytics" },
  { envKey: "WORKER_CARRIER_AGENT_API_KEY", mode: "carrier" },
  { envKey: "WORKER_CHAT_AGENT_API_KEY", mode: "chat" },
  { envKey: "WORKER_COMMUNICATIONS_AGENT_API_KEY", mode: "communications" },
  { envKey: "WORKER_CONTENT_AGENT_API_KEY", mode: "content" },
  { envKey: "WORKER_EMAIL_AGENT_API_KEY", mode: "email" },
  { envKey: "WORKER_FOOD_AGENT_API_KEY", mode: "food" },
  { envKey: "WORKER_FORMULATION_AGENT_API_KEY", mode: "formulation" },
  { envKey: "WORKER_HEALTHSCORE_AGENT_API_KEY", mode: "healthscore" },
  { envKey: "WORKER_HOSTING_AGENT_API_KEY", mode: "hosting" },
  { envKey: "WORKER_NONG MATA_AGENT_API_KEY", mode: "panya" },
  { envKey: "WORKER_PRODUCTS_AGENT_API_KEY", mode: "products" },
  { envKey: "WORKER_STOCK_AGENT_API_KEY", mode: "stock" }
];

export const runtimeWorkerProfileModes = runtimeWorkerProfiles.map(
  (profile) => profile.mode
);

export const runtimeWorkerProfileEnvKeys = runtimeWorkerProfiles.map(
  (profile) => profile.envKey
);

export function requiredRuntimeWorkerProfiles(environment) {
  const runtimeEnvironment = String(environment ?? "").trim().toLowerCase();

  return runtimeWorkerProfiles.map((profile) => ({
    ...profile,
    environment: runtimeEnvironment
  }));
}

export function platformWorkerModeRunsProfile(workerMode, profileMode) {
  const normalizedMode = String(workerMode ?? "").trim() || "all";

  return normalizedMode === "all" || normalizedMode === profileMode;
}
