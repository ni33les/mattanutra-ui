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
  const invites = source("lib/admin-access-invites.ts");
  const route = source("app/api/admin/access/route.ts");
  const view = source("components/admin/access-view.tsx");

  assert.match(access, /createAdminInvitation/);
  assert.match(invites, /existingAccess/);
  assert.match(invites, /membershipAdded/);
  assert.match(invites, /admin\.invite_existing_member_blocked/);
  assert.match(invites, /admin\.membership_added/);
  assert.doesNotMatch(invites, /role\s*=\s*excluded\.role/);
  assert.match(route, /const invitationResult = await createAdminInvitation/);
  assert.match(route, /accessResponse\(request, context, invitationResult\)/);
  assert.match(view, /labels\.access\.alreadyMember/);
  assert.match(view, /labels\.access\.membershipAdded/);
});

test("admin invites can recover existing members who still need a passkey", () => {
  const invites = source("lib/admin-access-invites.ts");
  const auth = source("lib/admin-access-auth.ts");

  assert.match(invites, /admin_passkey_credentials credentials/);
  assert.match(invites, /passkeyCount < 1/);
  assert.match(invites, /shouldCreatePasskeyInviteForExistingMember = true/);
  assert.match(invites, /admin\.invite_existing_member_passkey/);
  // Invited membership activation on first passkey registration lives in auth.
  assert.match(auth, /when public\.organisation_memberships\.status = 'invited' then excluded\.role/);
  assert.match(auth, /when public\.organisation_memberships\.status = 'invited' then 'active'/);
  assert.doesNotMatch(invites, /role\s*=\s*excluded\.role/);
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
