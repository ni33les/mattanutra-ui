import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MCP_PACKAGES, packageStages } from '../../scripts/mcp-721-proof.mjs';

test('SPLAN-REL-01 historical scoped entry points remain available; current CI runs the maintained MCP inventory', () => {
  const definition = MCP_PACKAGES['simple-plan']; assert.equal(definition?.version, '10.0.0');
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.match(scripts['test:mcp:simple-plan'], /mcp-721.mjs test --package=simple-plan/);
  assert.match(scripts['validate:dev:mcp:simple-plan'], /mcp-721.mjs validate --package=simple-plan/);
  const stages = packageStages('simple-plan');
  assert.ok(stages.includes('documented-journeys-paired')); assert.ok(stages.includes('no-new-locks'));
  assert.ok(!stages.includes('complete-mcp-regression'));
  assert.match(readFileSync('.github/workflows/mcp-722.yml', 'utf8'), /test:matcher:twice/);
});
