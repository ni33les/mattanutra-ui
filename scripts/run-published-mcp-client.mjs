#!/usr/bin/env node
/** Public MCP client only. Payment settlement belongs to the external isolated harness. */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runConversationalJourney, publishedClientReceipt, resumePublishedOrder } from './published-client-journey.mjs';
import { publicMcpClientEndpoint } from './mcp-test-target.mjs';
import { normalizePublishedClientResult } from './published-client-semantics.mjs';
import { createPacedRequest } from './published-client-pacing.mjs';
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const endpoint = publicMcpClientEndpoint(arg('--url', 'http://127.0.0.1:3000/api/mcp'));
const output = resolve(arg('--output', '/tmp/mattanutra-published-client'));
const transcript = []; let id = 0, session;
const rpc = createPacedRequest(async (method, params) => {
  const request = { jsonrpc: '2.0', id: ++id, method, params };
  const start = performance.now();
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json',
    'X-MattaNutra-Result-Content': 'structured', ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  session = response.headers.get('mcp-session-id') ?? session;
  const body = await response.json(); transcript.push({ request, response: body, status: response.status, latencyMs: performance.now() - start });
  if (!response.ok || body.error) throw new Error(`HTTP ${response.status}; Retry-After: ${response.headers.get('retry-after') ?? 'unavailable'}; ${JSON.stringify(body)}`);
  return body.result;
});
await mkdir(output, { recursive: true, mode: 0o700 });
try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'documented-v11-client', version: '11.0.0' } });
  const locale = arg('--locale', 'en'), discovery = arg('--discovery', 'tools_only');
  const resume = arg('--resume', null);
  const result = resume
    ? await resumePublishedOrder({ endpoint: endpoint.href, locale, discovery, rpc, receipt: JSON.parse(await readFile(resolve(resume), 'utf8')) })
    : await runConversationalJourney({ rpc, locale, discovery, key: arg('--run-key', randomUUID()), checkout: args.includes('--checkout') });
  const receipt = resume ? result : args.includes('--checkout') ? publishedClientReceipt({ endpoint: endpoint.href, result }) : null;
  if (receipt) await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(output, 'semantic.json'), JSON.stringify(normalizePublishedClientResult({ receipt, result }, endpoint.href), null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: true, output, readyMs: result.readyMs, measurements: result.measurements }));
} finally { await writeFile(resolve(output, 'transcript.json'), JSON.stringify(transcript, null, 2), { flag: 'wx', mode: 0o600 }); }
