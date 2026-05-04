import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

const publicFile = /\.(.*)$/;
const removedLocales = new Set(["es"]);

function getPreferredLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const languages = request.headers
    .get("accept-language")
    ?.split(",")
    .map((language) => language.trim().split(";")[0]?.split("-")[0])
    .filter(Boolean);

  const locale = languages?.find((language) => isLocale(language));

  return isLocale(locale) ? locale : defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    publicFile.test(pathname)
  ) {
    return NextResponse.next();
  }

  const pathnameLocale = pathname.split("/")[1];

  if (isLocale(pathnameLocale)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();

  if (removedLocales.has(pathnameLocale)) {
    url.pathname = `/${defaultLocale}`;
    return NextResponse.redirect(url);
  }

  const locale = getPreferredLocale(request);
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"]
};
