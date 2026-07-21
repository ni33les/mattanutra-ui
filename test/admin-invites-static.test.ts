import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("admin invites do not silently overwrite existing membership roles", () => {
  const access = source("lib/admin-access.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");

  assert.match(access, /existingAccess/);
  assert.match(access, /membershipAdded/);
  assert.match(access, /admin\.invite_existing_member_blocked/);
  assert.match(access, /admin\.membership_added/);
  assert.doesNotMatch(access, /role\s*=\s*excluded\.role/);
  assert.match(route, /const invitationResult = await createAdminInvitation/);
  assert.match(route, /accessResponse\(request, context, invitationResult\)/);
  assert.match(view, /labels\.access\.alreadyMember/);
  assert.match(view, /labels\.access\.membershipAdded/);
});

test("admin invites can recover existing members who still need a passkey", () => {
  const access = source("lib/admin-access.ts");
  const auth = source("lib/admin-access-auth.ts");

  assert.match(access, /admin_passkey_credentials credentials/);
  assert.match(access, /passkeyCount < 1/);
  assert.match(access, /shouldCreatePasskeyInviteForExistingMember = true/);
  assert.match(access, /admin\.invite_existing_member_passkey/);
  // Invited membership activation on first passkey registration lives in auth.
  assert.match(auth, /when public\.organisation_memberships\.status = 'invited' then excluded\.role/);
  assert.match(auth, /when public\.organisation_memberships\.status = 'invited' then 'active'/);
  assert.doesNotMatch(access, /role\s*=\s*excluded\.role/);
  assert.doesNotMatch(auth, /role\s*=\s*excluded\.role/);
});

test("admin invite login renders setup and sign-in as exclusive modes", () => {
  const login = source("components/admin-login.tsx");

  assert.match(login, /const \[setupComplete, setSetupComplete\] = useState\(false\)/);
  assert.match(
    login,
    /Boolean\(inviteToken \|\| accessToken \|\| setupMode\) && !setupComplete/
  );
  assert.match(login, /\{!registrationMode \? \([\s\S]*?<form onSubmit=\{login\}/);
  assert.match(
    login,
    /\{registrationMode \? \([\s\S]*?<form onSubmit=\{register\} className="space-y-4">/
  );
  assert.match(login, /replaceSetupUrlWithLoginUrl\(email\);/);
  assert.match(login, /url\.searchParams\.delete\("invite"\)/);
  assert.doesNotMatch(login, /showRegistration/);
});
