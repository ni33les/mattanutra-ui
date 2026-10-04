import { isIP } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { createTask } from "@/lib/task-service";
import type { JourneyChannel } from "@/lib/journey-channel";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { metaConfig } from "@/lib/meta-config";
import { hashEmailForFacebook, hashPhoneForFacebook } from "@/lib/facebook-capi";
import { META_CONSENT_COOKIE, META_CONTEXT_COOKIE, META_CONSENT_VERSION, metaCustomData, sanitiseMetaUrl, uuidPattern, type MetaEventName, type MetaPreferenceSource } from "@/lib/meta-event-policy";

type Db = postgres.Sql | postgres.TransactionSql;
type Resource = "plan" | "payment" | "retail" | "agentic";
export type MetaContext = { id: string; environment: string; consent_granted: boolean; attribution: Record<string, string>; matching: Record<string, string | string[]> };
export function marketingCookie(request: Request, name: string) {
  const value = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : null; } catch { return null; }
}

export async function requestMetaContext(request?: Request | null, sql: Db | null = getSql()): Promise<MetaContext | null> {
  if (!request || !sql || !metaConfig().enabled || marketingCookie(request, META_CONSENT_COOKIE) !== "granted") return null;
  const id = marketingCookie(request, META_CONTEXT_COOKIE);
  if (!id || !uuidPattern.test(id)) return null;
  const [context] = await sql<MetaContext[]>`select id,environment,consent_granted,attribution,matching from public.meta_tracking_contexts
    where id=${id}::uuid and environment=${metaConfig().environment} and consent_granted and expires_at>now()`;
  return context ?? null;
}

export function metaMatchingFromRequest(request: Request, sourceUrl?: unknown) {
  const matching: Record<string, string> = {};
  const fbp = marketingCookie(request, "_fbp"), fbc = marketingCookie(request, "_fbc");
  if (fbp && /^fb\.\d\.\d{10,13}\.[\w-]{1,250}$/.test(fbp)) matching.fbp = fbp;
  if (fbc && /^fb\.\d\.\d{10,13}\.[\w-]{1,500}$/.test(fbc)) matching.fbc = fbc;
  try {
    const click = typeof sourceUrl === "string" ? new URL(sourceUrl).searchParams.get("fbclid") : null;
    if (click && /^[\w-]{1,500}$/.test(click)) matching.fbc = `fb.1.${Date.now()}.${click}`;
  } catch { /* Invalid URLs are never exported. */ }
  const ua = request.headers.get("user-agent");
  if (ua && ua.length <= 1024) matching.client_user_agent = ua;
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip"))?.trim();
  if (ip && isIP(ip)) matching.client_ip_address = ip;
  return matching;
}

export async function setMetaConsent(request: Request, granted: boolean, sourceUrl?: unknown) {
  return (await setMetaPreference(request, granted, sourceUrl, "explicit")).id;
}

/** Automatic activation is recorded as a site default, never an explicit consent action. */
export async function setMetaPreference(request: Request, granted: boolean, sourceUrl: unknown, source: MetaPreferenceSource) {
  const sql = getSql(); if (!sql) throw new Error("Database is not configured");
  const config = metaConfig();
  const cookieId = marketingCookie(request, META_CONTEXT_COOKIE);
  const id = cookieId && uuidPattern.test(cookieId) ? cookieId : randomUUID();
  return withDatabaseTransaction(sql, async tx => {
    const matching = granted ? metaMatchingFromRequest(request, sourceUrl) : {};
    const [saved] = await tx<{ id: string; consent_granted: boolean }[]>`insert into public.meta_tracking_contexts (id,environment,consent_version,consent_granted,preference_source,matching)
      values (${id}::uuid,${config.environment},${META_CONSENT_VERSION},${granted},${source},${tx.json(matching)})
      on conflict(id) do update set consent_granted=excluded.consent_granted,consent_version=excluded.consent_version,
        preference_source=case when ${source}='site_default' then meta_tracking_contexts.preference_source else excluded.preference_source end,
        matching=case when excluded.consent_granted then meta_tracking_contexts.matching || excluded.matching else '{}'::jsonb end,
        expires_at=now()+interval '90 days',updated_at=now()
      where meta_tracking_contexts.environment=excluded.environment
        and (${source}='explicit' or meta_tracking_contexts.consent_granted)
      returning id,consent_granted`;
    if (!saved) {
      const [existing] = await tx<{ id: string; consent_granted: boolean }[]>`select id,consent_granted from public.meta_tracking_contexts
        where id=${id}::uuid and environment=${config.environment}`;
      if (!existing) throw new Error("Marketing context belongs to another environment");
      return { id: existing.id, granted: existing.consent_granted };
    }
    if (!granted) await tx`update public.meta_conversion_events set status='suppressed',response_message='consent_withdrawn',updated_at=now()
      where context_id=${id}::uuid and status in ('queued','retrying','sending')`;
    return { id: saved.id, granted: saved.consent_granted };
  });
}

