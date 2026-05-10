export type CommunicationChannelType =
  | "email"
  | "line"
  | "manual"
  | "sms"
  | "telegram"
  | "wechat"
  | "whatsapp";

export type CommunicationChannelStatus =
  | "active"
  | "disabled"
  | "failed"
  | "unverified";

export type CommunicationChannelCandidate = Readonly<{
  channelType: CommunicationChannelType;
  createdAt: string;
  preferenceRank: number;
  status: CommunicationChannelStatus;
}>;

const CHANNEL_TYPE_ORDER: readonly CommunicationChannelType[] = [
  "line",
  "whatsapp",
  "telegram",
  "wechat",
  "email",
  "sms",
  "manual"
];
const CHANNEL_TYPES = new Set<string>(CHANNEL_TYPE_ORDER);
const ACTIVE_CHANNEL_STATUSES = new Set<CommunicationChannelStatus>([
  "active"
]);

function channelTypeRank(type: CommunicationChannelType) {
  const index = CHANNEL_TYPE_ORDER.indexOf(type);

  return index === -1 ? CHANNEL_TYPE_ORDER.length : index;
}

export function normalizeCommunicationChannelType(
  value: unknown
): CommunicationChannelType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return CHANNEL_TYPES.has(normalized)
    ? (normalized as CommunicationChannelType)
    : null;
}

export function normalizeLineUserId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^[UCR][0-9a-f]{32}$/i.test(trimmed) ? trimmed : null;
}

export function selectBestCommunicationChannel<
  T extends CommunicationChannelCandidate
>(
  channels: ReadonlyArray<T>,
  preferredType?: CommunicationChannelType | null
) {
  const candidates = channels
    .filter((channel) => ACTIVE_CHANNEL_STATUSES.has(channel.status))
    .filter((channel) => !preferredType || channel.channelType === preferredType)
    .slice();

  candidates.sort((left, right) => {
    const leftPreference = left.preferenceRank || 100;
    const rightPreference = right.preferenceRank || 100;

    if (leftPreference !== rightPreference) {
      return leftPreference - rightPreference;
    }

    const typeDelta =
      channelTypeRank(left.channelType) - channelTypeRank(right.channelType);

    if (typeDelta !== 0) {
      return typeDelta;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });

  return candidates[0] ?? null;
}
