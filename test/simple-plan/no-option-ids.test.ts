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
    ...['en','th','zh-CN'].map(locale => clientGuideMarkdown(locale, 'dev'))]) assert.doesNotMatch(JSON.stringify(value), retiredId);
  const confirm = { planHandle: 'cap_returned_plan_handle_000000001', expectedRevision: 1, idempotencyKey: 'confirm-current-recommendation' };
  assert.ok(validateToolIssues(AGENTIC_TOOL_SCHEMAS.plan, confirm).length);
  assert.ok(validateToolIssues(AGENTIC_TOOL_SCHEMAS.plan, { ...confirm, selectedOptionId: 'opt_retired' }).some(issue => issue.reasonCode === 'unexpected_property'));
});

test('NOID-02 direct checkout preserves the recommendation and replays after a later refinement', async () => {
  const app = runtime(), created = await plan(app, create());
  assert.equal(created.status, 'ready'); assert.equal(created.nextAction, 'execute');
  assert.doesNotMatch(JSON.stringify(created), retiredId);
  const args = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: 'noid-direct-checkout' };
  const opened = (await rpc(app, 'execute', args))!.result!.structuredContent as {ok:boolean;frozenPlan:unknown};
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const refined = await plan(app, { ...args, idempotencyKey: 'noid-next-refinement', scoring: { weights: { pills: 2 } } });
  assert.equal(refined.revision, created.revision + 1);
  assert.deepEqual((await rpc(app, 'execute', args))!.result!.structuredContent, opened);
  const stale = (await rpc(app, 'execute', { ...args, idempotencyKey: 'noid-stale-checkout' }))!.result!.structuredContent as {ok:boolean;error:{reasonCode:string}};
  assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, 'revision_conflict');
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, refined), []);
});

test('NOID-03 generated cards, downloadable schemas and hosted projections publish the exact current protocol', () => {
  const listing = JSON.parse(readFileSync('contract/mcp/11.1.0/tools.json','utf8'));
  const schema = JSON.parse(readFileSync('contract/mcp/11.1.0/schema.json','utf8'));
  const wellKnown = JSON.parse(readFileSync('public/.well-known/mcp.json','utf8'));
  assert.deepEqual(listing.tools, toolList('dev'));
  assert.deepEqual(schema.planSchema, JSON.parse(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)));
  assert.deepEqual(wellKnown.tools, listing.tools);
  assert.equal(readFileSync('contract/mcp/11.1.0/README.md','utf8'), clientGuideMarkdown('en','dev'));
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
    assert.match(guide, /call execute directly/);
  }
});

test('NOID-05 checkout accepts the current recommendation without an extra confirmation', async () => {
  const app = runtime(), created = await plan(app, create());
  const reply = await rpc(app, 'execute', { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: 'noid-before-confirmation' });
  const body = reply!.result!.structuredContent as {ok:boolean;paymentStatus:string};
  assert.equal(body.ok,true,JSON.stringify(body)); assert.equal(body.paymentStatus,'unpaid');
});

test('NOID-06 checkout-ready copy does not assert prior confirmation in any locale', async () => {
  const summaries: Record<string,string> = { en: 'Your recommended routine is ready. Proceed to checkout or adjust the weights.', th: 'ชุดที่แนะนำพร้อมแล้ว ไปชำระเงินหรือปรับน้ำหนักความสำคัญได้', 'zh-CN': '推荐组合已准备好，可以结账或调整权重。' };
  for (const locale of ['en','th','zh-CN']) {
    const app = runtime(), created = await plan(app, { ...create(), locale, idempotencyKey: `noid-ready-copy-create-${locale}` });
    assert.equal(created.nextAction, 'execute'); assert.equal(created.revision, 1);
    const fit: Record<string, string> = { en: 'Known contributions meet 1/1 requested amounts (Vitamin D3).', th: 'ปริมาณที่ทราบถึงเป้าหมาย 1/1 รายการ (Vitamin D3)', 'zh-CN': '已知贡献达到 1/1 项请求量（Vitamin D3）。' };
    assert.equal(created.summary, `${summaries[locale]} ${fit[locale]}`);
  }
});

test('NOID-07 execute discovery distinguishes a new checkout from replaying a lost response', () => {
  const description = toolList().find(row => row.name === 'execute')!.description;
  assert.match(description, /new checkout idempotencyKey/);
  assert.match(description, /Retry.*same key and input/);
  assert.match(description, /returned.*revision/);
});

test('NOID-08 checkout template uses the current revision without a confirmation template', () => {
  assert.equal(CLIENT_EXAMPLES.some(row => row.name === 'confirm-recommendation'), false);
  const checkout = CLIENT_EXAMPLES.find(row => row.name === 'create-checkout')!.arguments;
  assert.equal(checkout.expectedRevision, 1);
  assert.ok(checkout.idempotencyKey.length >= 16);
});

test('NOID-09 removed confirmation calls create no queued work in every locale', async () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    const app = runtime();
    const created = await plan(app, { ...create(), locale, idempotencyKey: `noid-no-confirm-create-${locale}` });
    const args = { planHandle: created.planHandle, expectedRevision: created.revision, idempotencyKey: `noid-no-confirm-${locale}` };
    const result = (await rpc(app, 'plan', args))!.result!.structuredContent as {ok:boolean};
    assert.equal(result.ok, false);
    const owner = `${app.scope.environment}:${app.scope.tenantScope}:${app.scope.principalScope ?? 'anon'}`;
    assert.equal(await app.store.getPlanOperationByKey(owner, args.idempotencyKey), null);
    assert.deepEqual(await plan(app, { planHandle: created.planHandle }), created);
  }
});
