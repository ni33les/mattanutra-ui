import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel,
  type CommunicationChannelCandidate
} from "../lib/communication-channel-utils.ts";
import { formatOutboundLineMessage } from "../lib/line-message-format.ts";

type TestChannel = CommunicationChannelCandidate & { id: string };

const baseChannel = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "channel",
  preferenceRank: 100,
  status: "active",
} satisfies Omit<TestChannel, "channelType">;

function channel(
  channelType: CommunicationChannelCandidate["channelType"],
  input: Partial<TestChannel> = {}
): TestChannel {
  return {
    ...baseChannel,
    ...input,
    channelType,
    id: input.id ?? channelType
  };
}

describe("communications channel selection", () => {
  it("normalizes known channel names", () => {
    assert.equal(normalizeCommunicationChannelType(" WhatsApp "), "whatsapp");
    assert.equal(normalizeCommunicationChannelType("unknown-chat"), null);
  });

  it("uses chat before email when no preference has been expressed", () => {
    const selected = selectBestCommunicationChannel([
      channel("email"),
      channel("telegram"),
      channel("line")
    ]);

    assert.equal(selected?.channelType, "line");
  });

  it("honours explicit preference rank before the default channel order", () => {
    const selected = selectBestCommunicationChannel([
      channel("line", { preferenceRank: 100 }),
      channel("email", { preferenceRank: 1 })
    ]);

    assert.equal(selected?.channelType, "email");
  });

  it("ignores disabled or failed channels", () => {
    const selected = selectBestCommunicationChannel([
      channel("line", { status: "failed" }),
      channel("whatsapp", { status: "disabled" }),
      channel("email")
    ]);

    assert.equal(selected?.channelType, "email");
  });

  it("accepts LINE user ids and rejects handles for push delivery", () => {
    assert.equal(
      normalizeLineUserId("U0123456789abcdef0123456789abcdef"),
      "U0123456789abcdef0123456789abcdef"
    );
    assert.equal(
      normalizeLineUserId("C0123456789abcdef0123456789abcdef"),
      "C0123456789abcdef0123456789abcdef"
    );
    assert.equal(
      normalizeLineUserId("R0123456789abcdef0123456789abcdef"),
      "R0123456789abcdef0123456789abcdef"
    );
    assert.equal(normalizeLineUserId("@mattanutra"), null);
    assert.equal(normalizeLineUserId("richard"), null);
  });

  it("stamps outbound LINE messages with the actual non-production environment", () => {
    const originalEnvironment = process.env.MATTANUTRA_ENV;

    try {
      process.env.MATTANUTRA_ENV = "uat";
      assert.equal(formatOutboundLineMessage("Order ready"), "UAT\n\nOrder ready");
      assert.equal(formatOutboundLineMessage("DEV\n\nOrder ready"), "UAT\n\nOrder ready");

      process.env.MATTANUTRA_ENV = "dev";
      assert.equal(formatOutboundLineMessage("Order ready"), "DEV\n\nOrder ready");

      process.env.MATTANUTRA_ENV = "prd";
      assert.equal(formatOutboundLineMessage("Order ready"), "Order ready");
    } finally {
      if (originalEnvironment === undefined) {
        delete process.env.MATTANUTRA_ENV;
      } else {
        process.env.MATTANUTRA_ENV = originalEnvironment;
      }
    }
  });

  it("defines organisation admin communication schema and task routing", async () => {
    const [
      schema,
      service,
      workItems,
      execution,
      agents,
      runner,
      workerProfiles,
      webhook,
      view
    ] = await Promise.all([
      readFile("db-schema.sql", "utf8"),
      readFile("lib/communications.ts", "utf8"),
      readFile("lib/task-work-items.ts", "utf8"),
      readFile("lib/task-execution.ts", "utf8"),
      readFile("lib/system-agents.ts", "utf8"),
      readFile("workers/runner.ts", "utf8"),
      readFile("lib/worker-agent-credentials.ts", "utf8"),
      readFile("app/api/line/webhook/route.ts", "utf8"),
      readFile("components/admin/communications-view.tsx", "utf8")
    ]);
    const adminQueryData = await readFile("lib/admin-query-data.ts", "utf8");
    const adminQueryRoute = await readFile("app/api/admin/query/[view]/route.ts", "utf8");
    const organisationApi = await readFile(
      "app/api/admin/communications/organisation/route.ts",
      "utf8"
    );
    const lineConnectApi = await readFile(
      "app/api/admin/communications/line-connect/route.ts",
      "utf8"
    );
    const testApi = await readFile(
      "app/api/admin/communications/test/route.ts",
      "utf8"
    );
    const adminSettings = await readFile("lib/admin-communications.ts", "utf8");
    const lineFormat = await readFile("lib/line-message-format.ts", "utf8");

    assert.match(schema, /CREATE TABLE public\.organisation_communication_identities/);
    assert.match(schema, /CREATE TABLE public\.organisation_notification_preferences/);
    assert.match(schema, /CREATE TABLE public\.line_connect_tokens/);
    assert.match(schema, /CREATE TABLE public\.customer_line_connect_tokens/);
    assert.match(schema, /platform_revenue_received/);
    assert.match(schema, /platform_checkout_failed/);
    assert.match(schema, /platform_carrier_integration_failed/);
    assert.match(schema, /platform_retailer_payout_due/);
    assert.match(schema, /platform_retailer_settlement_needs_review/);
    assert.match(schema, /retail_settlement_payout_paid/);
    assert.match(schema, /retail_settlement_needs_review/);
    assert.match(schema, /retail_order_pickup_booked/);
    assert.match(schema, /retail_order_shipment_exception/);
    assert.match(schema, /platform_worker_unavailable/);
    assert.match(service, /ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY = 300/);
    assert.match(service, /ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY = 260/);
    assert.match(service, /retailAdminCommunicationEventKeys/);
    assert.match(service, /platformAdminCommunicationEventKeys/);
    assert.match(service, /adminCommunicationEventKeysForScope/);
    assert.match(service, /organisationIdentityRelationship/);
    assert.match(service, /relationship = \$\{relationship\}/);
    assert.match(service, /platform_communication_failed/);
    assert.match(service, /platform_carrier_integration_failed/);
    assert.match(service, /platform_retailer_payout_due/);
    assert.match(service, /retail_order_pickup_booked/);
    assert.match(service, /retail_order_shipment_exception/);
    assert.match(service, /retail_settlement_payout_paid/);
    assert.match(service, /row\.message_type !== "platform_communication_failed"/);
    assert.match(service, /queuePlatformAdminCommunication/);
    assert.match(service, /createCustomerLineConnectToken/);
    assert.match(service, /consumeCustomerLineConnectCode/);
    assert.match(service, /customer_line_channel_connected/);
    assert.match(service, /queueCustomerChatCommunicationDispatchTask/);
    assert.match(service, /taskType: "route_admin_communication"/);
    assert.match(service, /adminCommunicationDispatchTaskType/);
    assert.match(service, /"dispatch_email_communication_message"/);
    assert.match(service, /"dispatch_chat_communication_message"/);
    assert.match(service, /targetOrganisationId: input\.organisationId/);
    assert.match(service, /configured organisation channels/);
    assert.doesNotMatch(service, /configured retailer channels/);
    assert.match(workItems, /buildAdminCommunicationRouteWorkItem/);
    assert.match(workItems, /payloadText\(payload, "targetOrganisationId"\)/);
    assert.match(workItems, /buildCommunicationDispatchWorkItem/);
    assert.match(execution, /executeAdminCommunicationRouteTask/);
    assert.match(execution, /executeCommunicationDispatchTask/);
    assert.match(agents, /route_admin_communication: "communicationsCoordinator"/);
    assert.match(agents, /customer_chat_reply: "panya"/);
    assert.match(agents, /name: "Panya"/);
    assert.match(agents, /dispatch_email_communication_message: "emailDispatcher"/);
    assert.match(agents, /dispatch_chat_communication_message: "chatDispatcher"/);
    assert.match(runner, /runtimeWorkerProfileForMode\(mode\)/);
    assert.match(workerProfiles, /"chat", "chatDispatcher"[\s\S]*"dispatch_chat_communication_message"/);
    assert.match(workerProfiles, /"panya", "panya"[\s\S]*"customer_chat_reply"/);
    assert.match(workerProfiles, /"route_admin_communication"/);
    assert.match(webhook, /x-line-signature/i);
    assert.match(webhook, /timingSafeEqual/);
    assert.match(webhook, /MN\\s\+CONNECT/);
    assert.match(webhook, /MN\\s\+PLAN/);
    assert.match(webhook, /enqueuePanyaCustomerChatReplyTask/);
    assert.match(webhook, /https:\/\/api\.line\.me\/v2\/bot\/message\/reply/);
    assert.match(webhook, /replySent/);
    assert.match(webhook, /formatOutboundLineMessage/);
    assert.match(service, /commandExecution: "disabled_v1"/);
    assert.match(service, /contactName/);
    assert.match(service, /deleteDisabledOrganisationCommunicationChannel/);
    assert.match(service, /Only disabled communication channels can be deleted/);
    assert.match(service, /const broadcastChannels =/);
    assert.match(service, /Organisation notifications are broadcasts/);
    assert.match(service, /for \(const channel of broadcastChannels\)/);
    assert.match(service, /broadcastChannelCount: broadcastChannels\.length/);
    assert.match(service, /broadcastChannelIds: broadcastChannels\.map/);
    assert.match(service, /idempotencyKey: `admin-communication-dispatch:\$\{input\.messageId\}`/);
    assert.match(service, /formatOutboundLineMessage\(row\.body\)/);
    assert.match(view, /Retail communication channels/);
    assert.match(view, /Platform communication channels/);
    assert.match(view, /Platform notification preferences/);
    assert.doesNotMatch(view, /settings\.organisations\.length > 1/);
    assert.match(view, /Add channel/);
    assert.match(view, /Add communication channel/);
    assert.match(view, /WhatsApp/);
    assert.match(view, /Coming soon/);
    assert.match(view, /action: "delete_channel"/);
    assert.match(view, /Contact name/);
    assert.match(view, /Create LINE connect code/);
    assert.match(view, /https:\/\/line\.me\/R\/ti\/p\/@344enooi/);
    assert.match(view, /MattaNutra LINE QR code/);
    assert.match(lineFormat, /environment\.toUpperCase\(\)/);
    assert.match(lineFormat, /\^\(DEV\|UAT\)\\n\\n/);
    assert.match(lineFormat, /MATTANUTRA_ENV/);
    assert.match(adminSettings, /context\.effectiveOrganisation\.id/);
    assert.match(adminSettings, /adminCommunicationEventKeysForScope\(scope\)/);
    assert.doesNotMatch(adminSettings, /where organisation_type = 'tenant'[\s\S]*order by lower\(name\)/);
    assert.match(adminSettings, /if \(!context\)/);
    assert.match(adminSettings, /return \{\s*\.\.\.emptyCommunicationsData\(\)/);
    assert.match(adminQueryData, /getAdminCommunicationsData\(params\.range, context\)/);
    assert.match(adminQueryRoute, /resolveAdminSession/);
    assert.match(adminQueryRoute, /getAdminExternalQueryData\([\s\S]*context/);
    assert.match(organisationApi, /canAccessEffectiveOrganisation/);
    assert.match(organisationApi, /requestedOrganisationId === context\.effectiveOrganisation\.id/);
    assert.match(organisationApi, /adminCommunicationEventScope\(nextEventKey\)/);
    assert.match(lineConnectApi, /requestedOrganisationId === context\.effectiveOrganisation\.id/);
    assert.match(testApi, /requestedOrganisationId === context\.effectiveOrganisation\.id/);
  });
});
