import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import * as shared from "../lib/communications-shared.ts";
import * as organisation from "../lib/communications-organisation.ts";
import * as smtp from "../lib/smtp-email.ts";
import * as bpm from "../lib/bpm.ts";
import * as tasks from "../lib/task-service.ts";

// Run the real routing and delivery functions with in-memory storage and mocked
// transports. No database, SMTP server or LINE recipient is contacted.
const pharmacyId = randomUUID(), platformId = randomUUID(), orderId = randomUUID(), paymentId = randomUUID();
const messages = new Map<string, shared.MessageRow>();
let orderRow: { order_number: string; status: string; source: string; metadata: Record<string, unknown> };
let paymentStatus: string, channels: shared.ChannelRow[], lineStatus: number;
const emails: Parameters<typeof smtp.sendTransactionalEmail>[0][] = [];
const pushes: { messages: Record<string, unknown>[] }[] = [];
const routedTasks: Parameters<typeof tasks.createTask>[0][] = [];
let documentRenders = 0;
const envBefore = process.env.MATTANUTRA_ENV;
const fetchBefore = globalThis.fetch;
const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.reduce((result, part, index) => result + (index ? `$${index}` : "") + part, "");
  if (/from public.retail_customer_orders/i.test(query)) return [{ ...orderRow }];
  if (/from public.retail_checkout_payments/i.test(query)) return [{ status: paymentStatus }];
  if (/from public.communication_channels/i.test(query)) {
    const enabledTypes = values.find(Array.isArray) as string[] | undefined;
    return enabledTypes ? channels.filter(channel => enabledTypes.includes(channel.channel_type)) : channels;
  }
  if (/insert into public.communication_messages/i.test(query)) {
    const match = query.match(/communication_messages\s*\(([^)]+)\)\s*values\s*\(([\s\S]+)\)\s*returning/i)!;
    const fields = match[1].split(",").map(field => field.trim());
    const entries = match[2].split(",").map(value => value.trim());
    assert.equal(fields.length, entries.length);
    const row: Record<string, unknown> = { plan_id: null, error_message: null, provider_message_id: null, sent_at: null, delivered_at: null };
    fields.forEach((field, index) => {
      const entry = entries[index], binding = entry.match(/^\$(\d+)/);
      row[field] = binding ? values[Number(binding[1]) - 1] : entry === "now()" ? new Date() : entry === "null" ? null : entry.replace(/^'|'$/g, "");
    });
    messages.set(String(row.id), row as shared.MessageRow);
    return [row];
  }
  if (/update public.communication_messages/i.test(query)) {
    const id = values.find(value => typeof value === "string" && messages.has(value)) as string;
    const row = messages.get(id)!;
    assert.ok(row);
    if (query.includes("status = 'queued'")) {
      row.status = "queued"; row.channel_id = String(values[1]); row.provider = String(values[2]);
    } else row.status = values[0] as shared.CommunicationMessageStatus;
    return [row];
  }
  if (/from public.communication_messages/i.test(query)) {
    const row = messages.get(String(values[0]));
    if (!row) return [];
    const channel = channels.find(channel => channel.id === row.channel_id);
    return [{ ...row, delivery_channel_type: channel?.channel_type, delivery_address: channel?.address, delivery_channel_metadata: {} }];
  }
  throw new Error(`Unexpected query: ${query}`);
}, { json: (value: unknown) => value });

mock.module("../lib/communications-shared.ts", { namedExports: { ...shared, sqlOrThrow: () => sql,
  ensureCommunicationSchema: async () => {}, configuredLineAccessToken: () => "mock-token",
  platformOrganisationId: async () => platformId,
  organisationCommunicationScope: async (_sql: unknown, id: string) => id === platformId ? "platform" : "retail"
} });
mock.module("../lib/communications-organisation.ts", { namedExports: { ...organisation,
  ensureOrganisationCommunicationIdentity: async ({ organisationId }: { organisationId: string }) => organisationId,
  listOrganisationNotificationPreferences: async () => shared.adminCommunicationEventKeys.flatMap(eventKey => ["email", "line"].map(channelType => ({ eventKey, channelType, enabled: true, preferenceRank: 1 }))),
  queueCommunicationMessageDispatchTask: async () => ({ created: true, task: { id: randomUUID(), taskType: "dispatch_email_communication" } })
} });
mock.module("../lib/smtp-email.ts", { namedExports: { ...smtp,
  sendTransactionalEmail: async (input: Parameters<typeof smtp.sendTransactionalEmail>[0]) => { emails.push(input); return { sent: true, configured: true, messageId: "mock-email", reason: null }; }
} });
mock.module("../lib/bpm.ts", { namedExports: { ...bpm, writeBpmEvent: async () => {} } });
mock.module("../lib/task-service.ts", { namedExports: { ...tasks,
  createTask: async (input: Parameters<typeof tasks.createTask>[0]) => { routedTasks.push(input); return { created: true, task: { id: randomUUID(), taskType: input.taskType } }; }
} });
mock.module("../lib/retail-plan-insert.tsx", { namedExports: {
  renderRetailPlanInsertPdfForOrder: async () => { documentRenders++; throw new Error("Alerts must not generate documents"); }
} });
const { routeAdminCommunication, queuePlatformAdminCommunication } = await import("../lib/communications.ts");
const { dispatchCommunicationMessage, retryCommunicationMessage } = await import("../lib/communications-dispatch.ts");

