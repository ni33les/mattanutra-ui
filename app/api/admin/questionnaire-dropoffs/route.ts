import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import { normalizeAdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { normalizeAdminQueryCursor, normalizeQueryLimit } from "@/lib/admin-query-helpers";
import { getQuestionnaireDropoffs } from "@/lib/admin-questionnaire-data";
import { isLocale } from "@/lib/i18n";
import type { QuestionnaireBucket } from "@/lib/questionnaire-dropoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  // Drill-down includes lead identifiers: performance.read alone is insufficient.
  const { context, unauthorized } = await requireAdminRouteAccess(request, "marketing.read");
  if (unauthorized) return unauthorized;
  if (!context?.permissions.includes("performance.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const params = request.nextUrl.searchParams;
  const journey = params.get("journey");
  const generatedAt = params.get("generatedAt") ?? "";
  const bucket = params.get("bucket") ?? "dropped";
  if (!["web", "retail"].includes(journey ?? "") || !Number.isFinite(Date.parse(generatedAt))
    || Date.parse(generatedAt) > Date.now() + 60_000
    || !["dropped", "unknown", "transition", "submission_failed", "submission_pending"].includes(bucket)) {
    return NextResponse.json({ error: "Invalid report selection" }, { status: 400, headers });
  }
  const text = (key: string) => params.get(key)?.trim().slice(0, 300) || undefined;
  const locale = params.get("displayLocale");
  try {
    const data = await getQuestionnaireDropoffs({ range: normalizeAdminDashboardRange(params.get("range") ?? undefined),
      filters: normalizeAdminDashboardFilters(Object.fromEntries(params)), generatedAt: new Date(generatedAt).toISOString(),
      journey: journey as "web" | "retail", pharmacy: text("pharmacy"), source: text("questionnaireSource"),
      question: text("question"), version: text("version"), bucket: bucket as QuestionnaireBucket,
      q: text("q") ?? "", cursor: normalizeAdminQueryCursor(params.get("cursor")), limit: normalizeQueryLimit(params.get("limit")),
      locale: isLocale(locale) ? locale : "en", attempt: text("attempt") });
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Unable to load questionnaire drop-offs", error);
    return NextResponse.json({ error: "Unable to load questionnaire drop-offs" }, { status: 503, headers });
  }
}
