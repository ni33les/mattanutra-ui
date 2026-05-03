import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale } from "@/lib/i18n";

const oneYear = 60 * 60 * 24 * 365;

export function GET(request: NextRequest) {
  const url = request.nextUrl;
  const requestedLocale = url.searchParams.get("locale") || defaultLocale;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const requestedNextPath = url.searchParams.get("next");
  const nextPath =
    requestedNextPath?.startsWith("/") && !requestedNextPath.startsWith("//")
      ? requestedNextPath
      : `/${locale}`;
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  response.cookies.set("NEXT_LOCALE", locale, {
    maxAge: oneYear,
    path: "/",
    sameSite: "lax"
  });

  return response;
}
