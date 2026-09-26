// Test-only preload. Observe the actual HTTP adapter's process-local subscription
// through IPC; this does not add an HTTP endpoint or execute matching.
import { observePlanOperation } from '../../lib/agentic/plan/completion-signals.ts';
process.on('message', message => {
  if (message?.type !== 'observe-completion') return;
  const stop = observePlanOperation(message.operationId,
    () => process.send?.({ type: 'completion-observed', operationId: message.operationId }),
    () => process.send?.({ type: 'completion-observer-closed', operationId: message.operationId }));
  if (!stop) throw new Error('No completion observer capacity in isolated HTTP probe');
  process.send?.({ type: 'completion-observer-ready', operationId: message.operationId });
});
