import sourceCatalog from "@/content/i18n/source/en.json" with { type: "json" };

export type SourceMessageCatalog = typeof sourceCatalog;
export type MessageId = keyof SourceMessageCatalog;
export type MessageDescriptor = SourceMessageCatalog[MessageId];
export type MessageNamespace = MessageDescriptor["namespace"];
export type MessageAudience = MessageDescriptor["audience"];
export type MessageSurface = MessageDescriptor["surface"];

export type MessageValue = string | number | bigint | boolean | Date | null | undefined;
export type MessageValues = Readonly<Record<string, MessageValue>>;

export const sourceMessageCatalog = sourceCatalog;
export const messageIds = Object.keys(sourceCatalog).sort() as MessageId[];
