import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTIC_CONTRACT_VERSION } from '../../lib/agentic/config.ts';
import { READY_DECISION_SCHEMA, DECISION_INGREDIENT_SCHEMA } from '../../lib/agentic/contract/decision-schema.ts';
import { OVERVIEW_CARD } from '../../lib/agentic/contract/agent-card.ts';
test('AVAIL-SPEC-01 contract publishes compact operational status and per-item issues',()=>{
  assert.equal(AGENTIC_CONTRACT_VERSION,'11.1.0');
  assert.deepEqual(DECISION_INGREDIENT_SCHEMA.properties.availability.enum,['supplied','not_selected','unavailable','not_on_list','not_allowed','unknown']);
  assert.ok(READY_DECISION_SCHEMA.properties.requestIssues);
  assert.match(OVERVIEW_CARD,/requestIssues/); assert.match(OVERVIEW_CARD,/not_on_list/);
  assert.match(OVERVIEW_CARD,/execute directly/);assert.doesNotMatch(OVERVIEW_CARD,/Tools:.*evidence/);
});
