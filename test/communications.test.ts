import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel,
  type CommunicationChannelCandidate
} from "../lib/communication-channel-utils.ts";

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

  it("defines organisation admin communication schema and task routing", async () => {
    const [
      schema,
      service,
      workItems,
      execution,
      agents,
      runner,
      webhook,
      view
    ] = await Promise.all([
      readFile("db-schema.sql", "utf8"),
      readFile("lib/communications.ts", "utf8"),
      readFile("lib/task-work-items.ts", "utf8"),
      readFile("lib/task-execution.ts", "utf8"),
      readFile("lib/system-agents.ts", "utf8"),
      readFile("workers/runner.ts", "utf8"),
      readFile("app/api/line/webhook/route.ts", "utf8"),
      readFile("components/admin/communications-view.tsx", "utf8")
    ]);
    const lineFormat = await readFile("lib/line-message-format.ts", "utf8");

    assert.match(schema, /CREATE TABLE public\.organisation_communication_identities/);
    assert.match(schema, /CREATE TABLE public\.organisation_notification_preferences/);
    assert.match(schema, /CREATE TABLE public\.line_connect_tokens/);
    assert.match(service, /ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY = 300/);
    assert.match(service, /ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY = 260/);
    assert.match(service, /taskType: "route_admin_communication"/);
    assert.match(service, /adminCommunicationDispatchTaskType/);
    assert.match(service, /"dispatch_email_communication_message"/);
    assert.match(service, /"dispatch_chat_communication_message"/);
    assert.match(service, /targetOrganisationId: input\.organisationId/);
    assert.match(workItems, /buildAdminCommunicationRouteWorkItem/);
    assert.match(workItems, /payloadText\(payload, "targetOrganisationId"\)/);
    assert.match(workItems, /buildCommunicationDispatchWorkItem/);
    assert.match(execution, /executeAdminCommunicationRouteTask/);
    assert.match(execution, /executeCommunicationDispatchTask/);
    assert.match(agents, /route_admin_communication: "communicationsCoordinator"/);
    assert.match(agents, /dispatch_email_communication_message: "emailDispatcher"/);
    assert.match(agents, /dispatch_chat_communication_message: "chatDispatcher"/);
    assert.match(runner, /chat: agentProfile\("chatDispatcher"/);
    assert.match(runner, /"route_admin_communication"/);
    assert.match(webhook, /x-line-signature/i);
    assert.match(webhook, /timingSafeEqual/);
    assert.match(webhook, /MN\\s\+CONNECT/);
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
    assert.match(view, /Connect with/);
    assert.match(view, /action: "delete_channel"/);
    assert.match(view, /Contact name/);
    assert.match(view, /Create LINE connect code/);
    assert.match(view, /https:\/\/line\.me\/R\/ti\/p\/@344enooi/);
    assert.match(view, /MattaNutra LINE QR code/);
    assert.match(lineFormat, /DEV\\n\\n/);
    assert.match(lineFormat, /MATTANUTRA_ENV/);
  });
});
