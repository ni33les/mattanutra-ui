import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";

const targetBaseUrl = (
  process.env.UAT_SITE_URL ||
  "https://uat.mattanutra.com"
).replace(/\/+$/, "");
const lineWebhookUrl = `${targetBaseUrl}/api/line/webhook`;
const expectedLineWebhookUrl = "https://uat.mattanutra.com/api/line/webhook";
const requiredTables = [
  "communication_channels",
  "communication_messages",
  "line_connect_tokens",
  "organisation_communication_identities",
  "organisation_notification_preferences",
  "retail_customer_order_lines",
  "retail_customer_orders",
  "retail_order_allocations",
  "retail_product_stock",
  "retail_sellable_products",
  "retail_shopping_list_lines",
  "retail_shopping_lists",
  "tasks",
  "worker_sessions"
];
const criticalTaskTypes = [
  "dispatch_chat_communication_message",
  "dispatch_email_communication_message",
  "retail_customer_order_allocate",
  "retail_order_ship",
  "retail_shopping_list_review",
  "route_admin_communication",
  "send_retail_order_workflow_email"
];
const requiredWorkerProfiles = [
  { envKey: "WORKER_ADVISOR_AGENT_API_KEY", mode: "advisor" },
  { envKey: "WORKER_CHAT_AGENT_API_KEY", mode: "chat" },
  { envKey: "WORKER_COMMUNICATIONS_AGENT_API_KEY", mode: "communications" },
  { envKey: "WORKER_CONTENT_AGENT_API_KEY", mode: "content" },
  { envKey: "WORKER_EMAIL_AGENT_API_KEY", mode: "email" },
  { envKey: "WORKER_FOOD_AGENT_API_KEY", mode: "food" },
  { envKey: "WORKER_FORMULATION_AGENT_API_KEY", mode: "formulation" },
  { envKey: "WORKER_HEALTHSCORE_AGENT_API_KEY", mode: "healthscore" },
  { envKey: "WORKER_HOSTING_AGENT_API_KEY", mode: "hosting" },
  { envKey: "WORKER_PRODUCTS_AGENT_API_KEY", mode: "products" },
  { envKey: "WORKER_STOCK_AGENT_API_KEY", mode: "stock" }
];
const requiredUatAppEnvKeys = requiredWorkerProfiles.map((profile) => profile.envKey);
const retiredDatabaseUrlKey = ["DATABASE", "URL"].join("_");
const checks = [];
let digitalOceanAppId = null;
let digitalOceanDeploymentId = null;

// No destructive database writes are performed by this script.

function record(name, ok, details = "", severity = "error") {
  checks.push({
    details,
    name,
    ok,
    severity
  });
  const prefix = ok ? "[ok]" : severity === "warn" ? "[warn]" : "[fail]";
  console.log(`${prefix} ${name}${details ? ` - ${details}` : ""}`);
}

function uatDbConnection() {
  const explicit = process.env.UAT_DB_URL?.trim();

  if (explicit) {
    return explicit;
  }

  const fallback = process.env.DB_URL?.trim();

  return fallback && /(?:uat|mattanutra-uat)/i.test(fallback)
    ? fallback
    : null;
}

async function checkRoute(path) {
  const url = `${targetBaseUrl}${path}`;

  try {
    const response = await fetch(url, {
      redirect: "manual"
    });
    const ok = response.status >= 200 && response.status < 500;

    record(`route ${path}`, ok, `status=${response.status}`);
  } catch (error) {
    record(
      `route ${path}`,
      false,
      error instanceof Error ? error.message : "request failed"
    );
  }
}

