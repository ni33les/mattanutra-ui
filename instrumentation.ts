export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
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

  try {
    const { resolveAgenticEnvironment } = await import("./lib/agentic/config");
    const { warmAgenticCatalogue } = await import("./lib/agentic/catalogue/warm");
    const { keepPlanPathWarm } = await import("./lib/agentic/plan/warm-dev");
    const environment = resolveAgenticEnvironment();
    await warmAgenticCatalogue(environment);
    void keepPlanPathWarm(environment);
  } catch (error) {
    console.warn("Unable to warm agentic catalogue", error);
  }
}