beforeEach(() => {
  process.env.MATTANUTRA_ENV = "uat";
  messages.clear(); emails.length = 0; pushes.length = 0; routedTasks.length = 0; documentRenders = 0; lineStatus = 200;
  orderRow = { order_number: "PH-B52BA237", status: "placed", source: "pharmacy", metadata: { paymentStatus: "unpaid" } };
  paymentStatus = "paid";
  channels = (["email", "line"] as const).map((channel_type, index) => ({
    id: randomUUID(), identity_id: pharmacyId, channel_type, actor_type: "human", status: "active",
    address: channel_type === "email" ? "pharmacy@example.invalid" : "U0123456789abcdef0123456789abcdef",
    display_name: null, metadata: {}, preference_rank: index + 1, created_at: new Date(), updated_at: new Date()
  }));
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.line.me/v2/bot/message/push");
    pushes.push(JSON.parse(String(init?.body)));
    return new Response(lineStatus === 200 ? "{}" : "Transport unavailable", { status: lineStatus });
  };
});
after(() => {
  globalThis.fetch = fetchBefore; mock.restoreAll();
  if (envBefore === undefined) delete process.env.MATTANUTRA_ENV; else process.env.MATTANUTRA_ENV = envBefore;
});

test("unpaid pharmacy orders retain accurate copy and the exact order link through email and LINE", async () => {
  const result = await routeAdminCommunication({ organisationId: pharmacyId, eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId,
    metadata: { source: "pharmacy", paymentStatus: "paid", planInsertOrderId: orderId }, subject: "New paid order" });
  assert.equal(result.messages.length, 2);
  for (const message of result.messages) {
    assert.equal(message.body, "[UAT] PH-B52BA237 created.");
    assert.ok(message.html?.includes(`order=${orderId}`));
    assert.equal((await dispatchCommunicationMessage(message.id)).message.status, "sent");
  }
  assert.equal(emails.length, 1); assert.equal(pushes.length, 1);
  assert.match(emails[0].html, />PH-B52BA237<\/a> created\./);
  assert.deepEqual(emails[0].attachments, []); assert.equal(documentRenders, 0);
  assert.equal(pushes[0].messages[0].type, "flex");
  assert.ok(JSON.stringify(pushes[0]).includes(`order=${orderId}`));
  assert.doesNotMatch(JSON.stringify(pushes[0]), /Status:|Reference:|Basket:|paid and created/);
  assert.equal((await dispatchCommunicationMessage(result.messages[0].id)).attempted, false);
});

test("MCP and web payments are distinguished using the recorded channel and payment state", async () => {
  for (const channel of ["mcp", "web"]) {
    orderRow = { ...orderRow, source: "checkout", status: "awaiting_stock", metadata: { channel, checkoutPaymentId: paymentId } };
    paymentStatus = "fulfilled";
    const result = await routeAdminCommunication({ organisationId: pharmacyId, eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId, metadata: { source: "retail_product_checkout" } });
    for (const message of result.messages) {
      assert.equal(message.body, "[UAT] PH-B52BA237 paid — on backorder.");
      assert.equal((message.metadata as { source: string }).source, channel);
    }
  }
});

test("no-channel notifications preserve the link for later email recovery", async () => {
  const available = channels; channels = [];
  const result = await routeAdminCommunication({ organisationId: pharmacyId, eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId });
  assert.equal(result.messages[0].status, "no_channel");
  channels = available;
  assert.equal((await retryCommunicationMessage(result.messages[0].id)).message.status, "sent");
  assert.match(emails[0].html, />PH-B52BA237<\/a> created\./);
});

