import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticationOptions } from "@/lib/admin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = text(body.email);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    return NextResponse.json(
      await createAuthenticationOptions({
        email,
        request
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start login" },
      { status: 400 }
    );
  }
}
