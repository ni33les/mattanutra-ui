export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { keepDatabaseWarm } = await import("./lib/db");
  await keepDatabaseWarm();
}
