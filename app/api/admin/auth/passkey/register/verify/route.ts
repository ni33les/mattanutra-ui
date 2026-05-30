import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  adminCookieOptions,
  adminCsrfCookieName,
  adminCsrfCookieOptions,
  adminSessionCookieName,
  verifyRegistrationAndCreateSession
} from "@/lib/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNext(value: unknown) {
  const next = text(value);

  return next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/en/admin/dashboard";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const challengeId = text(body.challengeId);
    const response = body.response as RegistrationResponseJSON | undefined;

    if (!challengeId || !response) {
      return NextResponse.json(
        { error: "Registration response is required" },
        { status: 400 }
      );
    }

    const session = await verifyRegistrationAndCreateSession({
      challengeId,
      request,
      response
    });
    const json = NextResponse.json({ ok: true, redirectTo: safeNext(body.next) });

    json.cookies.set(
      adminSessionCookieName,
      session.sessionCookie,
      adminCookieOptions(session.expiresAt)
    );
    json.cookies.set(
      adminCsrfCookieName,
      session.csrfToken,
      adminCsrfCookieOptions(session.expiresAt)
    );

    return json;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify registration" },
      { status: 400 }
    );
  }
}
