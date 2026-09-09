export type TaskQueueSignal = Readonly<{
  taskId?: string;
  taskType: string;
}>;

const globalTaskWakeup = globalThis as typeof globalThis & {
  mattanutraTaskQueuePending?: TaskQueueSignal[];
  mattanutraTaskWakeupWaiters?: Set<(signal: TaskQueueSignal) => boolean>;
};

function taskWakeupWaiters() {
  globalTaskWakeup.mattanutraTaskWakeupWaiters ??= new Set();

  return globalTaskWakeup.mattanutraTaskWakeupWaiters;
}

function pendingTaskQueueSignals() {
  globalTaskWakeup.mattanutraTaskQueuePending ??= [];

  return globalTaskWakeup.mattanutraTaskQueuePending;
}

export function signalTaskQueue(signal: TaskQueueSignal) {
  const waiters = taskWakeupWaiters();
  for (const waiter of waiters) {
    if (waiter(signal)) return;
  }
  if (signal.taskType) {
    const pending = pendingTaskQueueSignals();
    const index = pending.findIndex(item => item.taskType === signal.taskType);
    if (index < 0) pending.push(signal);
    else if (pending[index].taskId !== signal.taskId) pending[index] = { taskType: signal.taskType };
    // Signals are hints; durable rows remain authoritative. Coalescing multiple
    // IDs requests a normal queue drain. Overflow recovers through periodic reads.
    if (pending.length > 256) pending.shift();
  }
}

export function waitForTaskQueueChange(
  timeoutMs: number,
  taskTypes?: readonly string[]
) {
  if (timeoutMs <= 0) {
    return Promise.resolve(false);
  }

  const accepted = new Set(
    (taskTypes ?? []).filter((taskType) => taskType.trim().length > 0)
  );

  const pending = pendingTaskQueueSignals();
  const index = pending.findIndex(signal => accepted.size === 0 || accepted.has(signal.taskType));
  if (index >= 0) { pending.splice(index, 1); return Promise.resolve(true); }

  return new Promise<boolean>((resolve) => {
    const waiters = taskWakeupWaiters();
    const complete = (changed: boolean) => {
      clearTimeout(timeout);
      waiters.delete(onWakeup);
      resolve(changed);
    };
    const onWakeup = (signal: TaskQueueSignal) => {
      if (
        accepted.size === 0 ||
        !signal.taskType ||
        accepted.has(signal.taskType)
      ) {
        complete(true);
        return true;
      }
      return false;
    };
    const timeout = setTimeout(() => complete(false), timeoutMs);

    waiters.add(onWakeup);
  });
}

export function waitForTaskQueueWork(
  timeoutMs: number,
  taskTypes: readonly string[]
) {
  const accepted = new Set(
    taskTypes.filter((taskType) => taskType.trim().length > 0)
  );
  const pending = pendingTaskQueueSignals();
  const pendingIndex = pending.findIndex((signal) =>
    Boolean(signal.taskType && accepted.has(signal.taskType))
  );

  if (pendingIndex >= 0) {
    const [signal] = pending.splice(pendingIndex, 1);

    return Promise.resolve(signal ?? null);
  }

  return new Promise<TaskQueueSignal | null>((resolve) => {
    const waiters = taskWakeupWaiters();
    const complete = (signal: TaskQueueSignal | null) => {
      clearTimeout(timeout);
      waiters.delete(onWakeup);
      resolve(signal);
    };
    const onWakeup = (signal: TaskQueueSignal) => {
      if (signal.taskType && accepted.has(signal.taskType)) {
        complete(signal);
        return true;
      }
      return false;
    };
    const timeout = setTimeout(() => complete(null), timeoutMs);

    waiters.add(onWakeup);
  });
}
