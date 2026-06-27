import { spawnSync } from "node:child_process";

const token = process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim();
const appName =
  process.env.UAT_DIGITALOCEAN_APP_NAME?.trim() || "mattanutra-ui-uat";

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!token) {
  fail("DIGITALOCEAN_ACCESS_TOKEN is required to read the UAT app env.");
}

const headers = {
  Authorization: `Bearer ${token}`
};
const appsResponse = await fetch("https://api.digitalocean.com/v2/apps", {
  headers
});
const apps = await appsResponse.json();
const app = apps.apps?.find(
  (candidate) => candidate.spec?.name === appName || candidate.name === appName
);

if (!app) {
  fail(`UAT app ${appName} not found.`);
}

const appResponse = await fetch(`https://api.digitalocean.com/v2/apps/${app.id}`, {
  headers
});
const appData = await appResponse.json();
const envs = appData.app?.spec?.envs ?? [];
const envValue = (key) =>
  envs.find((candidate) => candidate?.key === key)?.value ?? "";
const endpoint = envValue("DO_SPACES_ENDPOINT");
const cdnEndpoint =
  envValue("DO_SPACES_CDN_ENDPOINT") ||
  envValue("DO_SPACES_CDN_URL") ||
  envValue("DO_SPACES_PUBLIC_BASE_URL");
const explicitAccess =
  envValue("DO_SPACES_ACCESS_KEY_ID") ||
  envValue("DO_SPACES_ACCESS_KEY") ||
  envValue("DO_SPACES_KEY_ID");
const explicitSecret =
  envValue("DO_SPACES_SECRET_ACCESS_KEY") ||
  envValue("DO_SPACES_SECRET_KEY");
const legacyKey = envValue("DO_SPACES_KEY");
const secretFromKey = (() => {
  if (!explicitAccess || !legacyKey) {
    return "";
  }

  const separator = legacyKey.includes(":")
    ? ":"
    : legacyKey.includes("|")
      ? "|"
      : "";

  return separator
    ? legacyKey.slice(legacyKey.indexOf(separator) + 1).trim()
    : legacyKey;
})();
const secretAccessKey = explicitSecret || secretFromKey;

console.log(JSON.stringify({
  appId: app.id,
  appName,
  credentialMode:
    explicitAccess || explicitSecret
      ? explicitAccess && secretAccessKey
        ? "explicit"
        : "partial_explicit"
      : legacyKey
        ? "legacy"
        : "missing",
  hasCdnEndpoint: Boolean(cdnEndpoint),
  hasEndpoint: Boolean(endpoint)
}, null, 2));

const probe = spawnSync(process.execPath, [
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs",
  "scripts/probe-spaces-image-storage.ts"
], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    DO_SPACES_ACCESS_KEY_ID: explicitAccess,
    DO_SPACES_CDN_ENDPOINT: cdnEndpoint,
    DO_SPACES_ENDPOINT: endpoint,
    DO_SPACES_KEY: explicitAccess ? "" : legacyKey,
    DO_SPACES_SECRET_ACCESS_KEY: secretAccessKey,
    MATTANUTRA_ENV: "uat"
  }
});

if (probe.stdout.trim()) {
  console.log(probe.stdout.trim());
}

if (probe.stderr.trim()) {
  console.error(probe.stderr.trim());
}

process.exit(probe.status ?? 1);
