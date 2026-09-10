import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentedRun } from '../test/simple-plan/documented-harness.ts';
import { normalizePublishedClientResult, CLIENT_NORMALIZATION } from './published-client-semantics.mjs';
const output = process.argv[2]; assert.ok(output?.startsWith('/'));
const locales = ['en', 'th', 'zh-CN'], runs = [];
for (const run of ['a', 'b']) {
  const results = [];
  for (const locale of locales) results.push(await documentedRun(locale, locale === 'en' ? 'schema_only' : locale === 'th' ? 'tools_only' : 'resources', locale === 'en'));
  writeFileSync(resolve(output, `documented-${run}.json`), JSON.stringify(results, null, 2), { flag: 'wx' });
  const semantic = normalizePublishedClientResult(results.map(result => ({ locale: result.locale, discovery: result.discovery,
    observations: result.observations.filter((row: {tool: string}) => row.tool !== 'info'), terminal: result.terminal })), 'http://localhost');
  runs.push({ run, semantic });
}
assert.deepEqual(runs[0].semantic, runs[1].semantic, 'Business results must be identical across independent state');
writeFileSync(resolve(output, 'documented-paired.json'), JSON.stringify({ passed: true, locales, normalization: CLIENT_NORMALIZATION, runs }, null, 2), { flag: 'wx' });
