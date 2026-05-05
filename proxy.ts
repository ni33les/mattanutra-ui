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

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(":", "") ||
    "https";

  return `${protocol}://${host.split(",")[0]?.trim()}`;
}

function stripInternalSearchParams(search: string) {
  const params = new URLSearchParams(search);

  params.delete("_rsc");

  const nextSearch = params.toString();

  return nextSearch ? `?${nextSearch}` : "";
}

function withNoStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate"
  );
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Surrogate-Control", "no-store");

  return response;
}

function redirectToPath(request: NextRequest, pathname: string, search = "") {
  return withNoStore(
    NextResponse.redirect(
      new URL(
        `${pathname}${stripInternalSearchParams(search)}`,
        getRequestOrigin(request)
      )
    )
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    publicFile.test(pathname)
  ) {
    return NextResponse.next();
  }

  const pathnameLocale = pathname.split("/")[1];

  if (isLocale(pathnameLocale)) {
    return withNoStore(NextResponse.next());
  }

  if (removedLocales.has(pathnameLocale)) {
    return redirectToPath(request, `/${defaultLocale}`, search);
  }

  const locale = getPreferredLocale(request);

  return redirectToPath(
    request,
    `/${locale}${pathname === "/" ? "" : pathname}`,
    search
  );
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"]
};
