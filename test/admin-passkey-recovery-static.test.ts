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
  const access = source("lib/admin-access.ts");

  assert.match(access, /where person_id = \$\{personId\}::uuid[\s\S]*status = 'active'[\s\S]*revoked_at is null/);
  assert.match(access, /where credential_id = \$\{credentialId\}[\s\S]*status = 'active'[\s\S]*revoked_at is null/);
  assert.match(access, /on conflict \(credential_id\) do nothing/);
  assert.match(access, /already registered or was previously revoked/);
  assert.doesNotMatch(access, /admin_passkey_credentials[\s\S]{0,900}on conflict \(credential_id\) do update set/);
});

test("owner passkey recovery revokes passkeys and sessions before issuing one-time invite", () => {
  const access = source("lib/admin-access.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");

  assert.match(access, /export async function createAdminPasskeyRecovery/);
  assert.match(access, /actor\.isLegacy/);
  assert.match(access, /actor\.actorMembership\.role !== "platform_owner"/);
  assert.match(access, /actor\.actorPerson\.id === personId/);
  assert.match(access, /metadata->>'reason' = 'passkey_recovery'/);
  assert.match(access, /status = 'revoked'[\s\S]*revoked_invitation_id = invite\.id::uuid/);
  assert.match(access, /with target as \(/);
  assert.match(access, /update public\.admin_sessions[\s\S]*set revoked_at = coalesce\(revoked_at, now\(\)\)/);
  assert.match(access, /const recoveryInviteMinutes = 60/);
  assert.match(access, /admin\.passkey_recovery_started/);
  assert.match(access, /admin\.passkey_recovery_accepted/);

  assert.match(route, /action === "recover_passkey"/);
  assert.match(route, /context\.isLegacy/);
  assert.match(route, /context\.actorMembership\.role !== "platform_owner"/);
  assert.match(view, /recover_passkey/);
  assert.doesNotMatch(view, /window\.confirm/);
  assert.doesNotMatch(view, /recoverPasskeyConfirm/);
  assert.doesNotMatch(view, /selectedPasskeyPerson/);
  assert.doesNotMatch(view, /labels\.access\.managePasskeys/);
  assert.doesNotMatch(view, /labels\.access\.passkeysFor/);
  assert.doesNotMatch(view, /recoveryUnavailableReason/);
  assert.match(view, /passkeyRecoveryPersonId/);
  assert.match(view, /canStartPasskeyRecovery/);
  assert.match(view, /renderPasskeyControls/);
  assert.match(view, /labels\.access\.recoverPasskey/);
  assert.match(view, /labels\.access\.passkeyRecoveryWarning/);
  assert.match(view, /labels\.access\.sendRecoveryInvite/);
  assert.match(view, /activePasskeyCount/);
  assert.match(view, /lastPasskeyUsedAt/);
  assert.match(view, /passkeySummary\(person\)/);
  assert.equal(
    [...view.matchAll(/setPasskeyRecoveryPersonId\(person\.id\)/g)].length,
    1
  );
  assert.doesNotMatch(
    view,
    /Recover passkey|Send recovery invite|Passkeys for|Recovery immediately revokes/
  );
});

test("passkey recovery inline copy is localized for admin access views", () => {
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
  const optionsRoute = source("app/api/admin/auth/passkey/add/options/route.ts");
  const verifyRoute = source("app/api/admin/auth/passkey/add/verify/route.ts");
  const settings = source("components/admin/settings-view.tsx");

  assert.match(access, /createAdditionalPasskeyRegistrationOptions/);
  assert.match(access, /verifyAdditionalPasskeyRegistration/);
  assert.match(access, /context\.isLegacy/);
  assert.match(access, /mode: "add_passkey"/);
  assert.match(access, /admin\.passkey_added/);
  assert.match(optionsRoute, /resolveAdminSession/);
  assert.match(verifyRoute, /resolveAdminSession/);
  assert.match(settings, /startRegistration/);
  assert.match(settings, /\/api\/admin\/auth\/passkey\/add\/options/);
  assert.match(settings, /\/api\/admin\/auth\/passkey\/add\/verify/);
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
