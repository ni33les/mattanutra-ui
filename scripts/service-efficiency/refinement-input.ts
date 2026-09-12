import assert from 'node:assert/strict';
/** Preserved admission state is a draft; request-level effort is applied by the durable executor. */
export function frozenMatchingInput<T extends { state: { searchEffort?: unknown }; request: { searchEffort?: unknown }; snapshot: unknown }>(frozen: T) {
  assert.ok(frozen.state && frozen.request && frozen.snapshot, 'Missing frozen request, admission state or catalogue');
  const searchEffort = frozen.request.searchEffort ?? frozen.state.searchEffort;
  assert.ok(searchEffort === 'standard' || searchEffort === 'expanded', 'Invalid frozen search effort');
  return { ...frozen, state: { ...frozen.state, searchEffort } };
}
