import { siteBaseUrl } from "@/lib/site-url";

export const AGENTIC_CONTRACT_VERSION = "3.0.0";
export const AGENTIC_SERVICE_NAME = "MattaNutra";
export const AGENTIC_SERVICE_VERSION = "3.0.0";
export const AGENTIC_MIGRATION_VERSION = "agentic-3.0.0";
export const AGENTIC_POLL_AFTER_SECONDS = 3;
export const AGENTIC_CHECKOUT_TTL_MS = 15 * 60 * 1000;
export const AGENTIC_PLAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AGENTIC_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GUIDANCE_RULES_VERSION = "3.0.0";

export type AgenticEnvironment = "dev" | "prd" | "uat";
export type PaymentProviderMode = "mock" | "stripe_test" | "stripe_live";
export type RetailerAdapterId = "mock_thailand" | "thailand_uat" | "thailand_live";

export type AgenticConfig = Readonly<{
  activeMarkets: readonly string[];
  buildId: string;
  capabilitySecret: string;
  checkoutTtlMs: number;
  continuation: "polling_only";
  planTtlMs: number;
  environment: AgenticEnvironment;
  internalQaHarness: boolean;
  paymentProvider: PaymentProviderMode;
  siteUrl: string;
  thailandRetailerAdapter: RetailerAdapterId;
  userAccountRequired: false;
}>;

function normalizeEnv(value: string | null | undefined): AgenticEnvironment | null {
  const raw = value?.trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (raw === "production" || raw === "prod") {
    return "prd";
  }

  if (raw === "staging" || raw === "stage") {
    return "uat";
  }

  if (raw === "development" || raw === "local") {
    return "dev";
  }

  return raw === "dev" || raw === "uat" || raw === "prd" ? raw : null;
}

export function resolveAgenticEnvironment(request?: Request): AgenticEnvironment {
  const explicit = normalizeEnv(process.env.MATTANUTRA_ENV);

  if (explicit) {
    return explicit;
  }

  const host = request?.headers.get("host")?.split(",")[0]?.trim().toLowerCase() ?? "";

  if (host === "localhost" || host === "127.0.0.1" || host.startsWith("localhost:")) {
    return "dev";
  }

  if (/(^|[.-])uat($|[.-])/.test(host)) {
    return "uat";
  }

  if (host === "mattanutra.com" || host === "www.mattanutra.com") {
    return "prd";
  }

  return "dev";
}

function paymentProviderForEnv(environment: AgenticEnvironment): PaymentProviderMode {
  const explicit = process.env.AGENTIC_PAYMENT_PROVIDER?.trim();

  if (explicit === "mock" || explicit === "stripe_test" || explicit === "stripe_live") {
    return explicit;
  }

  if (environment === "dev") {
    return "mock";
  }

  if (environment === "uat") {
    return "stripe_test";
  }

  return "stripe_live";
}

function retailerAdapterForEnv(environment: AgenticEnvironment): RetailerAdapterId {
  const explicit = process.env.TH_RETAILER_ADAPTER?.trim();

  if (
    explicit === "mock_thailand" ||
    explicit === "thailand_uat" ||
    explicit === "thailand_live"
  ) {
    return explicit;
  }

  return environment === "dev" ? "mock_thailand" : "thailand_uat";
}

export function assertInternalQaHarness(config: AgenticConfig) {
  if (!config.internalQaHarness || config.environment !== "dev") {
    throw Object.assign(new Error("Not found."), { reasonCode: "not_found" as const });
  }

  if (config.paymentProvider !== "mock" || config.thailandRetailerAdapter !== "mock_thailand") {
    throw Object.assign(new Error("Adapter mismatch."), {
      reasonCode: "adapter_mismatch" as const
    });
  }

  if (config.continuation !== "polling_only") {
    throw Object.assign(new Error("Adapter mismatch."), {
      reasonCode: "adapter_mismatch" as const
    });
  }
}

export function loadAgenticConfig(request?: Request): AgenticConfig {
  const environment = resolveAgenticEnvironment(request);
  const paymentProvider = paymentProviderForEnv(environment);
  const thailandRetailerAdapter = retailerAdapterForEnv(environment);
  const internalQaHarness =
    process.env.INTERNAL_QA_HARNESS === "true" ||
    (environment === "dev" && process.env.INTERNAL_QA_HARNESS !== "false");
  const capabilitySecret =
    process.env.AGENTIC_CAPABILITY_KEY?.trim() ||
    process.env.MCP_V2_ORDER_HANDLE_SECRET?.trim() ||
    (environment === "dev" ? "dev-agentic-capability-key-not-for-uat" : "");

  if (!capabilitySecret) {
    throw new Error("AGENTIC_CAPABILITY_KEY is required outside DEV");
  }

  if (paymentProvider === "mock" && environment !== "dev") {
    throw new Error("Mock payment is only allowed in DEV");
  }

  if (paymentProvider === "stripe_live" && environment !== "prd") {
    throw new Error("Live Stripe is not allowed in DEV or UAT");
  }

  if (internalQaHarness) {
    if (environment !== "dev") {
      throw new Error("Internal QA harness is only allowed in DEV");
    }

    if (paymentProvider !== "mock") {
      throw new Error("Internal QA harness requires MockPaymentAdapter");
    }

    if (thailandRetailerAdapter !== "mock_thailand") {
      throw new Error("Internal QA harness requires mock Thailand OMS");
    }
  }

  if (thailandRetailerAdapter === "mock_thailand" && environment !== "dev") {
    throw new Error("Mock Thailand retailer is only allowed in DEV");
  }

  return {
    activeMarkets: ["TH"],
    buildId:
      process.env.AGENTIC_BUILD_ID?.trim() ||
      process.env.COMMIT_SHA?.trim() ||
      process.env.COMMIT_HASH?.trim() ||
      `local-${AGENTIC_SERVICE_VERSION}`,
    capabilitySecret,
    checkoutTtlMs: AGENTIC_CHECKOUT_TTL_MS,
    continuation: "polling_only",
    planTtlMs: AGENTIC_PLAN_TTL_MS,
    environment,
    internalQaHarness,
    paymentProvider,
    siteUrl: siteBaseUrl(),
    thailandRetailerAdapter,
    userAccountRequired: false
  };
}
