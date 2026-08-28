import { loadAgenticConfig, type AgenticConfig } from "@/lib/agentic/config";
import { createMemoryStore } from "@/lib/agentic/store/memory";
import type { AgenticStore } from "@/lib/agentic/store/types";
import {
  createMockPaymentAdapter,
  type PaymentPort
} from "@/lib/agentic/commerce/payment";
import { createStripePaymentAdapter } from "@/lib/agentic/commerce/stripe-adapter";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import type { PlanMatchPort } from "@/lib/agentic/plan/match-port";

export type IsolatedInfoCatalog = Readonly<{
  conditionCodes: readonly string[];
  medicationCodes: readonly string[];
  supportedCountries: ReadonlyArray<{
    countryCode: string;
    countryName: string;
    currency: string;
  }>;
}>;

export type AgenticRuntime = Readonly<{
  config: AgenticConfig;
  deferProcessing?: boolean;
  isolatedInfo?: IsolatedInfoCatalog;
  matchPort?: PlanMatchPort;
  now?: string;
  payment: PaymentPort;
  scope: CapabilityScope;
  store: AgenticStore;
}>;

const globalRuntime = globalThis as typeof globalThis & {
  mattanutraAgenticRuntime?: AgenticRuntime;
};

let overridesRuntime: AgenticRuntime | null = null;

export function createAgenticRuntime(overrides?: Partial<AgenticRuntime>): AgenticRuntime {
  const config = overrides?.config ?? loadAgenticConfig();
  const store = overrides?.store ?? createMemoryStore();

  return {
    config,
    ...(overrides?.deferProcessing ? { deferProcessing: true } : {}),
    ...(overrides?.isolatedInfo ? { isolatedInfo: overrides.isolatedInfo } : {}),
    ...(overrides?.matchPort ? { matchPort: overrides.matchPort } : {}),
    ...(overrides?.now ? { now: overrides.now } : {}),
    payment:
      overrides?.payment ??
      (config.paymentProvider === "mock"
        ? createMockPaymentAdapter()
        : createStripePaymentAdapter()),
    scope: overrides?.scope ?? {
      environment: config.environment,
      principalScope: null,
      tenantScope: "mattanutra"
    },
    store
  };
}

export function getAgenticRuntime(request?: Request): AgenticRuntime {
  if (overridesRuntime) {
    return overridesRuntime;
  }

  if (!globalRuntime.mattanutraAgenticRuntime) {
    globalRuntime.mattanutraAgenticRuntime = createAgenticRuntime({
      config: loadAgenticConfig(request)
    });
  }

  return globalRuntime.mattanutraAgenticRuntime;
}

export function setAgenticRuntimeForTests(runtime: AgenticRuntime | null) {
  overridesRuntime = runtime;
  globalRuntime.mattanutraAgenticRuntime = runtime ?? undefined;
}

export function nowIso() {
  return overridesRuntime?.now ?? new Date().toISOString();
}
