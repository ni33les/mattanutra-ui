import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";

const execFileAsync = promisify(execFile);

import type { AdminBrowserSession as AdminE2ESession } from "../helpers/admin-browser-fixture";

async function runAppScript<T>(
  script: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const database = new URL(env.TEST_DB_URL!);
  assert.equal(database.hostname, "127.0.0.1");
  assert.match(database.pathname, /^\/mattanutra_lock_review/);
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--import",
      "./scripts/register-ts-path-loader.mjs",
      "--import",
      "./test/helpers/offline-network.mjs",
      "-e",
      script
    ],
    {
      cwd: process.cwd(),
      env: { ...env, DB_URL: database.href, DB_WORKER_URL: database.href, STRIPE_PAYMENT_MODE: "mock" },
      maxBuffer: 1024 * 1024
    }
  );

  const result = stdout.split("\n").findLast(line => line.startsWith("E2E_RESULT:"));
  if (!result) throw new Error("Admin fixture did not return its result");
  return JSON.parse(result.slice("E2E_RESULT:".length)) as T;
}

async function createAdminSession() {
  return runAppScript<AdminE2ESession>(`
    import { createAdminBrowserSession } from "./test/helpers/admin-browser-fixture.ts";
    import { closeSqlPool } from "./lib/db.ts";
    try {
      const session = await createAdminBrowserSession(process.env.ADMIN_E2E_TARGET_ORGANISATION_ID);
      console.log("E2E_RESULT:" + JSON.stringify(session));
    } finally { await closeSqlPool(); }
  `);
}

async function cleanupAdminSession(session: AdminE2ESession | null) {
  if (!session) return;
  await runAppScript(`
    import { cleanupAdminBrowserSession } from "./test/helpers/admin-browser-fixture.ts";
    import { closeSqlPool } from "./lib/db.ts";
    try {
      await cleanupAdminBrowserSession(JSON.parse(process.env.E2E_SESSION_FIXTURE));
      console.log("E2E_RESULT:" + JSON.stringify({ cleaned: true }));
    } finally { await closeSqlPool(); }
  `, { ...process.env, E2E_SESSION_FIXTURE: JSON.stringify(session) });
}

test("platform admin can associate an existing agent with an organisation", async ({
  baseURL,
  context,
  page
}) => {
  const session = await createAdminSession();

  try {
    await context.addCookies([
      {
        name: "mn_admin_session",
        url: baseURL,
        value: session.sessionCookie
      },
      {
        name: "mn_admin_csrf",
        url: baseURL,
        value: session.csrfToken
      }
    ]);

    await page.goto("/en/admin/dashboard?view=memberships");

    const peoplePanel = page.locator("section", {
      has: page.getByRole("heading", { exact: true, name: "People" })
    });
    const agentsPanel = page.locator("section", {
      has: page.getByRole("heading", { exact: true, name: "Agents" })
    });

    await expect(peoplePanel.getByRole("button", { name: "Associate Person" })).toBeVisible();
    await expect(agentsPanel.getByRole("button", { name: "Associate Agent" })).toBeVisible();

    await agentsPanel.getByRole("button", { name: "Associate Agent" }).click();

    const dialog = page.locator('[role="dialog"]', {
      has: page.getByRole("heading", { exact: true, name: "Associate Agent" })
    });
    await expect(dialog.getByRole("heading", { name: "Associate Agent" })).toBeVisible();
    await expect(dialog.getByLabel("Agents")).toBeEnabled();
    await expect(dialog.getByLabel("Organisation")).toBeEnabled();
    await expect(dialog.getByLabel("Role")).toBeEnabled();
    await expect(dialog.getByLabel("Status")).toBeEnabled();

    await dialog.getByLabel("Organisation").selectOption({
      label: session.testOrganisationName
    });

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/access") &&
        response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Associate Agent" }).click();
    const response = await responsePromise;

    if (!response.ok()) {
      throw new Error(
        `Associate Agent request failed with ${response.status()}: ${await response.text()}`
      );
    }

    await expect(page.getByRole("heading", { name: "Associate Agent" })).toBeHidden();
    await expect(agentsPanel.getByText(session.testOrganisationName)).toBeVisible();
  } finally {
    await cleanupAdminSession(session);
  }
});
