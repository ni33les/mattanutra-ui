import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { AGENTIC_TOOL_SCHEMAS, AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from '../../lib/agentic/contract/index.ts';
import { AGENT_CARD } from '../../lib/agentic/contract/agent-card.ts';
import { CLIENT_EXAMPLES, clientGuideMarkdown } from '../../lib/agentic/contract/guide.ts';
import { toolList } from '../../lib/agentic/mcp/rpc.ts';
import { create, install, cleanup, runtime, plan, rpc } from '../mcp-evidence-images/helpers.ts';
beforeEach(install); afterEach(cleanup);
const retiredId = /(?:optionId|candidateKey)/i;

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
  const checkpoints: unknown[] = [];
  const update = app.store.updatePlanOperation.bind(app.store);
  t.mock.method(app.store, 'updatePlanOperation', async (...args: Parameters<typeof update>) => { checkpoints.push(args[0].checkpoint); return update(...args); });
  const confirm = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: 'noid-confirm-current' };
  const confirmed = await plan(app, confirm); assert.equal(confirmed.revision, created.revision + 1); assert.equal(confirmed.nextAction, 'execute');
  assert.deepEqual(confirmed.choices[0].products, created.choices[0].products);
  assert.deepEqual(confirmed.choices[0].ingredients, created.choices[0].ingredients);
  assert.deepEqual(await plan(app, confirm), confirmed);
  const stale = (await rpc(app, 'plan', { ...confirm, idempotencyKey: 'noid-stale-confirm' }))!.result!.structuredContent as { ok: boolean; error: { reasonCode: string } };
  assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, 'stale_revision');
  assert.deepEqual(await plan(app, { planHandle: created.planHandle }), confirmed);
  assert.ok(checkpoints.length > 0);
  assert.ok(checkpoints.every(value => !value || !((value as { search?: unknown }).search)), "Confirmation must not run search or create a search checkpoint");
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, confirmed), []);
});

test('NOID-03 generated cards, downloadable schemas and hosted projections publish the exact current protocol', () => {
  const listing = JSON.parse(readFileSync('contract/mcp/11.0.0/tools.json','utf8'));
  const schema = JSON.parse(readFileSync('contract/mcp/11.0.0/schema.json','utf8'));
  const wellKnown = JSON.parse(readFileSync('public/.well-known/mcp.json','utf8'));
  assert.deepEqual(listing.tools, toolList('dev'));
  assert.deepEqual(schema.planSchema, JSON.parse(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)));
  assert.deepEqual(wellKnown.tools, listing.tools);
  assert.equal(readFileSync('contract/mcp/11.0.0/README.md','utf8'), clientGuideMarkdown('en','dev'));
  for (const provider of ['openai','anthropic','xai']) {
    const adapter = JSON.parse(readFileSync(`lib/agentic/adapters/${provider}.json`,'utf8'));
    assert.equal(adapter.contractVersion, listing.contractVersion);
    assert.equal(adapter.schemaChecksum, listing.schemaChecksum);
    assert.deepEqual(adapter.tools, listing.tools.map((row: {name:string})=>row.name));
    assert.doesNotMatch(JSON.stringify(adapter), retiredId);
  }
});
test('NOID-04 public descriptions do not promise retired response ledgers or evidence access', () => {
  const text = JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan);
  assert.doesNotMatch(text, /response exposes the 30- and 90-day ledgers/);
  for (const locale of ['en','th','zh-CN']) {
    const guide = clientGuideMarkdown(locale,'dev');
    assert.doesNotMatch(guide, /call evidence|evidence tool|selectedCandidateKey|selectedOptionId/i);
    assert.match(guide, /scoring.weights.price/);
    assert.match(guide, /send only planHandle, expectedRevision and a new idempotencyKey to plan/);
  }
});
