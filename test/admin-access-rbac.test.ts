import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  adminDashboardViews,
  adminViewAllowed,
  adminRoleAllowedForOrganisationType,
  permissionForAdminRequest,
  permissionsForRole,
  rolesForAdminOrganisationType
} from "../lib/admin-rbac.ts";

describe("admin RBAC", () => {
  it("keeps platform owners first-class across every dashboard view", () => {
    const principal = {
      permissions: permissionsForRole("platform_owner"),
      role: "platform_owner" as const
    };

    assert.ok(adminDashboardViews.includes("access"));
    assert.ok(adminDashboardViews.includes("access-agents"));
    assert.ok(adminDashboardViews.includes("audit"));
    assert.ok(adminDashboardViews.includes("settings"));

    for (const view of adminDashboardViews) {
      assert.equal(adminViewAllowed(principal, view), true, view);
    }
  });

  it("keeps retail assistants out of access, finance, catalogue and execution views", () => {
    const principal = {
      permissions: permissionsForRole("retail_assistant"),
      role: "retail_assistant" as const
    };

    assert.equal(adminViewAllowed(principal, "settings"), true);
    assert.equal(adminViewAllowed(principal, "glance"), false);
    assert.equal(adminViewAllowed(principal, "flow"), false);
    assert.equal(adminViewAllowed(principal, "access"), false);
    assert.equal(adminViewAllowed(principal, "access-agents"), false);
    assert.equal(adminViewAllowed(principal, "audit"), false);
    assert.equal(adminViewAllowed(principal, "financials"), false);
    assert.equal(adminViewAllowed(principal, "products"), false);
    assert.equal(adminViewAllowed(principal, "visibility"), false);
  });

  it("limits assignable roles to platform owner/admin and retail org roles", () => {
    assert.deepEqual(rolesForAdminOrganisationType("platform"), [
      "platform_owner",
      "platform_admin"
    ]);
    assert.deepEqual(rolesForAdminOrganisationType("tenant"), [
      "retail_admin",
      "retail_agent",
      "retail_assistant"
    ]);
    assert.equal(adminRoleAllowedForOrganisationType("platform_owner", "tenant"), false);
    assert.equal(adminRoleAllowedForOrganisationType("platform_admin", "tenant"), false);
    assert.equal(adminRoleAllowedForOrganisationType("retail_admin", "platform"), false);
  });

  it("maps admin access APIs to access permissions while leaving passkey auth public", () => {
    assert.equal(permissionForAdminRequest("GET", "/api/admin/auth/session"), null);
    assert.equal(permissionForAdminRequest("POST", "/api/admin/auth/logout"), null);
    assert.equal(permissionForAdminRequest("GET", "/api/admin/access"), "access.read");
    assert.equal(permissionForAdminRequest("POST", "/api/admin/access"), "access.write");
    assert.equal(
      permissionForAdminRequest("POST", "/api/admin/impersonation/start"),
      "access.write"
    );
  });

  it("stores admin access metadata as JSON objects, not encoded JSON strings", () => {
    const source = readFileSync("lib/admin-access.ts", "utf8");

    assert.doesNotMatch(source, /JSON\.stringify\([^)]*metadata[^)]*\)::jsonb/);
    assert.match(source, /\$\{sql\.json\(toJsonValue\(metadata \?\? \{\}\)\)\}::jsonb/);
  });
});
