import QRCode from "qrcode";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { FunnelError } from "@/lib/funnel-errors";
import { pharmacyAssessment, readPharmacyOrder } from "@/lib/pharmacy-orders";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { siteBaseUrl } from "@/lib/site-url";
import { buildLineOfficialAccountMessageUrl } from "@/lib/chat-links";
import { createCustomerLineConnectToken, queueCustomerChatCommunicationDispatchTask } from "@/lib/communications-organisation";
import { ensureCommunicationSchema, ensurePlanIdentity, hashLineConnectCode, objectValue, upsertChannel } from "@/lib/communications-shared";
import { normalizeLineUserId } from "@/lib/communication-channel-utils";
import { toJsonValue } from "@/lib/assessment-store";
import { pharmacyLineGreeting } from "@/lib/pharmacy-line-copy";
import { writeBpmEvent } from "@/lib/bpm";

/** Called by an explicit POST; page reads never mint connection tokens. */
export async function preparePharmacyLineConnect(input: { planId: string; pharmacy: unknown; locale: unknown; orderId?: string }) {
  if (!isLocale(input.locale) || typeof input.pharmacy !== "string" || !input.pharmacy) {
    throw new FunnelError("Valid pharmacy and language are required", 400, "invalid_line_connection");
  }
  const { pharmacy } = await pharmacyAssessment(input.planId, input.pharmacy);
  if (input.orderId) await readPharmacyOrder(input.planId, input.pharmacy, input.orderId);
  const planUrl = siteBaseUrl() + pharmacyPath(input.locale, pharmacy.slug, "plan", { plan: input.planId, order: input.orderId });
  const token = await createCustomerLineConnectToken({ planId: input.planId, retailCustomerOrderId: input.orderId,
    source: "pharmacy_plan", planDelivery: { locale: input.locale, planUrl } });
  const command = `MN PLAN ${token.code}`;
  const lineUrl = buildLineOfficialAccountMessageUrl(command);
  // Generate locally once. The connection token never goes to a QR image service.
  const qrDataUrl = await QRCode.toDataURL(lineUrl, { width: 256, margin: 4, errorCorrectionLevel: "M" });
  return { code: token.code, command, expiresAt: token.expiresAt, lineUrl, qrDataUrl, retailCustomerOrderId: token.retailCustomerOrderId };
}

/** Private-chat proof, channel binding, delivery record and existing dispatch task commit together. */
export async function connectPharmacyLine(input: { code: string; recipientId: string; sourceType: "user" | "room" | "group"; providerEventId?: string }) {
  const sql = getSql();
  if (!sql) throw new Error("Database connection is not configured");
  const [token] = await sql`select id::text, plan_id::text, retail_customer_order_id::text, metadata
    from public.customer_line_connect_tokens where token_hash=${hashLineConnectCode(input.code.toUpperCase())}
      and metadata->>'source'='pharmacy_plan' limit 1`;
  if (!token) return { handled: false, connected: false };
  const recipient = normalizeLineUserId(input.recipientId);
  const delivery = objectValue(objectValue(token.metadata).planDelivery);
  if (input.sourceType !== "user" || !recipient?.startsWith("U") || !isLocale(delivery.locale) || typeof delivery.planUrl !== "string") {
    return { handled: true, connected: false };
  }
  const locale = delivery.locale;
  const body = pharmacyLineGreeting(locale, delivery.planUrl);
  await ensureCommunicationSchema(sql);
  let created = false;
  const result = await withDatabaseTransaction(sql, async tx => {
    const claimed = await tx`update public.customer_line_connect_tokens set status='consuming',updated_at=now()
      where id=${token.id}::uuid and status='active' and consumed_at is null and expires_at>now() returning id`;
    if (!claimed.length) {
      const [prior] = await tx`select id from public.customer_line_connect_tokens
        where id=${token.id}::uuid and status='consumed' and metadata->>'lineRecipientId'=${recipient}`;
      if (!prior) return { handled: true, connected: false };
      await queueCustomerChatCommunicationDispatchTask({ messageId: token.id, planId: token.plan_id, sql: tx });
      return { handled: true, connected: true, planId: token.plan_id, messageId: token.id };
    }
    const identityId = await ensurePlanIdentity(tx, token.plan_id);
    const channel = await upsertChannel(tx, { actorType: "human", address: recipient, channelType: "line", displayName: "LINE",
      identityId, preferenceRank: 10, status: "active", metadata: { lineRecipientId: recipient, sourceType: "user", planId: token.plan_id,
        retailCustomerOrderId: token.retail_customer_order_id, source: "pharmacy_plan" } });
    await tx`insert into public.communication_messages (id,identity_id,channel_id,plan_id,direction,message_type,status,subject,body,provider,metadata)
      values (${token.id}::uuid,${identityId}::uuid,${channel.id}::uuid,${token.plan_id}::uuid,'outbound','pharmacy_plan_welcome','queued',
        'Your MattaNutra plan',${body},'line',${tx.json(toJsonValue({locale,source:"pharmacy_plan",lineUserId:recipient}))})
      on conflict (id) do nothing`;
    await queueCustomerChatCommunicationDispatchTask({ messageId: token.id, planId: token.plan_id, sql: tx });
    await tx`update public.customer_line_connect_tokens set status='consumed',consumed_at=now(),consumed_by_channel_id=${channel.id}::uuid,
      updated_at=now(),metadata=metadata || ${tx.json(toJsonValue({lineRecipientId:recipient,providerEventId:input.providerEventId??null,sourceType:"user"}))}::jsonb
      where id=${token.id}::uuid`;
    created = true;
    return { handled: true, connected: true, planId: token.plan_id, messageId: token.id };
  });
  if (created) void writeBpmEvent({ actorType:"system",emittedBy:"line_webhook",eventName:"customer_line_channel_connected",
    eventStatus:"succeeded",eventType:"chat",planId:token.plan_id,locale,properties:{source:"pharmacy_plan",retailCustomerOrderId:token.retail_customer_order_id},severity:"low" }).catch(() => undefined);
  return result;
}
