import { NextResponse } from "next/server";
import { adminClawRequestAllowed } from "@/lib/admin-auth";

const noStoreHeaders = {
  "Cache-Control": "no-store"
} as const;

const unauthorizedHeaders = {
  ...noStoreHeaders,
  "WWW-Authenticate": 'Bearer realm="mattanutra-openclaw-api"'
} as const;

export function openClawUnauthorized() {
  return NextResponse.json(
    { message: "OpenClaw API access is not authorized" },
    {
      headers: unauthorizedHeaders,
      status: 401
    }
  );
}

export function requireOpenClawRequest(request: Request) {
  return adminClawRequestAllowed(request) ? null : openClawUnauthorized();
}

export function openClawJson(
  body: unknown,
  init: Readonly<{
    status?: number;
  }> = {}
) {
  return NextResponse.json(body, {
    headers: noStoreHeaders,
    status: init.status
  });
}

export async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => ({}));

  return objectValue(body);
}

export function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

export function taskApiError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const isMissing = /not found/i.test(message);

  return openClawJson(
    { message },
    {
      status: isMissing ? 404 : 400
    }
  );
}
