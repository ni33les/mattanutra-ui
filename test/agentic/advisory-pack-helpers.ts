import assert from "node:assert/strict";

/** Legacy health acknowledgements are no longer offered answers. Rejection must
 * preserve the saved plan and its advice rather than simulating a safety waiver. */
export async function rejectObsoleteHealthAnswer(
  harness: { call: (name: string, args: unknown) => Promise<Record<string, unknown>> },
  args: Record<string, unknown>
) {
  const before = await harness.call("plan", { operation: "get", planHandle: args.planHandle });
  const rejected = await harness.call("plan", args);
  assert.equal(rejected.ok, false);
  assert.equal((rejected.error as Record<string, unknown>)?.reasonCode, "invalid_request");
  const after = await harness.call("plan", { operation: "get", planHandle: args.planHandle });
  for (const key of ["revision", "status", "optionId", "planHandle", "safetyGuidance", "medicationCodes", "conditionCodes"]) {
    assert.deepEqual(after[key], before[key], `Rejected health answer mutated ${key}`);
  }
  assert.equal(after.acknowledgementStatus, "not_required");
  return after;
}

// V4 includes concise advice and full facts for each reviewable option. Retain
// fixed ceilings while allowing those intentionally added public contract fields.
export const ADVISORY_SINGLE_RESPONSE_BYTES = 16_384;
export const ADVISORY_MULTI_RESPONSE_BYTES = 32_768;
