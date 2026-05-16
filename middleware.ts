import { NextResponse, type NextRequest } from "next/server";
import { shouldRedirectToHttps } from "@/lib/https-redirect";

export function middleware(request: NextRequest) {
  if (
    shouldRedirectToHttps({
      host: request.headers.get("host"),
      nodeEnv: process.env.NODE_ENV,
      protocol: request.nextUrl.protocol,
      xForwardedProto: request.headers.get("x-forwarded-proto")
    })
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";

    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
