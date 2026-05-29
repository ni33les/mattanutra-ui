import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  clearAdminCookieOptions,
  revokeAdminSession
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await revokeAdminSession(request.cookies.get(adminSessionCookieName)?.value);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(adminSessionCookieName, "", clearAdminCookieOptions());
  response.cookies.set(adminCsrfCookieName, "", clearAdminCookieOptions());

  return response;
}
