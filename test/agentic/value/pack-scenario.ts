import { COVERED_THRESHOLD, OVER_TARGET_THRESHOLD } from "../../../lib/matcher/config.ts";
import type { ValueRoleRequest } from "../../../lib/agentic/value/roles.ts";
import type { MatcherUnit } from "../../../lib/matcher/types.ts";

function band(amount: number, unit: MatcherUnit, name: string) {
  return {
    amount,
    maximum: (amount * OVER_TARGET_THRESHOLD) / 100,
    minimum: (amount * COVERED_THRESHOLD) / 100,
    name,
    unit
  };
}

export const VALUE_PACK_VERSION = "dev-customer-value-v1.0";
export const VALUE_QA_PACK_VERSION = "v8.0";

export const VALUE_ROLE_REQUEST: ValueRoleRequest = {
  creatine: band(3, "g", "Creatine"),
  magnesium: band(150, "mg", "Magnesium"),
  vitaminD3: band(1000, "IU", "Vitamin D3")
};
