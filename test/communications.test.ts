import assert from "node:assert/strict";
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
    assert.equal(normalizeLineUserId("@mattanutra"), null);
    assert.equal(normalizeLineUserId("richard"), null);
  });
});
