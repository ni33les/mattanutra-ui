import assert from 'node:assert/strict';
import test from 'node:test';
import { toolList } from '../../lib/agentic/mcp/rpc.ts';
import { CLIENT_EXAMPLES, clientGuideMarkdown, CONTRACT_RESOURCES } from '../../lib/agentic/contract/guide.ts';
import { AGENTIC_INPUT_SCHEMAS } from '../../lib/agentic/contract/schemas.ts';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { agenticServerInstructions } from '../../lib/agentic/contract/instructions.ts';
import { AGENTIC_CONTRACT_VERSION } from '../../lib/agentic/config.ts';

test('SPLAN-SPEC-01/02 seven tools and the plan card teach flat conversation without private knowledge', () => {
  const tools = toolList('dev'); assert.equal(tools.length, 7); assert.ok(tools.some(row => row.name === 'evidence'));
  const plan = tools.find(row => row.name === 'plan')!;
  assert.deepEqual(plan.inputSchema, JSON.parse(JSON.stringify(AGENTIC_INPUT_SCHEMAS.plan)));
  for (const word of ['Thailand', 'selectedOptionId', 'scoring', 'idempotencyKey', 'expectedRevision']) assert.ok(plan.description.includes(word), word);
  assert.ok(!/responseView|requestPatch|plan\(create\)|planOperation/.test(plan.description));
});
test('SPLAN-SPEC-03 only the current contract is published and all examples validate', () => {
  assert.equal(AGENTIC_CONTRACT_VERSION, '10.0.0');
  assert.ok(CONTRACT_RESOURCES.length > 0);
  for (const resource of CONTRACT_RESOURCES) assert.ok(resource.uri.includes('/10.0.0/'), resource.uri);
  assert.ok(CLIENT_EXAMPLES.length >= 5);
  for (const example of CLIENT_EXAMPLES) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS[example.tool], example.arguments), [], example.name);
});
test('SPLAN-SPEC-02 instructions and guides describe the same bounded weight/reset protocol', () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    const instructions = agenticServerInstructions('dev', locale), guide = clientGuideMarkdown(locale, 'dev');
    assert.ok(instructions.includes('scoring')); assert.ok(guide.includes('scoring')); assert.ok(guide.includes('selectedOptionId'));
    assert.ok(!/responseView|requestPatch|planOperation|flexible\/normal\/strong/.test(instructions + guide));
    assert.ok(/0.*1.*2/s.test(guide));
  }
});
test('IMP-12 generated, native and tools-only descriptions teach pure importance and explicit soft avoidance in every locale', () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    const text = agenticServerInstructions('dev', locale) + clientGuideMarkdown(locale, 'dev');
    assert.doesNotMatch(text, /0 softly minimises|Below one blends|zero.*stronger minimisation/);
    assert.match(text, /zero removes that ranking component/);
    assert.match(text, /target amount of zero/);
    assert.match(text, /0\.543/);
    if (locale === 'th') assert.match(text, /น้ำหนัก/);
    if (locale === 'zh-CN') assert.match(text, /权重/);
  }
});
