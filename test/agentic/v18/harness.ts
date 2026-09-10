import {
  beginV16Run,
  createFrozenCatalogueStore,
  createV16Runtime,
  endV16Run,
  freezeRealThailandCatalogue,
  domainPlanCreate,
  structured
} from "../v16/harness.ts";
import { handleCompletedJsonRpc as handleJsonRpc } from "../../helpers/completed-mcp-client.ts";
import { loadAgenticConfig } from "../../../lib/agentic/config.ts";
import { createAgenticRuntime, setAgenticRuntimeForTests } from "../../../lib/agentic/runtime.ts";
import { createMockPaymentAdapter } from "../../../lib/agentic/commerce/payment.ts";
import { F_READY_EN, F_READY_TH, V18_CLOCK } from "./manifest.ts";
import { asRecord } from "./diff.ts";

export {
  beginV16Run as beginV18Run,
  endV16Run as endV18Run,
  freezeRealThailandCatalogue,
  domainPlanCreate
};

export function createV18Runtime(namespace: string) {
  const store = createFrozenCatalogueStore();
  const runtime = createAgenticRuntime({
    config: {
      ...loadAgenticConfig(),
      environment: "dev",
      internalQaHarness: true,
      paymentProvider: "mock",
      thailandRetailerAdapter: "mock_thailand"
    },
    now: V18_CLOCK,
    payment: createMockPaymentAdapter(),
    scope: {
      environment: "dev",
      principalScope: namespace.startsWith("qa-v3:") ? namespace : `qa-v3:${namespace}`,
      tenantScope: "mattanutra"
    },
    store
  });
  setAgenticRuntimeForTests(runtime);
  return { runtime, store };
}

export async function createReady(
  namespace: string,
  locale: "en" | "th",
  key: string,
  request: Record<string, unknown> = locale === "th" ? F_READY_TH : F_READY_EN
) {
  const { runtime } = createV18Runtime(namespace);
  const result = await domainPlanCreate(runtime, key, request as typeof F_READY_EN);
  return { runtime, result };
}

export function basketOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.basket) ? plan.basket.map(asRecord) : [];
}

export function coverageOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
}

export function compactOf(plan: Record<string, unknown>) {
  return asRecord(plan.compactDecision);
}

export function canonicalHashOf(plan: Record<string, unknown>) {
  return String(asRecord(plan.canonical).hash ?? "");
}

export function selectionReasons(plan: Record<string, unknown>) {
  return basketOf(plan).map((item) => asRecord(item.selectionReason));
}

export function hasThaiScript(value: unknown) {
  return /[\u0E00-\u0E7F]/.test(JSON.stringify(value ?? ""));
}

export function serialize(value: unknown) {
  return JSON.stringify(value);
}

export { createV16Runtime, structured, handleJsonRpc, F_READY_EN, F_READY_TH };