/** Called only after the application validates/captures the associated business resource. */
export async function bindMetaContext(sql: Db, resourceType: Resource, resourceId: string, request?: Request, contact?: { email?: string | null; phone?: string | null; country?: string | null }) {
  const context = await requestMetaContext(request, sql);
  if (!context) return null;
  const matching: Record<string, string | string[]> = request ? metaMatchingFromRequest(request) : {};
  const email = hashEmailForFacebook(contact?.email);
  const rawPhone = contact?.phone?.trim() ?? "";
  // A national number is ambiguous without its country. Do not guess a Thai number for other markets.
  const international = rawPhone.startsWith("+") ? rawPhone : rawPhone.startsWith("00") ? `+${rawPhone.slice(2)}`
    : contact?.country === "TH" ? rawPhone : "";
  const phone = international && international.replace(/\D/g, "").length >= 8 && international.replace(/\D/g, "").length <= 15
    ? hashPhoneForFacebook(international) : null;
  if (email) matching.em = [email];
  if (phone) matching.ph = [phone];
  await sql`insert into public.meta_tracking_bindings(resource_type,resource_id,context_id)
    values (${resourceType},${resourceId},${context.id}::uuid) on conflict(resource_type,resource_id) do nothing`;
  if (Object.keys(matching).length) await sql`update public.meta_tracking_contexts set matching=matching || ${sql.json(matching)},updated_at=now()
    where id=${context.id}::uuid and consent_granted`;
  return context;
}

export async function boundMetaContext(sql: Db, resourceType: Resource, resourceId: string) {
  if (!metaConfig().enabled) return null;
  const [row] = await sql<MetaContext[]>`select c.id,c.environment,c.consent_granted,c.attribution,c.matching
    from public.meta_tracking_bindings b join public.meta_tracking_contexts c on c.id=b.context_id
    where b.resource_type=${resourceType} and b.resource_id=${resourceId} and c.environment=${metaConfig().environment}
      and c.consent_granted and c.expires_at>now()`;
  return row ?? null;
}

export async function enqueueMetaEvent(sql: Db, input: {
  context: MetaContext; name: MetaEventName; sourceKey: string; data?: Record<string, unknown>;
  sourceUrl?: unknown; occurredAt?: Date | string; eventId?: string;
}) {
  const config = metaConfig();
  if (!config.enabled || input.context.environment !== config.environment || !input.context.consent_granted) return null;
  const id = input.eventId && uuidPattern.test(input.eventId) ? input.eventId : randomUUID();
  const data = metaCustomData(input.name, { ...input.context.attribution, ...input.data }, config.environment);
  if (input.name === "Purchase" && (typeof data.value !== "number" || typeof data.currency !== "string")) throw new Error("Verified purchase amount and currency are required");
  const sourceUrl = sanitiseMetaUrl(input.sourceUrl, config.environment) || sanitiseMetaUrl(`/${data.locale || "en"}/${input.name === "Purchase" ? "nutrition/payment/return" : "nutrition/healthscore"}`, config.environment);
  const [inserted] = await sql<{ id: string }[]>`insert into public.meta_conversion_events
    (id,environment,pixel_id,event_name,source_key,context_id,source_url,custom_data,occurred_at)
    values (${id}::uuid,${config.environment},${config.pixelId},${input.name},${input.sourceKey},${input.context.id}::uuid,
      ${sourceUrl},${sql.json(data)},${input.occurredAt ?? new Date()})
    on conflict(environment,pixel_id,event_name,source_key) do nothing returning id`;
  if (!inserted) return null;
  const { task } = await createTask({ actorType: "deterministic", taskType: "send_meta_event", title: `Send ${config.environment.toUpperCase()} campaign event`,
    payload: { eventId: id }, requiredCapabilities: [AGENT_CAPABILITIES.communicationDispatch], reasoningEffort: "none", businessValue: 20,
    idempotencyKey: `meta:${id}`, idempotencyScope: "successful", idempotencyScopeKey: `meta:${id}`,
    retryPolicy: { maxRetries: 8, initialDelaySeconds: 15, backoffMultiplier: 3, maxDelaySeconds: 3600 }
  }, sql);
  await sql`update public.meta_conversion_events set task_id=${task.id}::uuid where id=${id}::uuid`;
  return id;
}

