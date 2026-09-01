import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import type { CanonicalPlanStamp, StackOption } from "@/lib/agentic/plan/types";
import { canonicalHash, canonicalJson } from "@/lib/agentic/value/canonical";

export const CUSTOMER_VALUE_PACK_VERSION = "dev-customer-value-v1.0";

function canonicalOptionValue(option: StackOption) {
  return {
    burden: {
      administrations: option.burden?.administrations ?? 0,
      pills: option.burden?.pills ?? 0,
      productCount: option.burden?.productCount ?? 0
    },
    cash90DayMinor: option.economics?.cash90DayMinor ?? option.cash90DayMinor ?? null,
    coverage: [...option.coverage]
      .map((row) => ({
        status: row.status,
        supplementId: row.supplementId
      }))
      .sort((left, right) => left.supplementId.localeCompare(right.supplementId)),
    optionId: option.optionId,
    productIds: option.basket.map((item) => item.productId).slice().sort(),
    recommended: Boolean(option.recommended),
    role: option.role ?? null,
    safetyCodes: [...(option.safety?.guidance ?? [])]
      .map((row) => row.code)
      .slice()
      .sort(),
    savings90DayMinor: option.economics?.savings90DayMinor ?? null
  };
}

export function canonicalPlanValue(input: Readonly<{
  leftovers: readonly unknown[];
  options: readonly StackOption[];
  safetyGuidance: readonly Readonly<{ action: string; code: string }>[];
  status: string;
}>) {
  return {
    leftovers: [...input.leftovers].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right))
    ),
    options: [...input.options]
      .map(canonicalOptionValue)
      .sort((left, right) => left.optionId.localeCompare(right.optionId)),
    safety: [...input.safetyGuidance]
      .map((row) => ({ action: row.action, code: row.code }))
      .sort(
        (left, right) =>
          left.code.localeCompare(right.code) || left.action.localeCompare(right.action)
      ),
    status: input.status
  };
}

export function buildCanonicalPlanStamp(input: Readonly<{
  leftovers: readonly unknown[];
  matcherVersion: string;
  options: readonly StackOption[];
  safetyGuidance: readonly Readonly<{ action: string; code: string }>[];
  snapshotId: string;
  status: string;
}>): CanonicalPlanStamp {
  const value = canonicalPlanValue(input);
  return {
    buildId:
      process.env.AGENTIC_BUILD_ID?.trim() ||
      process.env.COMMIT_SHA?.trim() ||
      process.env.COMMIT_HASH?.trim() ||
      `local-${AGENTIC_SERVICE_VERSION}`,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    hash: canonicalHash(value),
    matcherVersion: input.matcherVersion,
    packVersion: CUSTOMER_VALUE_PACK_VERSION,
    snapshotId: input.snapshotId
  };
}
