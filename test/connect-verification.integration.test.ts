import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { after, before, describe, it } from "node:test";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { createConnectAttempt, getConnectAttempt, verifyConnectToken, flushConnectMeta } from "../lib/connect-verification.ts";
import { createConnectToken } from "../lib/connect-token.ts";
import { setMetaPreference } from "../lib/meta-tracking.ts";
import { sendMetaEvent } from "../lib/meta-dispatch.ts";
import { connectReport } from "../lib/connect-report.ts";
register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { POST: browserEvent } = await import("../app/api/marketing/events/route.ts");
const { POST: funnelEvent } = await import("../app/api/connect/events/route.ts");
const { POST: attemptPost } = await import("../app/api/connect/attempts/route.ts");
const { POST: bpmPost } = await import("../app/api/bpm/route.ts");
assert.ok(process.env.TEST_DB_URL, "Requires isolated PostgreSQL");

describe("server-confirmed MCP connections", () => {
  const ids: string[] = [], contexts: string[] = [], visitor = randomUUID();
  before(async () => {
    fixtureDatabaseUrl();
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, MATTANUTRA_ENV: "dev", CONNECT_SIGNING_SECRET: "isolated-connect-test-key", CONNECT_VERIFICATION_ENABLED: "true",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-real" });
    await getSql()!.unsafe(readFileSync(new URL("../scripts/connect-funnel-schema.sql", import.meta.url), "utf8"));
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async tx => {
      await tx`set local session_replication_role=replica`;
      const tasks = await tx`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      const taskIds = tasks.map(row => row.task_id).filter(Boolean);
      await cleanupFixtureRelationships(tx, { taskIds });
      await tx`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await tx`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await tx`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await tx`delete from public.connect_funnel_events where visitor_id=${visitor}::uuid or attempt_id=any(${ids}::uuid[])`;
      await tx`delete from public.connect_attempts where id=any(${ids}::uuid[])`;
      await tx`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
    });
    await closeSqlPool();
  });
  function request(cookie = "", body?: unknown) {
    return new Request("https://dev.mattanutra.com/api/connect/attempts", { method: body ? "POST" : "GET", headers: {
      origin: "https://dev.mattanutra.com", cookie, "content-type": "application/json", "user-agent": "Original visitor", "x-forwarded-for": "192.0.2.32"
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function attempt(marketing = true) {
    let cookie = "";
    if (marketing) {
      const context = await setMetaPreference(request(), true, "/en/connect/claude", "site_default");
      contexts.push(context.id); cookie = `mn_marketing=granted; mn_marketing_context=${context.id}`;
    }
    const result = await createConnectAttempt(request(cookie), { provider: "claude", locale: "en", visitorId: visitor,
      sourceUrl: "https://dev.mattanutra.com/en/connect/claude?campaign_id=123&connect_token=secret&prompt=private" });
    ids.push(result.attempt.id);
    return { ...result, token: new URL(result.attempt.connectionUrl).searchParams.get("connect_token")!, request: request(`${cookie}; mn_connect_owner_dev=${result.owner}`) };
  }
  it("restricts status to the owner, then records one confirmation under concurrent calls", async () => {
    const a = await attempt();
    assert.equal(await getConnectAttempt(request(), a.attempt.id), null);
    assert.equal(await getConnectAttempt(request("mn_connect_owner_dev=" + "x".repeat(43)), a.attempt.id), null);
    assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "pending");
    await Promise.all(Array.from({ length: 8 }, () => verifyConnectToken(a.token)));
    assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "verified");
    assert.equal((await getSql()!`select count(*)::int as n from public.connect_funnel_events where attempt_id=${a.attempt.id}::uuid`)[0].n, 1);
    const [event] = await getSql()!`select * from public.meta_conversion_events where source_key=${`connect:${a.attempt.id}`}`;
    assert.ok(event); assert.equal(event.event_name, "McpConnectionVerified");
    assert.doesNotMatch(JSON.stringify(event.custom_data), /secret|private|token|prompt|health|supplement/);
    const payloads: unknown[] = [];
    await sendMetaEvent(event.id, async (_url, init) => { payloads.push(JSON.parse(String(init?.body))); return new Response('{"events_received":1}'); });
    const payload = payloads[0] as { data: { event_name: string; user_data: Record<string, string> }[] };
    assert.equal(payload.data[0].event_name, "DEV_McpConnectionVerified");
    assert.equal(payload.data[0].user_data.client_user_agent, "Original visitor");
    const report = await connectReport(new Date(Date.now() - 60000));
    const row = report.rows.find(row => row.provider === "claude" && row.locale === "en");
    assert.ok(row && row.verified >= 1 && row.accepted >= 1);
  });
  it("preserves confirmation when Meta is disabled and recovers the same event later", async () => {
    const a = await attempt(); process.env.META_TRACKING_ENABLED = "false";
    try { await verifyConnectToken(a.token); assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "verified"); }
    finally { process.env.META_TRACKING_ENABLED = "true"; }
    await flushConnectMeta(a.attempt.id); await flushConnectMeta(a.attempt.id);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where source_key=${`connect:${a.attempt.id}`}`)[0].n, 1);
  });
  it("keeps the verified record if the advertising outbox write fails and retries without duplicates", async () => {
    const a = await attempt(), sql = getSql()!;
    const functionName = `connect_test_${a.attempt.id.replaceAll("-", "")}`;
    try {
      await sql.unsafe(`create function public.${functionName}() returns trigger language plpgsql as $$ begin
        if NEW.source_key='connect:${a.attempt.id}' then raise exception 'isolated advertising failure'; end if; return NEW; end $$`);
      await sql.unsafe(`create trigger ${functionName} before insert on public.meta_conversion_events for each row execute function public.${functionName}()`);
      await assert.rejects(verifyConnectToken(a.token), /isolated advertising failure/);
      assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "verified");
    } finally {
      await sql.unsafe(`drop trigger if exists ${functionName} on public.meta_conversion_events`);
      await sql.unsafe(`drop function if exists public.${functionName}()`);
    }
    await flushConnectMeta(a.attempt.id); await flushConnectMeta(a.attempt.id);
    assert.equal((await sql`select count(*)::int as n from public.meta_conversion_events where source_key=${`connect:${a.attempt.id}`}`)[0].n, 1);
  });
  it("does not send opted-out connections to Meta", async () => {
    const a = await attempt(false); await verifyConnectToken(a.token);
    assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "verified");
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where source_key=${`connect:${a.attempt.id}`}`)[0].n, 0);
  });
  it("rejects expired tokens and cross-environment confirmation without modifying the attempt", async () => {
    const a = await attempt(false);
    const expired = createConnectToken(a.attempt.id, "dev", new Date(Date.now() - 1000), process.env.CONNECT_SIGNING_SECRET!);
    assert.equal(await verifyConnectToken(expired), false);
    process.env.MATTANUTRA_ENV = "uat";
    try { assert.equal(await verifyConnectToken(a.token), false); assert.equal(await getConnectAttempt(a.request, a.attempt.id), null); }
    finally { process.env.MATTANUTRA_ENV = "dev"; }
    await getSql()!`update public.connect_attempts set expires_at=now()-interval '1 second' where id=${a.attempt.id}::uuid`;
    await verifyConnectToken(a.token);
    assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "expired");
  });
  it("can disable verification independently and retains the ordinary server URL", async () => {
    process.env.CONNECT_VERIFICATION_ENABLED = "false";
    try {
      const response = await attemptPost(request("", { provider: "claude", locale: "en", visitorId: visitor }));
      assert.equal(response.status, 503); assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal((await response.json()).connectionUrl, "https://dev.mattanutra.com/api/mcp");
    } finally { process.env.CONNECT_VERIFICATION_ENABLED = "true"; }
  });
  it("returns a usable fallback when the database is unavailable", async () => {
    const previous = process.env.DB_URL; delete process.env.DB_URL;
    try {
      const response = await attemptPost(request("", { provider: "claude", locale: "en" }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).connectionUrl, "https://dev.mattanutra.com/api/mcp");
    } finally { process.env.DB_URL = previous; }
  });
  it("refuses browser-forged verified milestones on every browser event endpoint", async () => {
    const response = await browserEvent(request("", { name: "McpConnectionVerified", eventId: randomUUID(), sessionId: visitor, sourceUrl: "/en/connect/claude" }));
    assert.equal(response.status, 400);
    const funnel = await funnelEvent(request("", { id: randomUUID(), visitorId: visitor, name: "verified", provider: "claude", locale: "en" }));
    assert.equal(funnel.status, 400);
    assert.equal((await bpmPost(request("", { eventName: "mcp_connection_verified" }))).status, 400);
  });
  it("records a landing-page URL copy without inventing a provider", async () => {
    const id = randomUUID();
    const response = await funnelEvent(request("", { id, visitorId: visitor, name: "url_copied", locale: "en", sourceUrl: "/en/connect" }));
    assert.equal(response.status, 200);
    const [row] = await getSql()!`select provider,event_name from public.connect_funnel_events where id=${id}::uuid`;
    assert.equal(row.provider, null); assert.equal(row.event_name, "url_copied");
    assert.equal((await funnelEvent(request("", { id: randomUUID(), visitorId: visitor, name: "provider_opened", locale: "en" }))).status, 400);
  });
  it("browser-chosen event IDs cannot reserve or suppress a server confirmation", async () => {
    const a = await attempt();
    assert.equal((await funnelEvent(request("", { id: a.attempt.id, visitorId: visitor, name: "url_copied", provider: "claude", locale: "en" }))).status, 200);
    const forgedId = await browserEvent(request(a.request.headers.get("cookie")!, { name: "PageView", eventId: a.attempt.id, sessionId: visitor, sourceUrl: "/en/connect/claude", data: { locale: "en", stage: "connect_guide" } }));
    assert.equal(forgedId.status, 200);
    await verifyConnectToken(a.token);
    assert.equal((await getConnectAttempt(a.request, a.attempt.id))?.status, "verified");
    const rows = await getSql()!`select id from public.meta_conversion_events where source_key=${`connect:${a.attempt.id}`}`;
    assert.equal(rows.length, 1); assert.notEqual(rows[0].id, a.attempt.id);
    assert.equal((await getSql()!`select count(*)::int as n from public.connect_funnel_events where attempt_id=${a.attempt.id}::uuid and event_name='verified'`)[0].n, 1);
  });
  it("rejects invalid provider and foreign origins; accepts the specified provider/locale-only shape", async () => {
    assert.equal((await attemptPost(request("", { provider: "unknown", locale: "en" }))).status, 400);
    assert.equal((await attemptPost(new Request("https://dev.mattanutra.com/api/connect/attempts", { method: "POST", headers: { origin: "https://example.com" }, body: '{"provider":"claude","locale":"en"}' }))).status, 403);
    const response = await attemptPost(request("", { provider: "grok", locale: "th" }));
    assert.equal(response.status, 201); const body = await response.json(); ids.push(body.id);
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/i); assert.match(response.headers.get("cache-control")!, /no-store/);
    const proxied = await attemptPost(new Request("http://localhost:3000/api/connect/attempts", { method: "POST", headers: { origin: "https://dev.mattanutra.com" }, body: '{"provider":"grok","locale":"th"}' }));
    assert.equal(proxied.status, 201); const proxyBody = await proxied.json(); ids.push(proxyBody.id);
    assert.match(proxied.headers.get("set-cookie")!, /Secure/); assert.equal(new URL(proxyBody.connectionUrl).origin, "https://dev.mattanutra.com");
  });
});
