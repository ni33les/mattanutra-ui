export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { keepDatabaseWarm } = await import("./lib/db");
  await keepDatabaseWarm();
  void import("./lib/task-sweep-loop")
    .then((mod) => {
      mod.startTaskMaintenanceLoop();
    })
    .catch((error) => {
      console.warn(
        "Unable to start task maintenance loop",
        error instanceof Error ? error.message : error
      );
    });
  void import("./lib/task-wakeup")
    .then((mod) => mod.subscribeTaskQueue())
    .catch((error) => {
      console.warn(
        "Unable to LISTEN for task queue notifies",
        error instanceof Error ? error.message : error
      );
    });
}
