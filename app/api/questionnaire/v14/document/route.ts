import { NextResponse } from "next/server";
import {
  buildV14HtmlDocument,
  isV14HtmlLocale
} from "@/lib/questionnaire/v14/serve";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "") ||
    "https";

  return `${protocol}://${host}`;
}

/**
 * Serves the approved v14 HTML with MN_CONFIG + logo inject only.
 * Routed from /en|/th/nutrition/quiz via next.config rewrite.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale") || "en";
  const locale = isLocale(localeParam) ? localeParam : "en";

  if (!isV14HtmlLocale(locale)) {
    return NextResponse.redirect(
      new URL(`/${locale}/nutrition/quiz-legacy`, requestOrigin(request)),
      307
    );
  }

  try {
    const html = buildV14HtmlDocument({
      locale,
      origin: requestOrigin(request)
    });

    return new NextResponse(html, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        "Content-Type": "text/html; charset=utf-8",
        "X-MattaNutra-Questionnaire": "v14-html"
      }
    });
  } catch (error) {
    console.error("Unable to serve v14 questionnaire HTML", error);
    return NextResponse.json(
      { message: "Questionnaire asset unavailable" },
      { status: 500 }
    );
  }
}
