import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { uuidPattern, type MetaEnvironment } from "@/lib/meta-event-policy";

export const CONNECT_TOKEN_TTL_SECONDS = 86400;
export const connectOwnerHash = (owner: string) => createHash("sha256").update(`connect-owner:v1:${owner}`).digest("hex");
const sign = (value: string, secret: string) => createHmac("sha256", secret).update(`connect-token:v1:${value}`).digest();
export function createConnectToken(id: string, environment: MetaEnvironment, expiresAt: Date, secret: string) {
  const payload = Buffer.from(JSON.stringify({ v: 1, id, env: environment, exp: Math.floor(expiresAt.getTime() / 1000) })).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export function readConnectToken(token: string, environment: MetaEnvironment, secret: string, now = Date.now()): { id: string; expiresAt: number } | null {
  if (!secret || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const signature = Buffer.from(parts[1], "base64url"), expected = sign(parts[0], secret);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (payload.v !== 1 || payload.env !== environment || !uuidPattern.test(payload.id) || !Number.isSafeInteger(payload.exp)
      || payload.exp * 1000 <= now || payload.exp * 1000 > now + CONNECT_TOKEN_TTL_SECONDS * 1000) return null;
    return { id: payload.id, expiresAt: payload.exp * 1000 };
  } catch { return null; }
}

/** Discovery, errors and uncorrelated batch replies cannot establish a connection. */
export function successfulConnectInfo(body: unknown, reply: unknown): boolean {
  if (!body || !reply || typeof body !== "object" || typeof reply !== "object") return false;
  if (Array.isArray(body)) return Array.isArray(reply) && body.some(call => {
    if (!call || call.id == null || body.filter(other => other?.id === call.id).length !== 1) return false;
    return reply.some(result => result?.id === call.id && successfulConnectInfo(call, result));
  });
  const call = body as { method?: string; id?: unknown; params?: { name?: string } };
  const result = reply as { id?: unknown; error?: unknown; result?: { isError?: boolean; structuredContent?: { ok?: boolean }; content?: { type?: string; text?: string }[] } };
  if (call.method !== "tools/call" || call.params?.name !== "info" || call.id == null || call.id !== result.id || result.error || result.result?.isError !== false) return false;
  if (result.result.structuredContent) return result.result.structuredContent.ok === true;
  try { return result.result.content?.some(item => item.type === "text" && JSON.parse(item.text || "null")?.ok === true) === true; }
  catch { return false; }
}
