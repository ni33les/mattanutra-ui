import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { AGENTIC_TOOL_SCHEMAS, AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from '../../lib/agentic/contract/index.ts';
import { AGENT_CARD } from '../../lib/agentic/contract/agent-card.ts';
import { CLIENT_EXAMPLES, clientGuideMarkdown } from '../../lib/agentic/contract/guide.ts';
import { toolList } from '../../lib/agentic/mcp/rpc.ts';
import { create, install, cleanup, runtime, plan } from '../mcp-evidence-images/helpers.ts';
beforeEach(install); afterEach(cleanup);
const retiredId = /(?:optionId|recommendedOptionId|selectedOptionId)/i;

test('NOID-01 every public schema and discovery surface removes redundant option identifiers', () => {
  for (const value of [AGENTIC_TOOL_SCHEMAS, AGENTIC_OUTPUT_SCHEMAS, toolList(), AGENT_CARD, CLIENT_EXAMPLES,
    ...['en','th','zh-CN'].map(clientGuideMarkdown)]) assert.doesNotMatch(JSON.stringify(value), retiredId);
  const confirm = { planHandle: 'cap_returned_plan_handle_000000001', expectedRevision: 1, idempotencyKey: 'confirm-current-recommendation' };
  assert.deepEqual(validateToolIssues(AGENTIC_TOOL_SCHEMAS.plan, confirm), []);
  assert.ok(validateToolIssues(AGENTIC_TOOL_SCHEMAS.plan, { ...confirm, selectedOptionId: 'opt_retired' }).some(issue => issue.reasonCode === 'unexpected_property'));
});

test('NOID-02 a handle/revision confirms the single returned routine without another match; replay precedes stale revision', async t => {
  const app = runtime();
  const created = await plan(app, create()); assert.equal(created.status, 'ready');
  assert.equal(created.nextAction, 'confirm_with_user'); assert.equal(created.choices.length, 1);
  assert.doesNotMatch(JSON.stringify(created), retiredId);
  const admissions = t.mock.method(app.store, 'insertPlanOperation', async () => { throw Error('Confirmation must not schedule matching'); });
  const confirm = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: 'noid-confirm-current' };
  const confirmed = await plan(app, confirm); assert.equal(confirmed.revision, created.revision + 1); assert.equal(confirmed.nextAction, 'execute');
  assert.deepEqual(confirmed.choices[0].products, created.choices[0].products);
  assert.deepEqual(confirmed.choices[0].ingredients, created.choices[0].ingredients);
  assert.deepEqual(await plan(app, confirm), confirmed);
  const stale = await plan(app, { ...confirm, idempotencyKey: 'noid-stale-confirm' });
  assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, 'stale_revision');
  assert.deepEqual(await plan(app, { planHandle: created.planHandle }), confirmed);
  assert.equal(admissions.mock.callCount(), 0);
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, confirmed), []);
});
