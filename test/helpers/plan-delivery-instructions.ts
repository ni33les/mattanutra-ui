import assert from "node:assert/strict";

/** Shared discovery guarantees for the current call and any subsequent poll. */
export function assertPlanDeliveryInstructions(instructions: string) {
  assert.match(instructions, /Wait for the current tool call to finish\./);
  assert.match(instructions, /SSE plan calls wait up to 15 seconds for committed matching results\./);
  assert.match(instructions, /Poll only if its final result says processing, using planHandle and pollAfterSeconds\./);
  assert.match(instructions, /JSON-only calls return immediately\./);
  assert.match(instructions, /Retry a lost mutation response with the same key and input\./);
  assert.match(instructions, /Disconnecting does not cancel admitted work\./);
  assert.match(instructions, /Handle-only calls read existing work; no matching occurs in polls\./);
}
