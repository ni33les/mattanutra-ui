import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const passkeyRecoveryLabels = [
  "passkeyRecoveryWarning",
  "passkeySummary",
  "recoverPasskey",
  "sendRecoveryInvite"
] as const;

test("admin passkey schema supports revocation without deleting credentials", () => {
  const schema = source("scripts/admin-access-schema.ts");
  const rebuild = source("db-schema.sql");

  for (const file of [schema, rebuild]) {
    assert.match(file, /status text .*default 'active'/i);
    assert.match(file, /revoked_at/i);
    assert.match(file, /revoked_by_person_id/i);
    assert.match(file, /revoked_invitation_id/i);
    assert.match(file, /admin_passkey_credentials_status_check/);
    assert.match(file, /status.*active[\s\S]*revoked/i);
    assert.match(file, /admin_passkey_credentials_person_active_idx/);
  }
});

test("revoked admin passkeys cannot be used or reactivated by registration", () => {
  const auth = source("lib/admin-access-auth.ts");

  assert.match(auth, /where person_id = \$\{personId\}::uuid[\s\S]*status = 'active'[\s\S]*revoked_at is null/);
  assert.match(auth, /where credential_id = \$\{credentialId\}[\s\S]*status = 'active'[\s\S]*revoked_at is null/);
  assert.match(auth, /on conflict \(credential_id\) do nothing/);
  assert.match(auth, /already registered or was previously revoked/);
  assert.doesNotMatch(auth, /admin_passkey_credentials[\s\S]{0,900}on conflict \(credential_id\) do update set/);
});

