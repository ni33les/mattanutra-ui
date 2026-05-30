import { NextResponse, type NextRequest } from "next/server";
import { createRegistrationOptions } from "@/lib/admin-access";
import { isLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = text(body.email);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const result = await createRegistrationOptions({
      accessToken: text(body.accessToken) || null,
      displayName: text(body.displayName) || null,
      email,
      inviteToken: text(body.inviteToken) || null,
      locale: localeValue(body.locale),
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
