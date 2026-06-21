import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  createAdditionalPasskeyRegistrationOptions,
  resolveAdminSession
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const context = await resolveAdminSession({
      csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
      sessionCookie: request.cookies.get(adminSessionCookieName)?.value
    });

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await createAdditionalPasskeyRegistrationOptions({
      context,
      request
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start registration" },
      { status: 400 }
    );
  }
}
