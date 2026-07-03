#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";
import {
  platformWorkerModeRunsProfile,
  requiredRuntimeWorkerProfiles
} from "./runtime-worker-profiles.mjs";

const targetBaseUrl = (
  process.env.PRD_SITE_URL || "https://mattanutra.com"
).replace(/\/+$/, "");
const expectCleanRuntime = process.env.PRD_EXPECT_CLEAN_RUNTIME === "true";
const lineWebhookUrl = `${targetBaseUrl}/api/line/webhook`;
const expectedLineWebhookUrl = "https://mattanutra.com/api/line/webhook";
const externalSecretChecksStrict =
  process.env.MATTANUTRA_ENV === "prd" ||
  process.env.PRD_SMOKE_REQUIRE_EXTERNAL_SECRETS === "true";
const validateLine =
  externalSecretChecksStrict || process.env.PRD_SMOKE_VALIDATE_LINE === "true";
const validateDatabase = process.env.PRD_SMOKE_VALIDATE_DB === "true";
const validateWorkerCredentials =
  process.env.PRD_SMOKE_VALIDATE_WORKER_CREDENTIALS === "true";
const expectedDeploymentCommit = process.env.PRD_EXPECT_COMMIT?.trim() || "";
const requireFreshWorkerSessions =
  process.env.PRD_SMOKE_REQUIRE_FRESH_WORKERS === "true" ||
  Boolean(expectedDeploymentCommit);
const requiredTables = [
  "communication_channels",
  "communication_messages",
  "customer_line_connect_tokens",
  "line_connect_tokens",
  "organisation_communication_identities",
  "organisation_notification_preferences",
  "retail_customer_order_lines",
  "retail_customer_orders",
  "retail_carrier_accounts",
  "retail_order_allocations",
  "retail_order_shipment_events",
  "retail_order_shipments",
  "retail_product_stock",
  "retail_sellable_products",
  "retail_shopping_list_lines",
  "retail_shopping_lists",
  "tasks",
  "worker_sessions"
];
const criticalTaskTypes = [
  "admin_catalogue_optimization_job",
  "customer_chat_reply",
  "carrier_event_process",
  "dispatch_chat_communication_message",
  "dispatch_email_communication_message",
  "retail_customer_order_allocate",
  "retail_order_ship",
  "retail_shopping_list_review",
  "route_admin_communication",
  "send_retail_order_workflow_email"
];
const requiredWorkerProfiles = requiredRuntimeWorkerProfiles("prd");
const requiredPrdAppEnvKeys = requiredWorkerProfiles.map((profile) => profile.envKey);
const retiredDatabaseUrlKey = ["DATABASE", "URL"].join("_");
const checks = [];
let digitalOceanAppId = null;
let digitalOceanDeploymentId = null;
let digitalOceanAppSpec = null;

function record(name, ok, details = "", severity = "error") {
  checks.push({ details, name, ok, severity });
  const prefix = ok
    ? "[ok]"
    : severity === "skip"
      ? "[skip]"
      : severity === "warn"
        ? "[warn]"
        : "[fail]";

  console.log(`${prefix} ${name}${details ? ` - ${details}` : ""}`);
}

function shouldUseSsl(connectionString) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

function prdDbConnection() {
  const explicit = process.env.PRD_DB_URL?.trim();

  if (explicit) {
    return explicit;
  }

  const fallback = process.env.DB_URL?.trim();

  return fallback && /(?:prd|prod|mattanutra-prd)/i.test(fallback)
    ? fallback
    : null;
}

async function checkRoute(path) {
  const url = `${targetBaseUrl}${path}`;

  try {
    const response = await fetch(url, { redirect: "manual" });
    const ok = response.status >= 200 && response.status < 400;

    record(`route ${path}`, ok, `status=${response.status}`);
  } catch (error) {
    record(
      `route ${path}`,
      false,
      error instanceof Error ? error.message : "request failed"
    );
  }
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

  return new Set((service?.envs ?? []).map((envVar) => envVar?.key).filter(Boolean));
}

function configuredEnvValueFromAppSpec(spec, key, componentName = "") {
  const collect = (envs) => {
    for (const envVar of envs ?? []) {
      if (envVar?.key === key && String(envVar.value ?? "").trim()) {
        return String(envVar.value).trim();
      }
    }

    return "";
  };
  const component = [
    ...(spec?.services ?? []),
    ...(spec?.workers ?? []),
    ...(spec?.jobs ?? [])
  ].find((candidate) => candidate?.name === componentName);

  return (
    collect(component?.envs) ||
    collect(spec?.envs) ||
    (spec?.services ?? []).map((service) => collect(service.envs)).find(Boolean) ||
    (spec?.workers ?? []).map((worker) => collect(worker.envs)).find(Boolean) ||
    (spec?.jobs ?? []).map((job) => collect(job.envs)).find(Boolean) ||
    ""
  );
}

