import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { livePost } from './helpers/live-mcp.ts';

test('LIVE-LAT-TIMING-01 separates response headers from a deliberately pending response body', async () => {
  let release!: () => void, headers!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const opened = new Promise<void>(resolve => { headers = resolve; });
  const server = createServer(async (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.flushHeaders(); headers();
    await hold;
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const pending = livePost(`http://127.0.0.1:${address.port}/api/mcp`, {}, { accept: 'application/json' });
    await opened; await delay(30); release();
    const response = await pending;
    assert.equal(response.status, 200); assert.equal(response.structured.ok, true);
    assert.ok(Number.isFinite(response.preHeaderMs) && response.preHeaderMs >= 0);
    assert.ok(Number.isFinite(response.bodyMs) && response.bodyMs > 0);
    assert.equal(response.bodyMs, response.ms - response.preHeaderMs);
  } finally {
    release(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
