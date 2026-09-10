#!/usr/bin/env node
/** Public MCP client only. Payment settlement belongs to the external isolated harness. */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runConversationalJourney } from './published-client-journey.mjs';
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const endpoint = new URL(arg('--url', 'http://127.0.0.1:3000/api/mcp'));
if (!['localhost', '127.0.0.1', 'dev.mattanutra.com'].includes(endpoint.hostname)) throw new Error('This work package permits DEV and isolated localhost only.');
const output = resolve(arg('--output', '/tmp/mattanutra-published-client'));
const transcript = []; let id = 0, session;
const rpc = async (method, params) => {
  const request = { jsonrpc: '2.0', id: ++id, method, params };
  const start = performance.now();
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json',
    'X-MattaNutra-Result-Content': 'structured', ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  session = response.headers.get('mcp-session-id') ?? session;
  const body = await response.json(); transcript.push({ request, response: body, status: response.status, latencyMs: performance.now() - start });
  if (!response.ok || body.error) throw new Error(JSON.stringify(body));
  return body.result;
};
await mkdir(output, { recursive: true, mode: 0o700 });
try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'documented-v9-client', version: '9.0.0' } });
  const result = await runConversationalJourney({ rpc, locale: arg('--locale', 'en'), discovery: arg('--discovery', 'tools_only'), key: arg('--run-key', randomUUID()), checkout: args.includes('--checkout') });
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: true, output, readyMs: result.readyMs, measurements: result.measurements }));
} finally { await writeFile(resolve(output, 'transcript.json'), JSON.stringify(transcript, null, 2), { flag: 'wx', mode: 0o600 }); }