test("owner passkey recovery revokes passkeys and sessions before issuing one-time invite", () => {
  const access = source("lib/admin-access.ts");
  const auth = source("lib/admin-access-auth.ts");
  const shared = source("lib/admin-access-shared.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");

  assert.match(access, /createAdminPasskeyRecovery/);
  assert.match(auth, /export async function createAdminPasskeyRecovery/);
  assert.match(auth, /actor\.isLegacy/);
  assert.match(auth, /actor\.actorMembership\.role !== "platform_owner"/);
  assert.match(auth, /actor\.actorPerson\.id === personId/);
  assert.match(auth, /metadata->>'reason' = 'passkey_recovery'/);
  assert.match(auth, /'revokedByPersonId', \$\{actor\.actorPerson\.id\}::text/);
  assert.match(auth, /'source', \$\{source\}::text/);
  assert.match(auth, /'revokedSource', \$\{source\}::text/);
  assert.match(auth, /status = 'revoked'[\s\S]*revoked_invitation_id = invite\.id::uuid/);
  assert.match(auth, /with target as \(/);
  assert.match(auth, /update public\.admin_sessions[\s\S]*set revoked_at = coalesce\(revoked_at, now\(\)\)/);
  assert.match(shared, /const recoveryInviteMinutes = 60/);
  assert.match(auth, /admin\.passkey_recovery_started/);
  assert.match(auth, /admin\.passkey_recovery_accepted/);

  assert.match(route, /action === "recover_passkey"/);
  assert.match(route, /context\.isLegacy/);
  assert.match(route, /context\.actorMembership\.role !== "platform_owner"/);
  assert.match(view, /recover_passkey/);
  assert.doesNotMatch(view, /window\.confirm/);
  assert.doesNotMatch(view, /recoverPasskeyConfirm/);
  assert.doesNotMatch(view, /selectedPasskeyPerson/);
  assert.doesNotMatch(view, /renderPasskeyControls/);
  assert.doesNotMatch(view, /labels\.access\.managePasskeys/);
  assert.doesNotMatch(view, /labels\.access\.passkeysFor/);
  assert.doesNotMatch(view, /recoveryUnavailableReason/);
  assert.doesNotMatch(view, /accessData\.people\.map\(\(person\) => \(\s*<form/);
  assert.match(view, /openPersonDetails/);
  assert.match(view, /accessData\.people\.map\(\(person\) => \(\s*<tr[\s\S]*role="button"/);
  assert.match(view, /selectedPerson \? \([\s\S]*<AdminModal/);
  assert.match(
    view,
    /<form className="space-y-5 p-6" key=\{selectedPerson\.id\} onSubmit=\{savePerson\}/
  );
  assert.match(view, /passkeyRecoveryPersonId/);
  assert.match(view, /canStartPasskeyRecovery/);
  assert.match(view, /labels\.access\.recoverPasskey/);
  assert.match(view, /labels\.access\.passkeyRecoveryWarning/);
  assert.match(view, /labels\.access\.sendRecoveryInvite/);
  assert.match(view, /selectedPersonActivePasskeys/);
  assert.match(view, /selectedPersonActivePasskeys\.map/);
  assert.match(view, /actionButtonClass\("delete"\)[\s\S]*labels\.access\.recoverPasskey/);
  assert.match(view, /actionButtonClass\("delete"\)[\s\S]*labels\.access\.sendRecoveryInvite/);
  assert.match(view, /activePasskeyCount/);
  assert.match(view, /passkeys/);
  assert.match(view, /lastPasskeyUsedAt/);
  assert.match(view, /passkeySummary\(person\)/);
  assert.equal(
    [...view.matchAll(/setPasskeyRecoveryPersonId\(selectedPerson\.id\)/g)].length,
    1
  );
  assert.doesNotMatch(
    view,
    /Recover passkey|Send recovery invite|Passkeys for|Recovery immediately revokes/
  );
});

test("passkey recovery modal copy is localized for admin access views", () => {
  const content = source("components/admin/dashboard-content.tsx");
  const zh = JSON.parse(source("components/admin/dashboard-content.zh-CN.json")) as {
    access?: Record<string, unknown>;
  };

  for (const label of passkeyRecoveryLabels) {
    assert.match(content, new RegExp(`\\b${label}:`));
    assert.equal(typeof zh.access?.[label], "string", `${label} is missing zh-CN copy`);
  }

  assert.doesNotMatch(content, /recoverPasskeyConfirm/);
  assert.doesNotMatch(content, /managePasskeys|passkeysFor|recoveryUnavailable/);
  assert.doesNotMatch(
    source("components/admin/access-view.tsx"),
    /labels\.access\.managePasskeys|labels\.access\.passkeysFor|recoveryUnavailable/
  );
});

test("admins can add an extra passkey only from an existing passkey session", () => {
  const access = source("lib/admin-access.ts");
  const auth = source("lib/admin-access-auth.ts");
  const optionsRoute = source("app/api/admin/auth/passkey/add/options/route.ts");
  const verifyRoute = source("app/api/admin/auth/passkey/add/verify/route.ts");
  const settings = source("components/admin/settings-view.tsx");

  assert.match(access, /createAdditionalPasskeyRegistrationOptions/);
  assert.match(access, /verifyAdditionalPasskeyRegistration/);
  assert.match(auth, /export async function createAdditionalPasskeyRegistrationOptions/);
  assert.match(auth, /export async function verifyAdditionalPasskeyRegistration/);
  assert.match(auth, /context\.isLegacy/);
  assert.match(auth, /mode: "add_passkey"/);
  assert.match(auth, /admin\.passkey_added/);
  assert.match(optionsRoute, /resolveAdminSession/);
  assert.match(verifyRoute, /resolveAdminSession/);
  assert.match(settings, /startRegistration/);
  assert.match(settings, /\/api\/admin\/auth\/passkey\/add\/options/);
  assert.match(settings, /\/api\/admin\/auth\/passkey\/add\/verify/);
});

test("add-device invite does not revoke existing passkeys or sessions", () => {
  const access = source("lib/admin-access.ts");
  const auth = source("lib/admin-access-auth.ts");
  const shared = source("lib/admin-access-shared.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");
  const content = source("components/admin/dashboard-content.tsx");
  const login = source("components/admin-login.tsx");
  const loginPage = source("app/[locale]/admin/login/page.tsx");

  assert.match(access, /createAdminPasskeyAddDeviceInvite/);
  assert.match(auth, /export async function createAdminPasskeyAddDeviceInvite/);
  assert.match(auth, /'reason', 'passkey_add_device'/);
  assert.match(auth, /admin\.passkey_add_device_started/);
  assert.match(auth, /admin\.passkey_add_device_accepted/);
  assert.match(auth, /intent=add_device/);
  assert.match(shared, /const addDeviceInviteDays = 7/);
  assert.match(route, /action === "add_device_passkey"/);
  assert.match(view, /add_device_passkey/);
  assert.match(view, /labels\.access\.addAnotherDevice/);
  assert.match(content, /addAnotherDevice:/);
  assert.match(login, /addDeviceHeading/);
  assert.match(loginPage, /inviteIntent/);

  const addDeviceFn = auth.slice(
    auth.indexOf("export async function createAdminPasskeyAddDeviceInvite")
  );
  const nextExport = addDeviceFn.indexOf("\nexport async function", 10);
  const body = nextExport === -1 ? addDeviceFn : addDeviceFn.slice(0, nextExport);
  assert.doesNotMatch(body, /revoked_passkeys/);
  assert.doesNotMatch(body, /update public\.admin_passkey_credentials/);
  assert.doesNotMatch(body, /update public\.admin_sessions/);
});

test("break-glass passkey recovery is operator-confirmed and platform-owner only", () => {
  const script = source("scripts/create-admin-passkey-recovery.ts");
  const pkg = source("package.json");

  assert.match(script, /--confirm is required/);
  assert.match(script, /--email is required/);
  assert.match(script, /organisations\.organisation_type = 'platform'/);
  assert.match(script, /organisation_memberships\.role = 'platform_owner'/);
  assert.match(script, /source: "break_glass_cli"/);
  assert.match(script, /admin\.passkey_recovery_started/);
  assert.match(pkg, /admin:passkey:recover/);
});
