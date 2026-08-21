export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { keepDatabaseWarm } = await import("./lib/db");
  await keepDatabaseWarm();

  try {
    const { resolveAgenticEnvironment } = await import("./lib/agentic/config");
    const { warmAgenticCatalogue } = await import("./lib/agentic/catalogue/warm");
    await warmAgenticCatalogue(resolveAgenticEnvironment());
  } catch (error) {
    console.warn("Unable to warm agentic catalogue", error);
  }
}
