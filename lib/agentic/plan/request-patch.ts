import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { PLAN_REQUEST } from "@/lib/agentic/contract/schemas";
import { validateToolIssues, schemaIssuesToError } from "@/lib/agentic/contract/validate";
import type { PlanRequest, PlanRequestPatch, PlanResult } from "@/lib/agentic/plan/types";

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export function mergeRequestPatch(base: PlanRequest, patch: PlanRequestPatch): PlanRequest | AgenticErrorResult {
  function merge(original: unknown, incoming: unknown, path = ""): unknown {
    if (incoming === null) {
      if (["requirements.maxProductCount", "requirements.maxDailyPills", "requirements.maxPriceMinor"].includes(path)) return null;
      throw new Error(path);
    }
    if (Array.isArray(incoming)) return structuredClone(incoming);
    if (!record(incoming)) return incoming;
    const result = record(original) ? { ...original } : {};
    for (const [key, value] of Object.entries(incoming)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("unsafe_key");
      result[key] = merge(result[key], value, path ? `${path}.${key}` : key);
    }
    return result;
  }
  let merged: unknown;
  try { merged = merge(base, patch); } catch { return businessError({ fieldPath: "requestPatch", reasonCode: "invalid_request", message: "Only product, pill and price ceilings can be cleared with null; other fields cannot be null or use unsafe property names. Omit a field to preserve it or use [] to clear an array." }); }
  const issues = validateToolIssues(PLAN_REQUEST, merged);
  return issues.length ? schemaIssuesToError(issues) : merged as PlanRequest;
}
export function originalRequestFor(result: PlanResult): PlanRequest | AgenticErrorResult {
  const original = result.originalRequest ?? result.requestSnapshot.originalRequest ?? result.pendingInput?.request;
  if (original) return structuredClone(original);
  const state = result.requestSnapshot;
  if (result.contractVersion !== AGENTIC_CONTRACT_VERSION && state.requirements.maxProductCount != null) {
    return businessError({
      fieldPath: "request.requirements.maxProductCount",
      reasonCode: "contract_refresh_required",
      message: "The original request is unavailable, so this recorded product count may be a customer ceiling or a historical default. Send a full replacement request with a customer-confirmed maxProductCount (null for unrestricted), preserving the targets, medications, intake, product proposals and other constraints.",
      nextActions: ["replace_request"]
    });
  }
  // Legacy leftovers did not distinguish requested targets from existing intake.
  // Do not silently turn an existing supplement into a newly requested target.
  if (state.leftovers.some(item => !item.source)) return businessError({ fieldPath: "request.targets", reasonCode: "invalid_request", message: "This legacy plan has unresolved inputs without target provenance. Send a replacement request containing the original requested targets; keep disclosed medications and other context." });
  return {
    locale: state.locale, destinationCountry: state.destinationCountry, optimization: state.optimization,
    profile: state.profile, requirements: state.requirements,
    medicationCodes: state.medicationCodes, conditionCodes: state.conditionCodes,
    currentSupplements: state.currentSupplements.map(item => ({ dailyAmount: item.dailyAmount, name: item.name, supplementId: item.supplementId, unit: item.unit, ...(item.productId ? { productId: item.productId } : {}), ...(item.daysRemaining != null ? { daysRemaining: item.daysRemaining } : {}) })), ...(state.intake ? { intake: state.intake } : {}),
    ...(state.baseline ? { baseline: state.baseline } : {}),
    targets: [...state.targets.map(item => ({ amount: item.amount, name: item.requestedName ?? item.name, supplementId: item.supplementId, unit: item.unit, ...(item.basis ? { basis: item.basis } : {}), ...(item.importance ? { importance: item.importance } : {}), ...(item.acceptableRange ? { acceptableRange: item.acceptableRange } : {}), ...(item.prerequisite ? { prerequisite: item.prerequisite } : {}) })), ...state.leftovers.filter(item => item.source === "target" && item.amount != null && item.unit).map(item => ({ name: item.name, amount: item.amount!, unit: item.unit!, ...(item.supplementId ? { supplementId: item.supplementId } : {}) }))]
  };
}
