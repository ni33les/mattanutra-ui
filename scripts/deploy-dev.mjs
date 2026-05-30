import { npmRun, run, runCapture } from "./dev-cycle-utils.mjs";

const serviceName = "mattanutra-ui-dev.service";
const smokeUrls = [
  "http://127.0.0.1:3000/en/admin/login",
  "https://dev.mattanutra.com/en/admin/login"
];

function allowNonDevBranch() {
  return (
    process.env.DEV_DEPLOY_ALLOW_NON_DEV === "1" ||
    process.argv.includes("--allow-non-dev")
  );
}

async function smokeCheck(url, attempts = 20) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual"
      });

      if (response.status >= 200 && response.status < 400) {
        console.log(`[deploy:dev] Smoke check passed: ${url} (${response.status})`);
        return;
      }

      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw lastError ?? new Error(`Smoke check failed: ${url}`);
}

async function main() {
  const branch = await runCapture("git", ["branch", "--show-current"]);

  if (branch !== "dev" && !allowNonDevBranch()) {
    throw new Error(
      `Refusing to deploy branch "${branch}". Use --allow-non-dev only for deliberate remote-box testing.`
    );
  }

  console.log(`[deploy:dev] Branch: ${branch}`);
  await npmRun("verify:dev");
  console.log(`[deploy:dev] Restarting ${serviceName}...`);
  await run("systemctl", ["restart", serviceName]);
  await run("systemctl", ["is-active", "--quiet", serviceName]);
  console.log(`[deploy:dev] ${serviceName} is active.`);
  console.log("[deploy:dev] Running smoke checks...");

  for (const url of smokeUrls) {
    await smokeCheck(url);
  }

  console.log("[deploy:dev] DEV deploy complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
