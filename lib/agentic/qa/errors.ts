export type QaErrorCategory = "validation" | "not_found" | "conflict" | "forbidden";

export type QaReasonCode =
  | "unexpected_property"
  | "unsupported_scenario"
  | "scenario_precondition_failed"
  | "idempotency_conflict"
  | "revision_conflict"
  | "not_found"
  | "run_in_progress"
  | "evidence_not_ready"
  | "environment_forbidden"
  | "role_forbidden"
  | "adapter_mismatch"
  | "required";

export type QaErrorResult = Readonly<{
  error: Readonly<{
    category: QaErrorCategory;
    fieldPath: string | null;
    message: string;
    reasonCode: QaReasonCode;
    retryable: boolean;
  }>;
  ok: false;
}>;

const CATEGORY: Record<QaReasonCode, QaErrorCategory> = {
  adapter_mismatch: "forbidden",
  environment_forbidden: "forbidden",
  evidence_not_ready: "conflict",
  idempotency_conflict: "conflict",
  not_found: "not_found",
  required: "validation",
  revision_conflict: "conflict",
  role_forbidden: "forbidden",
  run_in_progress: "conflict",
  scenario_precondition_failed: "validation",
  unexpected_property: "validation",
  unsupported_scenario: "validation"
};

export function qaError(input: Readonly<{
  fieldPath?: string | null;
  message: string;
  reasonCode: QaReasonCode;
}>): QaErrorResult {
  return {
    error: {
      category: CATEGORY[input.reasonCode],
      fieldPath: input.fieldPath ?? null,
      message: input.message,
      reasonCode: input.reasonCode,
      retryable: false
    },
    ok: false
  };
}

export function isQaErrorResult(value: unknown): value is QaErrorResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === false &&
      (value as { error?: { reasonCode?: unknown } }).error?.reasonCode
  );
}
