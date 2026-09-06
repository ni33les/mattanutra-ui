/** Runs at most one request at a time, with a delay after settlement and bounded
 * backoff after errors. Stop prevents rescheduling an in-flight operation. */
export function createPeriodicTask(work: () => Promise<unknown>, intervalMs: number, options: {backoff?: boolean} = {}) {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;

  const schedule = () => {
    if (stopped) return;
    const delay = intervalMs * (options.backoff === false ? 1 : Math.min(4, 2 ** failures));
    timer = setTimeout(() => { void run().catch(() => undefined); }, delay * (0.9 + Math.random() * 0.2));
    timer.unref?.();
  };
  const run = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    clearTimeout(timer);
    pending = Promise.resolve().then(work).then(
      () => { failures = 0; },
      error => { failures = Math.min(2, failures + 1); throw error; }
    ).finally(() => {
      pending = undefined;
      schedule();
    });
    return pending;
  };
  schedule();
  return {
    run,
    stop() { stopped = true; clearTimeout(timer); }
  };
}
