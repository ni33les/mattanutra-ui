import { createPharmacyOrder, readPharmacyOrder, pharmacyOrderQuote, readPharmacyAnalysis } from "@/lib/pharmacy-orders";
import { funnelErrorResponse } from "@/lib/funnel-errors";
import { isLocale } from "@/lib/i18n";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";
export const runtime = "nodejs";
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPlanMutation);
  if (limited) return limited;
  try { return json(await createPharmacyOrder(await request.json(), request.headers.get("Idempotency-Key") ?? "")); }
  catch (error) { return funnelErrorResponse(error); }
}
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const plan = q.get("plan") ?? "", pharmacy = q.get("pharmacy") ?? "", locale = q.get("locale");
    if (q.get("view") === "analysis") return json(await readPharmacyAnalysis(plan, pharmacy, q.get("order") ?? undefined));
    const order = await readPharmacyOrder(plan, pharmacy, q.get("order") ?? undefined);
    if (order) return json(order);
    const quote = await pharmacyOrderQuote(plan, pharmacy, isLocale(locale) ? locale : "en");
    return json({ receipt: null, lines: quote.lines, revision: quote.assessment.revision });
  } catch (error) { return funnelErrorResponse(error); }
}