async function checkDigitalOceanDeployment() {
  const token = process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim();

  if (!token) {
    record("DigitalOcean deployment", false, "DIGITALOCEAN_ACCESS_TOKEN not configured", "warn");
    return;
  }

  const configuredAppId = process.env.UAT_DIGITALOCEAN_APP_ID?.trim();
  const appName = process.env.UAT_DIGITALOCEAN_APP_NAME?.trim() || "mattanutra-ui-uat";
  let appId = configuredAppId;

  try {
    if (!appId) {
      const appsResponse = await fetch("https://api.digitalocean.com/v2/apps", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const apps = await appsResponse.json();
      appId = apps.apps?.find((app) => app.spec?.name === appName || app.name === appName)?.id;
    }

    if (!appId) {
      record("DigitalOcean deployment", false, `UAT app ${appName} not found`);
      return;
    }

    digitalOceanAppId = appId;

    const appResponse = await fetch(`https://api.digitalocean.com/v2/apps/${appId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const appData = await appResponse.json();
    const envKeys = configuredEnvKeysFromAppSpec(appData.app?.spec);
    const serviceEnvKeys = configuredServiceEnvKeysFromAppSpec(
      appData.app?.spec,
      process.env.UAT_DIGITALOCEAN_COMPONENT_NAME?.trim() ||
        process.env.UAT_DIGITALOCEAN_SERVICE_NAME?.trim() ||
        "mattanutra-ui"
    );
    const missingEnvKeys = requiredUatAppEnvKeys.filter((key) => !envKeys.has(key));

    record(
      "DigitalOcean worker env",
      missingEnvKeys.length === 0,
      missingEnvKeys.length === 0
        ? `${requiredUatAppEnvKeys.length} worker keys configured`
        : `missing ${missingEnvKeys.join(", ")}`
    );
    record(
      "DigitalOcean DB env",
      envKeys.has("DB_URL"),
      envKeys.has("DB_URL")
        ? serviceEnvKeys.has("DB_URL")
          ? "DB_URL configured on app and service"
          : "DB_URL configured at app level"
        : "DB_URL missing from app spec"
    );
    if (serviceEnvKeys.has(retiredDatabaseUrlKey)) {
      record(
        "DigitalOcean retired DB env",
        false,
        `service still has ${retiredDatabaseUrlKey}; ignored by runtime code but should be removed`,
        "warn"
      );
    }

    const response = await fetch(
      `https://api.digitalocean.com/v2/apps/${appId}/deployments`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    const active = data.deployments?.[0];
    const ok = active?.phase === "ACTIVE";
    digitalOceanDeploymentId = active?.id ?? null;

    record(
      "DigitalOcean deployment",
      ok,
      active ? `phase=${active.phase} cause=${active.cause ?? "unknown"}` : "no deployment"
    );
  } catch (error) {
    record(
      "DigitalOcean deployment",
      false,
      error instanceof Error ? error.message : "deployment check failed"
    );
  }
}

async function checkRecentRuntimeLogs() {
  const token = process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim();

  if (!token || !digitalOceanAppId || !digitalOceanDeploymentId) {
    record("worker auth runtime logs", false, "DigitalOcean deployment log context unavailable", "warn");
    return;
  }

  const componentName =
    process.env.UAT_DIGITALOCEAN_COMPONENT_NAME?.trim() ||
    process.env.UAT_DIGITALOCEAN_SERVICE_NAME?.trim() ||
    "mattanutra-ui";

  try {
    const response = await fetch(
      `https://api.digitalocean.com/v2/apps/${digitalOceanAppId}/components/${componentName}/logs?type=RUN`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      record(
        "worker auth runtime logs",
        false,
        `log endpoint status=${response.status}`,
        "warn"
      );
      return;
    }

    const data = await response.json();
    const urls = [
      ...(Array.isArray(data.historic_urls) ? data.historic_urls : []),
      data.live_url
    ].filter(Boolean);

    if (urls.length < 1) {
      record("worker auth runtime logs", false, "no runtime log URLs returned", "warn");
      return;
    }

    const textParts = await Promise.all(
      urls.slice(0, 3).map(async (url) => {
        const logResponse = await fetch(url);

        return logResponse.ok ? logResponse.text() : "";
      })
    );
    const logs = textParts.join("\n");
    const hasWorker401 = /\/api\/workers\/register failed with 401|Worker API access is not authorized/i.test(logs);
    const hasRuntimeDbUrlMissing = /DB_URL is not visible in the runtime process|DB_URL is not configured in the service runtime environment|\[workers:doctor\] DB_URL is required/i.test(logs);

    record(
      "worker auth runtime logs",
      !hasWorker401 && !hasRuntimeDbUrlMissing,
      hasWorker401
        ? "worker registration 401 found in active runtime logs"
        : hasRuntimeDbUrlMissing
          ? "runtime logs show DB_URL is not visible to start:platform"
          : "no worker auth or DB_URL runtime failures found"
    );
  } catch (error) {
    record(
      "worker auth runtime logs",
      false,
      error instanceof Error ? error.message : "runtime log check failed",
      "warn"
    );
  }
}

function runWorkerDoctor(connection) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--env-file-if-exists=.env.local",
        "--experimental-strip-types",
        "--import",
        "./scripts/register-ts-path-loader.mjs",
        "scripts/workers-doctor.ts",
        "--require-all",
        "--json"
      ],
      {
        env: {
          ...process.env,
          DB_URL: connection
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({
        code: 1,
        error: error instanceof Error ? error.message : String(error),
        stdout,
        stderr
      });
    });
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function configuredEnvKeysFromAppSpec(spec) {
  const keys = new Set();
  const collect = (envs) => {
    for (const envVar of envs ?? []) {
      if (envVar?.key && String(envVar.value ?? "").trim()) {
        keys.add(envVar.key);
      }
    }
  };

  collect(spec?.envs);
  for (const service of spec?.services ?? []) {
    collect(service.envs);
  }
  for (const worker of spec?.workers ?? []) {
    collect(worker.envs);
  }
  for (const job of spec?.jobs ?? []) {
    collect(job.envs);
  }

  return keys;
}

function configuredServiceEnvKeysFromAppSpec(spec, serviceName) {
  const service = (spec?.services ?? []).find(
    (candidate) => candidate?.name === serviceName
  );

  return new Set(
    (service?.envs ?? [])
      .map((envVar) => envVar?.key)
      .filter(Boolean)
  );
}

async function checkLineWebhook() {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();

  if (!accessToken) {
    record("LINE webhook endpoint", false, "LINE_CHANNEL_ACCESS_TOKEN not configured", "warn");
  } else {
    try {
      const response = await fetch(
        "https://api.line.me/v2/bot/channel/webhook/endpoint",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await response.json();
      const ok = data.endpoint === expectedLineWebhookUrl && data.active === true;

      record(
        "LINE webhook endpoint",
        ok,
        `endpoint=${data.endpoint ?? "unknown"} active=${String(data.active)}`
      );
    } catch (error) {
      record(
        "LINE webhook endpoint",
        false,
        error instanceof Error ? error.message : "LINE endpoint check failed"
      );
    }
  }

  if (!channelSecret) {
    record("LINE webhook signature", false, "LINE_CHANNEL_SECRET not configured", "warn");
    return;
  }

  try {
    const body = JSON.stringify({ destination: "uat-smoke", events: [] });
    const signature = createHmac("sha256", channelSecret)
      .update(body)
      .digest("base64");
    const response = await fetch(lineWebhookUrl, {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-line-signature": signature
      },
      method: "POST"
    });

    record("LINE webhook signature", response.ok, `status=${response.status}`);
  } catch (error) {
    record(
      "LINE webhook signature",
      false,
      error instanceof Error ? error.message : "signature smoke failed"
    );
  }
}

async function checkDatabase() {
  const connection = uatDbConnection();

  if (!connection) {
    record(
      "UAT database",
      false,
      "Set UAT_DB_URL, or DB_URL containing uat, to run DB checks",
      "warn"
    );
    return;
  }

  const sql = postgres(connection, {
    max: 1,
    prepare: false
  });

  try {
    const databaseRows = await sql`
      select current_database() as database, now() as checked_at
    `;
    const databaseName = String(databaseRows[0]?.database ?? "");

    record(
      "UAT database",
      /uat|mattanutra-uat/i.test(databaseName),
      `database=${databaseName}`
    );

    const tableRows = await sql`
      select table_name, to_regclass('public.' || table_name) is not null as available
      from unnest(${requiredTables}::text[]) as required(table_name)
      order by table_name
    `;
    const missingTables = tableRows
      .filter((row) => row.available !== true)
      .map((row) => row.table_name);

    record(
      "runtime schema",
      missingTables.length === 0,
      missingTables.length === 0
        ? `${requiredTables.length} required tables available`
        : `missing ${missingTables.join(", ")}`
    );

    const delightRows = await sql`
      select
        organisations.id::text,
        count(distinct retail_sellable_products.id)::int as sellable_count,
        count(distinct retail_product_stock.id)::int as stock_count
      from public.organisations
      left join public.retail_sellable_products
        on retail_sellable_products.organisation_id = organisations.id
        and retail_sellable_products.status = 'active'
      left join public.retail_product_stock
        on retail_product_stock.organisation_id = organisations.id
        and retail_product_stock.status = 'active'
      where organisations.slug = 'delight-pharmacy'
      group by organisations.id
      limit 1
    `;
    const delight = delightRows[0];

    record(
      "Delight sellable catalogue",
      Number(delight?.sellable_count ?? 0) > 0,
      `sellable=${delight?.sellable_count ?? 0} stock_rows=${delight?.stock_count ?? 0}`
    );

    const workerRows = await sql`
      select
        expected.env_key,
        expected.mode,
        agents.name as agent_name,
        count(worker_sessions.id) filter (
          where worker_sessions.status <> 'offline'
            and worker_sessions.last_seen_at >= now() - interval '2 minutes'
        )::int as fresh_sessions,
        max(worker_sessions.last_seen_at)::text as last_seen_at
      from unnest(
        ${requiredWorkerProfiles.map((profile) => profile.envKey)}::text[],
        ${requiredWorkerProfiles.map((profile) => profile.mode)}::text[]
      ) as expected(env_key, mode)
      left join public.agent_credentials
        on agent_credentials.metadata->>'envKey' = expected.env_key
        and agent_credentials.status = 'active'
        and agent_credentials.revoked_at is null
        and (agent_credentials.expires_at is null or agent_credentials.expires_at > now())
      left join public.agents
        on agents.id = agent_credentials.agent_id
      left join public.worker_sessions
        on worker_sessions.agent_id = agent_credentials.agent_id
        and worker_sessions.membership_id = agent_credentials.membership_id
      group by expected.env_key, expected.mode, agents.name
      order by expected.mode
    `;
    const staleWorkerProfiles = workerRows.filter(
      (row) => Number(row.fresh_sessions ?? 0) < 1
    );

    record(
      "workers registered",
      staleWorkerProfiles.length === 0,
      staleWorkerProfiles.length === 0
        ? `${requiredWorkerProfiles.length} required profiles fresh`
        : `stale=${staleWorkerProfiles.map((row) => row.mode).join(", ")}`
    );

    const doctor = await runWorkerDoctor(connection);
    let doctorDetails = `exit=${doctor.code}`;

    try {
      const payload = JSON.parse(doctor.stdout || "{}");
      doctorDetails += ` failures=${payload.failureCount ?? "unknown"}`;
    } catch {
      if (doctor.error) {
        doctorDetails += ` ${doctor.error}`;
      } else if (doctor.stderr) {
        doctorDetails += ` ${doctor.stderr.trim().slice(0, 180)}`;
      }
    }

    record("worker auth doctor", doctor.code === 0, doctorDetails);

    const stuckRows = await sql`
      select count(*)::int as stuck_count
      from public.tasks
      where task_type = any(${criticalTaskTypes}::text[])
        and status in ('reserved', 'running')
        and coalesce(lease_until, updated_at) < now() - interval '10 minutes'
    `;

    record(
      "critical task leases",
      Number(stuckRows[0]?.stuck_count ?? 0) === 0,
      `stuck=${stuckRows[0]?.stuck_count ?? 0}`
    );

    const channelRows = await sql`
      select
        count(*) filter (where communication_channels.channel_type = 'line')::int as line_channels,
        count(*) filter (where communication_channels.channel_type = 'email')::int as email_channels
      from public.organisations
      join public.organisation_communication_identities
        on organisation_communication_identities.organisation_id = organisations.id
      join public.communication_channels
        on communication_channels.identity_id = organisation_communication_identities.identity_id
      where organisations.slug = 'delight-pharmacy'
        and communication_channels.status = 'active'
    `;
    const channels = channelRows[0];

    record(
      "Delight communication channels",
      Number(channels?.line_channels ?? 0) + Number(channels?.email_channels ?? 0) > 0,
      `line=${channels?.line_channels ?? 0} email=${channels?.email_channels ?? 0}`,
      "warn"
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  console.log(`UAT smoke target: ${targetBaseUrl}`);
  console.log("No destructive database writes are performed.");

  await checkRoute("/en");
  await checkRoute("/en/admin/login");
  await checkRoute("/en/nutrition/quiz");
  await checkDigitalOceanDeployment();
  await checkLineWebhook();
  await checkDatabase();
  await checkRecentRuntimeLogs();

  const failures = checks.filter((check) => !check.ok && check.severity !== "warn");
  const warnings = checks.filter((check) => !check.ok && check.severity === "warn");

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        failureCount: failures.length,
        targetBaseUrl,
        warningCount: warnings.length
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
