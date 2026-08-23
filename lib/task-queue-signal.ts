export type TaskQueueSignal = Readonly<{
  taskId?: string;
  taskType: string;
}>;

const globalTaskWakeup = globalThis as typeof globalThis & {
  mattanutraTaskQueuePending?: TaskQueueSignal[];
  mattanutraTaskWakeupWaiters?: Set<(signal: TaskQueueSignal) => void>;
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

  if (waiters.size === 0) {
    if (signal.taskType) {
      pendingTaskQueueSignals().push(signal);
    }

    return;
  }

  for (const waiter of waiters) {
    waiter(signal);
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
      }
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
      }
    };
    const timeout = setTimeout(() => complete(null), timeoutMs);

    waiters.add(onWakeup);
  });
}
