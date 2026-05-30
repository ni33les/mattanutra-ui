import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

type AdminE2ESession = Readonly<{
  csrfToken: string;
  organisationId: string;
  sessionCookie: string;
  sessionId: string;
  testOrganisationId: string;
  testOrganisationName: string;
}>;

async function runAppScript<T>(
  script: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "--experimental-strip-types",
      "--input-type=module",
      "--import",
      "./scripts/register-ts-path-loader.mjs",
      "-e",
      script
    ],
    {
      cwd: process.cwd(),
      env,
      maxBuffer: 1024 * 1024
    }
  );

  return JSON.parse(stdout.trim()) as T;
}

async function createAdminSession() {
  return runAppScript<AdminE2ESession>(`
    import { randomUUID } from "node:crypto";
    import { createAdminSession } from "./lib/admin-access.ts";
    import { getSql, closeSqlPool } from "./lib/db.ts";

    const sql = getSql();
    if (!sql) throw new Error("Database is not configured");

    try {
      const ownerRows = await sql\`
        select m.person_id::text as person_id, m.organisation_id::text as organisation_id
        from public.organisation_memberships m
        join public.people p on p.id = m.person_id
        join public.organisations o on o.id = m.organisation_id
        where m.role = 'platform_owner'
          and m.status = 'active'
          and p.status = 'active'
          and o.status = 'active'
        order by m.created_at asc
        limit 1
      \`;
      const owner = ownerRows[0];
      if (!owner) throw new Error("No active platform owner membership found");

      const suffix = randomUUID().slice(0, 8);
      const orgName = \`E2E Associate Agent \${suffix}\`;
      const orgRows = await sql\`
        insert into public.organisations (
          slug,
          name,
          organisation_type,
          status,
          default_locale,
          metadata
        )
        values (
          \${\`e2e-associate-agent-\${suffix}\`},
          \${orgName},
          'tenant',
          'active',
          'en',
          '{"source":"admin-associate-agent-e2e"}'::jsonb
        )
        returning id::text
      \`;
      const testOrganisationId = orgRows[0]?.id;
      if (!testOrganisationId) throw new Error("Unable to create test organisation");

      const session = await createAdminSession({
        organisationId: owner.organisation_id,
        personId: owner.person_id
      });

      console.log(JSON.stringify({
        csrfToken: session.csrfToken,
        organisationId: owner.organisation_id,
        sessionCookie: session.sessionCookie,
        sessionId: session.context.sessionId,
        testOrganisationId,
        testOrganisationName: orgName
      }));
    } finally {
      await closeSqlPool();
    }
  `);
}

async function cleanupAdminSession(session: AdminE2ESession | null) {
  if (!session) {
    return;
  }

  await runAppScript(
    `
      import { getSql, closeSqlPool } from "./lib/db.ts";

      const sql = getSql();
      if (!sql) throw new Error("Database is not configured");

      try {
        await sql\`
          update public.admin_sessions
          set revoked_at = coalesce(revoked_at, now())
          where id = \${process.env.E2E_SESSION_ID}::uuid
        \`;
        await sql\`
          delete from public.organisation_memberships
          where organisation_id = \${process.env.E2E_ORGANISATION_ID}::uuid
            and principal_type = 'agent'
        \`;
        await sql\`
          delete from public.organisations
          where id = \${process.env.E2E_ORGANISATION_ID}::uuid
        \`;
        console.log(JSON.stringify({ cleaned: true }));
      } finally {
        await closeSqlPool();
      }
    `,
    {
      ...process.env,
      E2E_ORGANISATION_ID: session.testOrganisationId,
      E2E_SESSION_ID: session.sessionId
    }
  );
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
