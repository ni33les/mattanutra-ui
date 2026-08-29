import { nutritionRevealPath } from "@/lib/nutrition-paths";
import type { Locale } from "@/lib/i18n";

export type OrderCheckoutChannel = "agentic" | "web";

export function orderCheckoutChannel(value: unknown): OrderCheckoutChannel {
  if (value === "agentic" || value === "mcp") {
    return "agentic";
  }

  return "web";
}

export function orderTrackFormulationHref(input: Readonly<{
  channel: unknown;
  locale: Locale;
  planId?: string | null;
}>) {
  if (orderCheckoutChannel(input.channel) !== "web") {
    return null;
  }

  const planId = typeof input.planId === "string" ? input.planId.trim() : "";

  if (!planId) {
    return null;
  }

  return nutritionRevealPath(input.locale, planId);
}