function deploymentMatchesExpectedCommit(deployment, expectedCommit) {
  const normalized = String(expectedCommit ?? "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  const short = normalized.slice(0, 7);
  const haystack = JSON.stringify(deployment ?? {}).toLowerCase();

  return haystack.includes(normalized) || (short.length >= 7 && haystack.includes(short));
}

function prdDigitalOceanComponentName(spec) {
  const explicit =
    process.env.PRD_DIGITALOCEAN_COMPONENT_NAME?.trim() ||
    process.env.PRD_DIGITALOCEAN_SERVICE_NAME?.trim();

  if (explicit) {
    return explicit;
  }

  const serviceNames = (spec?.services ?? [])
    .map((service) => service?.name)
    .filter(Boolean);

  if (serviceNames.includes("mattanutra-ui-prd")) {
    return "mattanutra-ui-prd";
  }

  return serviceNames[0] || "mattanutra-ui-prd";
}

async function checkDigitalOceanDeployment() {
  const token = process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim();

  if (!token) {
    record(
      "DigitalOcean deployment",
      false,
      "DIGITALOCEAN_ACCESS_TOKEN not configured",
      "warn"
    );
    return;
  }

  const configuredAppId = process.env.PRD_DIGITALOCEAN_APP_ID?.trim();
  const appName =
    process.env.PRD_DIGITALOCEAN_APP_NAME?.trim() || "mattanutra-ui-prd";
  let appId = configuredAppId;

  try {
    if (!appId) {
      const appsResponse = await fetch("https://api.digitalocean.com/v2/apps", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const apps = await appsResponse.json();
      appId = apps.apps?.find(
        (app) => app.spec?.name === appName || app.name === appName
      )?.id;
    }

    if (!appId) {
      record("DigitalOcean deployment", false, `PRD app ${appName} not found`);
      return;
    }

    digitalOceanAppId = appId;

    const appResponse = await fetch(
      `https://api.digitalocean.com/v2/apps/${appId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const appData = await appResponse.json();
    digitalOceanAppSpec = appData.app?.spec ?? null;
    const componentName = prdDigitalOceanComponentName(digitalOceanAppSpec);
    const envKeys = configuredEnvKeysFromAppSpec(digitalOceanAppSpec);
    const serviceEnvKeys = configuredServiceEnvKeysFromAppSpec(
      digitalOceanAppSpec,
      componentName
    );
    const environmentMode = configuredEnvValueFromAppSpec(
      digitalOceanAppSpec,
      "MATTANUTRA_ENV",
      componentName
    );
    const platformWorkerMode =
      configuredEnvValueFromAppSpec(
        digitalOceanAppSpec,
        "PLATFORM_WORKER_MODE",
        componentName
      ) ||
      "all";
    const missingEnvKeys = requiredPrdAppEnvKeys.filter((key) => !envKeys.has(key));

    record(
      "DigitalOcean worker env",
      missingEnvKeys.length === 0,
      missingEnvKeys.length === 0
        ? `${requiredPrdAppEnvKeys.length} worker keys configured`
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
    record(
      "DigitalOcean runtime environment",
      environmentMode === "prd",
      environmentMode
        ? `MATTANUTRA_ENV=${environmentMode}`
        : "MATTANUTRA_ENV missing from app spec"
    );
    record(
      "DigitalOcean optimisation worker mode",
      platformWorkerModeRunsProfile(platformWorkerMode, "analytics"),
      `PLATFORM_WORKER_MODE=${platformWorkerMode}`
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
      active
        ? `phase=${active.phase} cause=${active.cause ?? "unknown"}`
        : "no deployment"
    );
    if (expectedDeploymentCommit) {
      const commitMatches = deploymentMatchesExpectedCommit(
        active,
        expectedDeploymentCommit
      );

      record(
        "DigitalOcean deployed commit",
        commitMatches,
        commitMatches
          ? `expected=${expectedDeploymentCommit.slice(0, 12)}`
          : `expected=${expectedDeploymentCommit.slice(0, 12)} active=${active?.cause ?? "unknown"}`
      );
    }
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
    record(
      "worker auth runtime logs",
      false,
      "DigitalOcean deployment log context unavailable",
      "warn"
    );
    return;
  }

  const componentName =
    prdDigitalOceanComponentName(digitalOceanAppSpec);

  try {
    const response = await fetch(
      `https://api.digitalocean.com/v2/apps/${digitalOceanAppId}/components/${componentName}/logs?type=RUN`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      record("worker auth runtime logs", false, `log endpoint status=${response.status}`, "warn");
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
    const hasWorker401 =
      /\/api\/workers\/register failed with 401|Worker API access is not authorized/i.test(logs);
    const hasRuntimeDbUrlMissing =
      /DB_URL is not visible in the runtime process|DB_URL is not configured in the service runtime environment|\[workers:doctor\] DB_URL is required/i.test(logs);

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
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function checkLineWebhook() {
  if (!validateLine) {
    record(
      "LINE webhook endpoint",
      false,
      "set PRD_SMOKE_VALIDATE_LINE=true to validate PRD LINE endpoint",
      "skip"
    );
    record(
      "LINE webhook signature",
      false,
      "set PRD_SMOKE_VALIDATE_LINE=true to validate signed PRD webhook",
      "skip"
    );
    return;
  }

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
    const body = JSON.stringify({ destination: "prd-smoke", events: [] });
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
  const connection = prdDbConnection();

  if (!connection) {
    const severity = validateDatabase ? "error" : "skip";
    record(
      "PRD database",
      false,
      validateDatabase
        ? "PRD_SMOKE_VALIDATE_DB=true requires PRD_DB_URL, or DB_URL containing prd"
        : "set PRD_DB_URL, or DB_URL containing prd, to run DB checks",
      severity
    );
    return;
  }

  const sql = postgres(connection, {
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
  });

  try {
    const databaseRows = await sql`
      select current_database() as database, now() as checked_at
    `;
    const databaseName = String(databaseRows[0]?.database ?? "");

    record(
      "PRD database",
      /prd|prod|mattanutra-prd/i.test(databaseName),
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
        count(distinct retail_product_stock.id)::int as stock_count,
        coalesce(sum(retail_product_stock.stock_quantity), 0)::int as stock_quantity_sum
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
      Number(delight?.sellable_count ?? 0) > 0 &&
        (!expectCleanRuntime || Number(delight?.stock_quantity_sum ?? 0) === 0),
      `sellable=${delight?.sellable_count ?? 0} stock_rows=${delight?.stock_count ?? 0} stock_sum=${delight?.stock_quantity_sum ?? 0}`
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
        : requireFreshWorkerSessions
          ? `stale=${staleWorkerProfiles.map((row) => row.mode).join(", ")}`
          : `fresh worker session check deferred until post-deploy; stale=${staleWorkerProfiles.map((row) => row.mode).join(", ")}`,
      requireFreshWorkerSessions ? "error" : "skip"
    );

    if (!validateWorkerCredentials) {
      record(
        "worker auth doctor",
        false,
        "set PRD_SMOKE_VALIDATE_WORKER_CREDENTIALS=true for local worker token hash validation",
        "skip"
      );
    } else {
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
    }

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
      Number(channels?.line_channels ?? 0) +
        Number(channels?.email_channels ?? 0) >
        0,
      `line=${channels?.line_channels ?? 0} email=${channels?.email_channels ?? 0}`,
      expectCleanRuntime ? "error" : "warn"
    );

    if (expectCleanRuntime) {
      const operationalTables = [
        "assessments",
        "communication_messages",
        "payments",
        "retail_customer_orders",
        "retail_shopping_lists",
        "retail_stock_movements",
        "tasks"
      ];
      const runtimeRows = await sql`
        select table_name, row_count::int
        from (
          select 'assessments' as table_name, count(*) as row_count from public.assessments
          union all
          select 'communication_messages', count(*) from public.communication_messages
          union all
          select 'payments', count(*) from public.payments
          union all
          select 'retail_customer_orders', count(*) from public.retail_customer_orders
          union all
          select 'retail_shopping_lists', count(*) from public.retail_shopping_lists
          union all
          select 'retail_stock_movements', count(*) from public.retail_stock_movements
          union all
          select 'tasks', count(*) from public.tasks
        ) counts
        order by table_name
      `;
      const nonEmpty = runtimeRows.filter(
        (row) => Number(row.row_count ?? 0) > 0
      );

      record(
        "clean operational runtime",
        nonEmpty.length === 0,
        nonEmpty.length === 0
          ? `${operationalTables.length} operational tables empty`
          : nonEmpty.map((row) => `${row.table_name}=${row.row_count}`).join(", ")
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  console.log(`PRD smoke target: ${targetBaseUrl}`);
  console.log("No destructive database writes are performed.");

  await checkRoute("/en");
  await checkRoute("/en/admin/login");
  await checkRoute("/en/admin/dashboard?view=product-optimisation");
  await checkRoute("/en/nutrition/quiz");
  await checkDigitalOceanDeployment();
  await checkLineWebhook();
  await checkDatabase();
  await checkRecentRuntimeLogs();

  const failures = checks.filter(
    (check) => !check.ok && check.severity === "error"
  );
  const warnings = checks.filter(
    (check) => !check.ok && check.severity === "warn"
  );
  const skipped = checks.filter(
    (check) => !check.ok && check.severity === "skip"
  );

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    failureCount: failures.length,
    skippedCount: skipped.length,
    targetBaseUrl,
    warningCount: warnings.length
  }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
