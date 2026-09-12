import assert from 'node:assert/strict';
/** Preserved admission state is a draft; request-level effort is applied by the durable executor. */
export function frozenMatchingInput(frozen) {
  assert.ok(frozen.state && frozen.request && frozen.snapshot, 'Missing frozen request, admission state or catalogue');
  const searchEffort = frozen.request.searchEffort ?? frozen.state.searchEffort;
  assert.ok(['standard', 'expanded'].includes(searchEffort), 'Invalid frozen search effort');
  return { ...frozen, state: { ...frozen.state, searchEffort } };
}
