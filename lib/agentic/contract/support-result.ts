export const SUPPORT_ORDER_CONTEXT_KEYS = [
  "fulfilmentStatus",
  "nextAction",
  "orderStatus",
  "paymentStatus",
  "stateVersion",
  "timeline"
] as const;

export const SUPPORT_THREAD_ITEM_KEYS = [
  "author",
  "body",
  "createdAt",
  "id",
  "sequence"
] as const;

export const SUPPORT_RESPONSE_CONTRACT = {
  orderContextKeys: SUPPORT_ORDER_CONTEXT_KEYS,
  required: ["ok", "supportHandle", "thread", "orderContext", "messageId"] as const,
  threadItemKeys: SUPPORT_THREAD_ITEM_KEYS
} as const;

const FORBIDDEN_CONTEXT = /address|checkoutToken|health|paymentSecret|supportBody/i;

export function supportRespectsContract(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.ok !== true) {
    return false;
  }

  for (const key of SUPPORT_RESPONSE_CONTRACT.required) {
    if (!Object.hasOwn(record, key)) {
      return false;
    }
  }

  if (typeof record.supportHandle !== "string" || record.supportHandle.length < 32) {
    return false;
  }

  if (!Array.isArray(record.thread)) {
    return false;
  }

  const thread = record.thread as Array<Record<string, unknown>>;
  for (let index = 1; index < thread.length; index += 1) {
    const previous = thread[index - 1]!;
    const current = thread[index]!;
    const prevSeq = Number(previous.sequence);
    const currSeq = Number(current.sequence);
    if (currSeq < prevSeq) {
      return false;
    }
    if (currSeq === prevSeq && String(current.id).localeCompare(String(previous.id)) < 0) {
      return false;
    }
  }

  const context = record.orderContext;
  if (context === null) {
    return true;
  }

  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return false;
  }

  const keys = Object.keys(context as object).sort();
  const allowed = [...SUPPORT_ORDER_CONTEXT_KEYS].sort();
  if (keys.join(",") !== allowed.join(",")) {
    return false;
  }

  return !FORBIDDEN_CONTEXT.test(JSON.stringify(context));
}
