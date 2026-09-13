import assert from 'node:assert/strict';
import postgres from 'postgres';
import { parseTaskQueuePayload } from '../../lib/task-wakeup.ts';
import { observePlanOperation, signalPlanObserverReconnect } from '../../lib/agentic/plan/completion-signals.ts';
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.notEqual(url.port, '5432');
assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = postgres(url.href, { max: 1, prepare: false });
let subscription, close;
async function listen() {
  subscription = await sql.listen('mattanutra_tasks', payload => {
    const work = parseTaskQueuePayload(payload);
    if (work) process.send({ type: 'work', work });
  }, signalPlanObserverReconnect);
}
process.on('message', async message => {
  if (message.type === 'observe') {
    close?.(); close = observePlanOperation(message.id, () => process.send({ type: 'changed', id: message.id }));
    assert.ok(close); process.send({ type: 'observing' });
  } else if (message.type === 'reconnect') {
    await subscription.unlisten(); await listen(); process.send({ type: 'reconnected' });
  } else if (message.type === 'stop') {
    close?.(); await subscription.unlisten(); await sql.end(); process.exit(0);
  }
});
await listen(); process.send({ type: 'ready' });
