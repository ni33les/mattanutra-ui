import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  adminDashboardViews,
  adminRoleLabels,
  adminRoles,
  adminViewAllowed,
  firstAllowedAdminView,
  adminRoleAllowedForOrganisationType,
  normalizeAdminRole,
  permissionForAdminRequest,
  permissionsForRole,
  rolesForAdminOrganisationType
} from "../lib/admin-rbac.ts";

describe("admin RBAC", () => {
  it("uses the five canonical admin roles in stable privilege order", () => {
    const canonicalRoles = [
      "platform_owner",
      "platform_admin",
      "retail_admin",
      "retail_agent",
      "retail_assistant"
    ];

    assert.deepEqual(adminRoles, canonicalRoles);
    assert.deepEqual(Object.keys(adminRoleLabels), canonicalRoles);
  });

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
    assert.equal(firstAllowedAdminView(principal), "settings");
  });

  it("lets retail admins manage scoped access without opening global operating views", () => {
    const principal = {
      permissions: permissionsForRole("retail_admin"),
      role: "retail_admin" as const
    };

    assert.equal(adminViewAllowed(principal, "people"), true);
    assert.equal(adminViewAllowed(principal, "organisations"), true);
    assert.equal(adminViewAllowed(principal, "settings"), true);
    assert.equal(adminViewAllowed(principal, "financials"), false);
    assert.equal(adminViewAllowed(principal, "products"), false);
    assert.equal(adminViewAllowed(principal, "visibility"), false);
    assert.equal(firstAllowedAdminView(principal), "people");
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

  it("keeps runtime role normalization on the canonical owner/admin/retail model", () => {
    const source = readFileSync("lib/admin-rbac.ts", "utf8");

    assert.equal(normalizeAdminRole("admin", "platform"), "platform_admin");
    assert.equal(normalizeAdminRole("admin", "tenant"), "retail_assistant");
    assert.equal(normalizeAdminRole("tenant", "tenant"), "retail_admin");
    assert.doesNotMatch(
      source,
      /agent_manager|catalogue_manager|content_manager|finance_viewer|ops_manager|platform_viewer|tenant_admin|tenant_user|'viewer'/
    );
  });

  it("keeps canonical database role constraints to platform and retail roles only", () => {
    const source = readFileSync("db-schema.sql", "utf8");

    assert.match(
      source,
      /organisation_memberships_role_check CHECK \(\(role = ANY \(ARRAY\['platform_owner'::text, 'platform_admin'::text, 'retail_admin'::text, 'retail_agent'::text, 'retail_assistant'::text\]\)\)\)/
    );
    assert.match(
      source,
      /admin_invitations_role_check CHECK \(\(role = ANY \(ARRAY\['platform_owner'::text, 'platform_admin'::text, 'retail_admin'::text, 'retail_agent'::text, 'retail_assistant'::text\]\)\)\)/
    );
    assert.doesNotMatch(
      source,
      /agent_manager|catalogue_manager|content_manager|finance_viewer|ops_manager|platform_viewer|tenant_admin|tenant_user|'viewer'::text/
    );
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

  it("does not let impersonation turn a platform admin into a platform owner", () => {
    const source = readFileSync("lib/admin-access.ts", "utf8");

    assert.match(source, /actor\.actorMembership\.role !== "platform_owner"/);
    assert.match(source, /target\.role === "platform_owner"/);
    assert.match(source, /Platform Admin cannot assume Platform Owner access/);
    assert.doesNotMatch(source, /actor\.role !== "platform_owner"/);
  });

  it("does not let platform admins alter platform-owner people through invites", () => {
    const source = readFileSync("lib/admin-access.ts", "utf8");

    assert.match(source, /function personHasPlatformOwnerMembership/);
    assert.match(
      source,
      /createAdminInvitation[\s\S]*personHasPlatformOwnerMembership\(sql, existingPerson\.id\)/
    );
    assert.match(source, /Platform Admin cannot change Platform Owner users/);
  });

  it("scopes retail admin access data and writes to the effective organisation", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const route = readFileSync("app/api/admin/access/route.ts", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");

    assert.match(access, /function scopedAccessOrganisationId/);
    assert.match(access, /context\.effectiveOrganisation\.id/);
    assert.match(access, /Retail admins can only invite people to their own organisation/);
    assert.match(access, /Retail admins can only update memberships in their own organisation/);
    assert.match(route, /getAdminAccessData\(context\)/);
    assert.match(page, /getAdminAccessData\(adminContext\)/);
    assert.match(route, /context\.effectiveOrganisation\.type !== "platform"/);
  });

  it("stores admin access metadata as JSON objects, not encoded JSON strings", () => {
    const source = readFileSync("lib/admin-access.ts", "utf8");

    assert.doesNotMatch(source, /JSON\.stringify\([^)]*metadata[^)]*\)::jsonb/);
    assert.match(source, /\$\{sql\.json\(toJsonValue\(metadata \?\? \{\}\)\)\}::jsonb/);
  });
});