export async function recordMetaPurchase(sql: Db, input: {
  type: "payment" | "retail" | "agentic"; id: string; sessionId: string | null; planId: string | null;
  amount: number; currency: string; locale?: string; mode: string; paidAt?: Date | string | null; email?: string | null;
}) {
  const config = metaConfig();
  if (!config.enabled || !input.paidAt || (config.environment === "prd" && input.mode !== "live")) return null;
  const context = await boundMetaContext(sql, input.type, input.id);
  if (!context) return null;
  const channel = await metaResourceChannel(sql, input.planId, input.type, input.id);
  const hash = hashEmailForFacebook(input.email);
  if (hash) await sql`update public.meta_tracking_contexts set matching=matching || ${sql.json({ em: [hash] })} where id=${context.id}::uuid and consent_granted`;
  return enqueueMetaEvent(sql, { context, name: "Purchase", sourceKey: `purchase:${input.sessionId || `${input.type}:${input.id}`}`,
    occurredAt: input.paidAt, data: { channel, planId: input.planId, value: input.amount, currency: input.currency.toUpperCase(), locale: input.locale || "en", stage: "confirmation" },
    sourceUrl: `/${input.locale || "en"}/${input.type === "payment" ? "nutrition/payment/return" : "basket/return"}` });
}

export async function recordMetaPlanMilestone(sql: Db, planId: string, name: "Lead" | "QuizSubmitted" | "EmailCapture", locale: string, sourceSuffix = "") {
  const context = await boundMetaContext(sql, "plan", planId);
  if (!context) return null;
  const channel = await metaResourceChannel(sql, planId, "plan", planId);
  return enqueueMetaEvent(sql, { context, name, sourceKey: `${name}:${planId}:${sourceSuffix}`, data: { channel, planId, locale, stage: name === "Lead" ? "results" : "assessment" } });
}

/** Derive server milestones from the business resource, never the last browser tab. */
export async function metaResourceChannel(sql: Db, planId: string | null, type: Resource, id: string): Promise<JourneyChannel> {
  if (type === "agentic") return "mcp";
  if (!planId && type !== "retail") return "web";
  const assessmentId = planId && uuidPattern.test(planId) ? planId : null;
  const paymentId = type === "retail" && uuidPattern.test(id) ? id : null;
  const [row] = await sql<{ channel: JourneyChannel }[]>`select case
    when exists(select 1 from public.assessments where plan_id=${assessmentId}::uuid and answers ? 'inStorePharmacy') then 'retail'
    when exists(select 1 from public.assessments where plan_id=${assessmentId}::uuid and (answers->>'channel'='mcp' or answers->>'source'='mcp')) then 'mcp'
    when ${type}='retail' and exists(select 1 from public.retail_checkout_payments where id=${paymentId}::uuid
      and (nullif(metadata->>'agenticOrderId','') is not null or metadata->>'channel' in ('mcp','agentic'))) then 'mcp'
    else 'web' end as channel`;
  return row.channel;
}

export const metaExternalId = (id: string) => createHash("sha256").update(id).digest("hex");