test("platform messages route to the platform account and keep technical context out of the delivered body", async () => {
  const queued = await queuePlatformAdminCommunication({ eventKey: "platform_communication_failed", resourceType: "communication_message", resourceId: randomUUID(), metadata: { reason: "Private raw error", source: "communication_dispatch" } });
  assert.equal(queued.created, true);
  const payload = routedTasks[0].payload as Parameters<typeof routeAdminCommunication>[0];
  assert.equal(payload.organisationId, platformId);
  const result = await routeAdminCommunication(payload);
  for (const message of result.messages) {
    assert.equal(message.body, "[UAT] Notification delivery failed.");
    assert.equal((await dispatchCommunicationMessage(message.id)).message.status, "sent");
    assert.doesNotMatch(message.html!, /Private raw error|communication_dispatch/);
  }
  await assert.rejects(routeAdminCommunication({ organisationId: pharmacyId, eventKey: "platform_payment_failed" }), /does not belong/);
});

test("payment expiry retains email delivery but creates no LINE message or dispatch task", async () => {
  for (const environment of ["dev", "uat", "prd"]) {
    process.env.MATTANUTRA_ENV = environment;
    const result = await routeAdminCommunication({
      organisationId: platformId, eventKey: "platform_payment_failed", resourceType: "payment", resourceId: paymentId,
      metadata: { paymentStatus: "expired", sourceSurface: "web" }
    });
    assert.deepEqual(result.messages.map(message => message.provider), ["email"]);
    assert.equal(result.dispatchTasks.length, 1);
    assert.equal((await dispatchCommunicationMessage(result.messages[0].id)).message.status, "sent");
  }
  assert.equal(emails.length, 3);
  assert.equal(pushes.length, 0);
});

test("explicit LINE routing cannot override payment expiry suppression", async () => {
  const result = await routeAdminCommunication({
    organisationId: platformId, eventKey: "platform_payment_failed", channelType: "line",
    metadata: { paymentStatus: "expired" }
  });
  assert.equal(result.messages.length, 0);
  assert.equal(result.dispatchTasks.length, 0);
  assert.equal(emails.length, 0);
  assert.equal(pushes.length, 0);
});

test("genuine payment failures still send LINE alerts", async () => {
  const result = await routeAdminCommunication({
    organisationId: platformId, eventKey: "platform_payment_failed", channelType: "line",
    metadata: { paymentStatus: "failed" }
  });
  assert.equal(result.messages.length, 1);
  assert.equal((await dispatchCommunicationMessage(result.messages[0].id)).message.status, "sent");
  assert.equal(pushes.length, 1);
  assert.equal(result.messages[0].body, "[UAT] Payment failed.");
});

test("previously queued payment expiry alerts and retries are skipped without contacting LINE", async () => {
  channels = channels.filter(channel => channel.channel_type === "line");
  const result = await routeAdminCommunication({
    organisationId: platformId, eventKey: "platform_payment_failed", channelType: "line",
    metadata: { paymentStatus: "failed" }
  });
  // Reproduce an expiry alert stored before the new routing policy.
  const row = messages.get(result.messages[0].id)!;
  row.metadata = { ...(row.metadata as Record<string, unknown>), paymentStatus: "expired" };
  row.body = "[UAT] Payment expired.";
  const delivery = await dispatchCommunicationMessage(row.id);
  assert.equal(delivery.attempted, false);
  assert.equal(delivery.message.status, "skipped");
  assert.equal(delivery.message.sentAt, null);
  const retry = await retryCommunicationMessage(row.id);
  assert.equal(retry.attempted, false);
  assert.equal(retry.message.status, "skipped");
  assert.equal(pushes.length, 0);
  assert.equal(routedTasks.length, 0);
});

test("a failed LINE delivery can retry with the same linked status", async () => {
  channels = channels.filter(channel => channel.channel_type === "line");
  const result = await routeAdminCommunication({ organisationId: pharmacyId, eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId });
  lineStatus = 503;
  assert.equal((await dispatchCommunicationMessage(result.messages[0].id)).message.status, "failed");
  lineStatus = 200;
  assert.equal((await retryCommunicationMessage(result.messages[0].id)).message.status, "sent");
  assert.deepEqual(pushes[0], pushes[1]);
  assert.equal(pushes[1].messages[0].type, "flex");
});

test("customer LINE conversations retain their existing text format", async () => {
  channels = channels.filter(channel => channel.channel_type === "line");
  const result = await routeAdminCommunication({ organisationId: pharmacyId, eventKey: "retail_order_created", resourceType: "retail_customer_order", resourceId: orderId });
  const row = messages.get(result.messages[0].id)!;
  row.message_type = "pharmacy_plan_welcome"; row.body = "Your personal conversation.";
  await dispatchCommunicationMessage(row.id);
  assert.deepEqual(pushes[0].messages[0], { type: "text", text: row.body });
});
