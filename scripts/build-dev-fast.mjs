import { npmRun, run } from "./dev-cycle-utils.mjs";

async function main() {
  await npmRun("typecheck");
  await run("next", ["build"], {
    env: {
      ...process.env,
      NEXT_BUILD_SKIP_TYPECHECK: "1"
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
