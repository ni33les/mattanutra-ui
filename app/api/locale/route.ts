import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale } from "@/lib/i18n";

const oneYear = 60 * 60 * 24 * 365;

function redirectToRelativePath(path: string) {
  return new NextResponse(null, {
    headers: {
      "Cache-Control":
        "private, no-store, no-cache, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      Location: path,
      "Surrogate-Control": "no-store"
    },
    status: 307
  });
}

function stripInternalSearchParams(path: string) {
  const url = new URL(path, "https://mattanutra.local");

  url.searchParams.delete("_rsc");

  return `${url.pathname}${url.search}${url.hash}`;
}

export function GET(request: NextRequest) {
  const url = request.nextUrl;
  const requestedLocale = url.searchParams.get("locale") || defaultLocale;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const requestedNextPath = url.searchParams.get("next");
  const safeNextPath =
    requestedNextPath?.startsWith("/") && !requestedNextPath.startsWith("//")
      ? stripInternalSearchParams(requestedNextPath)
      : `/${locale}`;
  const nextPath = safeNextPath.startsWith(`/${locale}`)
    ? safeNextPath
    : `/${locale}`;
  const response = redirectToRelativePath(nextPath);

  response.cookies.set("NEXT_LOCALE", locale, {
    maxAge: oneYear,
    path: "/",
    sameSite: "lax"
  });

  return response;
}
