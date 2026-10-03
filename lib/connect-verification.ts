import { randomBytes, randomUUID } from "node:crypto";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { metaConfig } from "@/lib/meta-config";
import { metaOrigin, type MetaEnvironment } from "@/lib/meta-event-policy";
import { enqueueMetaEvent, marketingCookie, metaMatchingFromRequest, requestMetaContext, type MetaContext } from "@/lib/meta-tracking";
import { connectCampaign, type ConnectProvider } from "@/lib/connect";
import { CONNECT_TOKEN_TTL_SECONDS, connectOwnerHash, createConnectToken, readConnectToken } from "@/lib/connect-token";
import type { Locale } from "@/lib/i18n";

export const connectVerificationEnabled = () => process.env.CONNECT_VERIFICATION_ENABLED !== "false";
export const connectCookieName = (environment: MetaEnvironment) => `mn_connect_owner_${environment}`;
export function connectSecret() {
  const secret = process.env.CONNECT_SIGNING_SECRET?.trim() || process.env.AGENTIC_CAPABILITY_KEY?.trim() || process.env.MCP_V2_ORDER_HANDLE_SECRET?.trim();
  if (!secret) throw new Error("Connection verification is not configured");
  return secret;
}
export function connectOwner(request: Request) {
  const owner = marketingCookie(request, connectCookieName(metaConfig().environment));
  return owner && /^[A-Za-z0-9_-]{43}$/.test(owner) ? owner : null;
}
export function connectIsLocalRequest(request: Request) {
  if (metaConfig().environment !== "dev") return false;
  try {
    const origin = new URL(request.headers.get("origin") || ""), internal = new URL(request.url);
    return ["http:", "https:"].includes(origin.protocol) && ["localhost", "127.0.0.1"].includes(origin.hostname)
      && ["localhost", "127.0.0.1", "0.0.0.0"].includes(internal.hostname) && origin.port === internal.port;
  } catch { return false; }
}
export function connectServerUrl(request?: Request) {
  const environment = metaConfig().environment;
  // Next may expose localhost internally even for a public reverse-proxied request.
  const origin = request && connectIsLocalRequest(request) ? new URL(request.headers.get("origin")!).origin : metaOrigin(environment);
  return `${origin}/api/mcp`;
}

export async function createConnectAttempt(request: Request, input: { provider: ConnectProvider; locale: Locale; visitorId: string; sourceUrl?: string }) {
  const sql = getSql();
  if (!sql || !connectVerificationEnabled()) throw new Error("Connection confirmation unavailable");
  const secret = connectSecret(), environment = metaConfig().environment;
  const id = randomUUID(), owner = connectOwner(request) || randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + CONNECT_TOKEN_TTL_SECONDS * 1000);
  const campaign = connectCampaign(input.sourceUrl || "/");
  const context = await requestMetaContext(request, sql);
  await withDatabaseTransaction(sql, async tx => {
    if (context) await tx`update public.meta_tracking_contexts set matching=matching || ${tx.json(metaMatchingFromRequest(request, input.sourceUrl))},
      attribution=attribution || ${tx.json(campaign)},updated_at=now() where id=${context.id}::uuid and consent_granted`;
    await tx`insert into public.connect_attempts (id,environment,provider,locale,owner_hash,visitor_id,campaign,meta_context_id,expires_at)
      values (${id}::uuid,${environment},${input.provider},${input.locale},${connectOwnerHash(owner)},${input.visitorId}::uuid,
        ${tx.json(campaign)},${context?.id ?? null}::uuid,${expiresAt})`;
  });
  const url = new URL(connectServerUrl(request));
  url.searchParams.set("connect_token", createConnectToken(id, environment, expiresAt, secret));
  return { owner, attempt: { id, expiresAt: expiresAt.toISOString(), connectionUrl: url.href, status: "pending" as const } };
}

export async function getConnectAttempt(request: Request, id: string) {
  const sql = getSql(), owner = connectOwner(request);
  if (!owner) return null;
  if (!sql || !connectVerificationEnabled()) throw new Error("Connection confirmation unavailable");
  const [row] = await sql<{ expires_at: Date; verified_at: Date | null }[]>`select expires_at,verified_at from public.connect_attempts
    where id=${id}::uuid and environment=${metaConfig().environment} and owner_hash=${connectOwnerHash(owner)}`;
  return row ? { id, expiresAt: row.expires_at.toISOString(), status: row.verified_at ? "verified" as const : row.expires_at.getTime() <= Date.now() ? "expired" as const : "pending" as const } : null;
}

/** Called after the MCP response. The atomic database record is independent of Meta delivery. */
export async function verifyConnectToken(token: string) {
  if (!connectVerificationEnabled()) return false;
  const environment = metaConfig().environment;
  const decoded = readConnectToken(token, environment, connectSecret());
  if (!decoded) return false;
  const sql = getSql(); if (!sql) return false;
  await withDatabaseTransaction(sql, async tx => {
    // UPDATE's row lock makes concurrent info calls produce exactly one milestone.
    await tx`with confirmed as (
      update public.connect_attempts set verified_at=now()
      where id=${decoded.id}::uuid and environment=${environment} and expires_at>now() and verified_at is null
      returning *
    ) insert into public.connect_funnel_events(id,environment,event_name,provider,locale,visitor_id,attempt_id,campaign,occurred_at)
      select ${randomUUID()}::uuid,environment,'verified',provider,locale,visitor_id,id,campaign,verified_at from confirmed
      on conflict do nothing`;
  });
  await flushConnectMeta(decoded.id);
  return true;
}

/** Durable, idempotent outbox recovery: called after info/status and by the maintenance command. */
export async function flushConnectMeta(id?: string) {
  const sql = getSql(); if (!sql) return;
  await withDatabaseTransaction(sql, async tx => {
    const rows = await tx<{ id: string; provider: ConnectProvider; locale: Locale; campaign: Record<string, string>; verified_at: Date; meta_context_id: string | null }[]>`
      select id,provider,locale,campaign,verified_at,meta_context_id from public.connect_attempts
      where environment=${metaConfig().environment} and verified_at is not null and meta_recorded_at is null
        ${id ? tx`and id=${id}::uuid` : tx``}
      order by verified_at limit 25 for update skip locked`;
    for (const row of rows) {
      if (row.meta_context_id && !metaConfig().enabled) continue;
      const [context] = row.meta_context_id ? await tx<MetaContext[]>`select id,environment,consent_granted,attribution,matching
        from public.meta_tracking_contexts where id=${row.meta_context_id}::uuid and environment=${metaConfig().environment}
          and consent_granted and expires_at>now()` : [];
      if (context) await enqueueMetaEvent(tx, { context, name: "McpConnectionVerified", sourceKey: `connect:${row.id}`,
        occurredAt: row.verified_at, sourceUrl: `/${row.locale}/connect/${row.provider}`,
        data: { ...row.campaign, provider: row.provider, locale: row.locale, stage: "connect_verified" } });
      await tx`update public.connect_attempts set meta_recorded_at=now() where id=${row.id}::uuid`;
    }
  });
}
