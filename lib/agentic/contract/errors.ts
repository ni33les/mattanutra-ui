export const AGENTIC_ERROR_CATEGORIES = [
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "NOT_FOUND",
  "ABORTED",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE"
] as const;

export type AgenticErrorCategory = (typeof AGENTIC_ERROR_CATEGORIES)[number];

export const AGENTIC_REASON_CODES = [
  "positive_number_required",
  "duplicate_supplement",
  "unsupported_unit",
  "legacy_id",
  "unknown_supplement",
  "required",
  "unsupported_country",
  "unsupported_currency",
  "unexpected_property",
  "revision_conflict",
  "idempotency_conflict",
  "not_found",
  "plan_not_ready",
  "availability_changed",
  "checkout_expired",
  "rate_limited",
  "temporarily_unavailable",
  "consent_required",
  "stale_safety_acknowledgement",
  "stale_revision",
  "invalid_request",
  "unsafe_content"
] as const;

export type AgenticReasonCode = (typeof AGENTIC_REASON_CODES)[number];

export type AgenticBusinessError = Readonly<{
  category: AgenticErrorCategory;
  currentRevision?: number;
  error_code: AgenticErrorCategory | AgenticReasonCode;
  fieldPath: string | null;
  issues?: readonly Readonly<{ fieldPath: string; messageKey: string }>[];
  message: string;
  messageKey: string;
  nextActions?: readonly string[];
  reasonCode: AgenticReasonCode;
  retryable: boolean;
}>;

export type AgenticErrorResult = Readonly<{
  error: AgenticBusinessError;
  ok: false;
}>;

const CATEGORY_BY_REASON: Record<AgenticReasonCode, AgenticErrorCategory> = {
  availability_changed: "FAILED_PRECONDITION",
  checkout_expired: "FAILED_PRECONDITION",
  consent_required: "INVALID_ARGUMENT",
  duplicate_supplement: "INVALID_ARGUMENT",
  idempotency_conflict: "ABORTED",
  invalid_request: "INVALID_ARGUMENT",
  legacy_id: "INVALID_ARGUMENT",
  not_found: "NOT_FOUND",
  unknown_supplement: "INVALID_ARGUMENT",
  plan_not_ready: "FAILED_PRECONDITION",
  positive_number_required: "INVALID_ARGUMENT",
  rate_limited: "RESOURCE_EXHAUSTED",
  required: "INVALID_ARGUMENT",
  revision_conflict: "ABORTED",
  stale_revision: "ABORTED",
  stale_safety_acknowledgement: "ABORTED",
  temporarily_unavailable: "UNAVAILABLE",
  unexpected_property: "INVALID_ARGUMENT",
  unsafe_content: "INVALID_ARGUMENT",
  unsupported_country: "INVALID_ARGUMENT",
  unsupported_currency: "INVALID_ARGUMENT",
  unsupported_unit: "INVALID_ARGUMENT"
};

const RETRYABLE: ReadonlySet<AgenticReasonCode> = new Set([
  "rate_limited",
  "stale_revision",
  "temporarily_unavailable"
]);

export function businessError(input: Readonly<{
  currentRevision?: number;
  fieldPath?: string | null;
  issues?: readonly Readonly<{ fieldPath: string; messageKey: string }>[];
  message: string;
  messageKey?: string;
  nextActions?: readonly string[];
  reasonCode: AgenticReasonCode;
}>): AgenticErrorResult {
  const category = CATEGORY_BY_REASON[input.reasonCode];
  const messageKey = input.messageKey ?? `mcp.errors.${input.reasonCode}`;

  return {
    error: {
      category,
      error_code:
        input.reasonCode === "invalid_request" || input.reasonCode === "stale_revision"
          ? input.reasonCode
          : category,
      fieldPath: input.fieldPath ?? null,
      message: input.message,
      messageKey,
      reasonCode: input.reasonCode,
      retryable: RETRYABLE.has(input.reasonCode),
      ...(input.currentRevision != null ? { currentRevision: input.currentRevision } : {}),
      ...(input.issues ? { issues: input.issues } : {}),
      ...(input.nextActions ? { nextActions: input.nextActions } : {})
    },
    ok: false
  };
}

export function isAgenticErrorResult(value: unknown): value is AgenticErrorResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === false &&
      (value as { error?: { reasonCode?: unknown } }).error?.reasonCode
  );
}
