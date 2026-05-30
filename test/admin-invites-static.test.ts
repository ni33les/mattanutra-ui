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
