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
  "unreferenced_claim",
  "unexpected_property",
  "wrong_purpose",
  "revision_conflict",
  "idempotency_conflict",
  "not_found",
  "open_query",
  "plan_not_ready",
  "availability_changed",
  "checkout_expired",
  "rate_limited",
  "temporarily_unavailable",
  "SERVICE_DEADLINE_EXCEEDED",
  "consent_required",
  "stale_safety_acknowledgement",
  "stale_revision",
  "invalid_request",
  "request_too_broad",
  "too_short",
  "unsafe_content"
] as const;

export type AgenticReasonCode = (typeof AGENTIC_REASON_CODES)[number];

export type AgenticBusinessError = Readonly<{
  category: AgenticErrorCategory;
  correlationId?: string;
  currentRevision?: number;
  errorCode: AgenticErrorCategory | AgenticReasonCode;
  error_code: AgenticErrorCategory | AgenticReasonCode;
  fieldPath: string | null;
  issues?: readonly Readonly<{
    fieldPath: string;
    messageKey: string;
    reasonCode: string;
  }>[];
  message: string;
  messageKey: string;
  nextAction?: string;
  nextActions?: readonly string[];
  reasonCode: AgenticReasonCode;
  requestedRevision?: number;
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
  open_query: "INVALID_ARGUMENT",
  unknown_supplement: "INVALID_ARGUMENT",
  plan_not_ready: "FAILED_PRECONDITION",
  positive_number_required: "INVALID_ARGUMENT",
  rate_limited: "RESOURCE_EXHAUSTED",
  request_too_broad: "INVALID_ARGUMENT",
  required: "INVALID_ARGUMENT",
  revision_conflict: "ABORTED",
  stale_revision: "ABORTED",
  SERVICE_DEADLINE_EXCEEDED: "UNAVAILABLE",
  stale_safety_acknowledgement: "ABORTED",
  temporarily_unavailable: "UNAVAILABLE",
  too_short: "INVALID_ARGUMENT",
  unexpected_property: "INVALID_ARGUMENT",
  unsafe_content: "INVALID_ARGUMENT",
  unsupported_country: "INVALID_ARGUMENT",
  unsupported_currency: "INVALID_ARGUMENT",
  unsupported_unit: "INVALID_ARGUMENT",
  unreferenced_claim: "INVALID_ARGUMENT",
  wrong_purpose: "INVALID_ARGUMENT"
};

const RETRYABLE: ReadonlySet<AgenticReasonCode> = new Set([
  "SERVICE_DEADLINE_EXCEEDED",
  "rate_limited",
  "revision_conflict",
  "stale_revision",
  "temporarily_unavailable"
]);

export function businessError(input: Readonly<{
  correlationId?: string;
  currentRevision?: number;
  fieldPath?: string | null;
  issues?: readonly Readonly<{
    fieldPath: string;
    messageKey: string;
    reasonCode: string;
  }>[];
  message: string;
  messageKey?: string;
  nextAction?: string;
  nextActions?: readonly string[];
  reasonCode: AgenticReasonCode;
  requestedRevision?: number;
  retryable?: boolean;
}>): AgenticErrorResult {
  const category = CATEGORY_BY_REASON[input.reasonCode];
  const messageKey = input.messageKey ?? `mcp.errors.${input.reasonCode}`;
  const errorCode =
    input.reasonCode === "invalid_request" || input.reasonCode === "stale_revision"
      ? input.reasonCode
      : category;
  const issues = input.issues
    ? [...input.issues].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))
    : undefined;

  return {
    error: {
      category,
      errorCode,
      error_code: errorCode,
      fieldPath: input.fieldPath ?? null,
      message: input.message,
      messageKey,
      reasonCode: input.reasonCode,
      retryable: input.retryable ?? RETRYABLE.has(input.reasonCode),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.currentRevision != null ? { currentRevision: input.currentRevision } : {}),
      ...(input.requestedRevision != null ? { requestedRevision: input.requestedRevision } : {}),
      ...(issues ? { issues } : {}),
      ...(input.nextAction ? { nextAction: input.nextAction } : {}),
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
