import { loadAgenticConfig, type AgenticConfig } from "@/lib/agentic/config";
import { createMemoryStore } from "@/lib/agentic/store/memory";
import type { AgenticStore } from "@/lib/agentic/store/types";
import {
  createMockPaymentAdapter,
  type PaymentPort
} from "@/lib/agentic/commerce/payment";
import type { CapabilityScope } from "@/lib/agentic/capabilities";

export type AgenticRuntime = Readonly<{
  config: AgenticConfig;
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
    payment: overrides?.payment ?? createMockPaymentAdapter(),
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
  return new Date().toISOString();
}
