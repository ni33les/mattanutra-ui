import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  adminDashboardViews,
  adminRoleLabels,
  adminRoles,
  agentRoleLabels,
  agentRolePermissions,
  agentRoles,
  allowedAdminViews,
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

  it("keeps machine agents as separate RBAC principals", () => {
    assert.deepEqual(agentRoles, ["platform_agent", "retail_agent"]);
    assert.deepEqual(Object.keys(agentRoleLabels), agentRoles);
    assert.ok(agentRolePermissions.platform_agent.includes("tasks.write"));
    assert.ok(agentRolePermissions.platform_agent.includes("content.write"));
    assert.ok(agentRolePermissions.retail_agent.includes("tasks.write"));
    assert.equal(
      (agentRolePermissions.retail_agent as readonly string[]).includes("access.write"),
      false
    );
  });

  it("keeps platform owners first-class across every dashboard view", () => {
    const principal = {
      permissions: permissionsForRole("platform_owner"),
      role: "platform_owner" as const
    };

    assert.ok(adminDashboardViews.includes("access"));
    assert.ok(adminDashboardViews.includes("access-agents"));
    assert.ok(adminDashboardViews.includes("audit"));
    assert.ok(adminDashboardViews.includes("memberships"));
    assert.ok(adminDashboardViews.includes("settings"));

    for (const view of adminDashboardViews) {
      assert.equal(adminViewAllowed(principal, view), true, view);
    }
  });

  it("keeps retail operations out of the platform admin daily scope", () => {
    const principal = {
      permissions: permissionsForRole("platform_owner"),
      role: "platform_owner" as const
    };
    const platformViews = allowedAdminViews(principal, "platform");

    assert.equal(platformViews.includes("stock"), false);
    assert.equal(platformViews.includes("retail-financials"), false);
    assert.equal(platformViews.includes("settlements"), true);
    assert.equal(adminViewAllowed(principal, "stock", "platform"), false);
    assert.equal(adminViewAllowed(principal, "retail-financials", "platform"), false);
    assert.equal(adminViewAllowed(principal, "settlements", "platform"), true);
    assert.equal(adminViewAllowed(principal, "panya", "platform"), true);
    assert.equal(firstAllowedAdminView(principal, "glance", "platform"), "glance");
    assert.equal(adminViewAllowed(principal, "stock", "tenant"), true);
    assert.equal(adminViewAllowed(principal, "retail-financials", "tenant"), true);
    assert.equal(adminViewAllowed(principal, "settlements", "tenant"), false);
    assert.equal(adminViewAllowed(principal, "panya", "tenant"), false);
    assert.equal(
      allowedAdminViews(principal, "tenant").includes("retail-customer-orders"),
      true
    );
  });

  it("gives retail assistants read-only stock and basic settings only", () => {
    const agent = {
      permissions: permissionsForRole("retail_agent"),
      role: "retail_agent" as const
    };
    const principal = {
      permissions: permissionsForRole("retail_assistant"),
      role: "retail_assistant" as const
    };

    assert.equal(adminViewAllowed(agent, "financials"), false);
    assert.equal(adminViewAllowed(agent, "retail-financials"), false);
    assert.equal(adminViewAllowed(agent, "settlements"), false);
    assert.equal(
      (permissionsForRole("retail_agent") as readonly string[]).includes("finance.read"),
      false
    );
    assert.equal(adminViewAllowed(principal, "settings"), true);
    assert.equal(adminViewAllowed(principal, "retail-customer-orders"), true);
    assert.equal(adminViewAllowed(principal, "stock"), true);
    assert.equal(adminViewAllowed(principal, "glance"), false);
    assert.equal(adminViewAllowed(principal, "flow"), false);
    assert.equal(adminViewAllowed(principal, "access"), false);
    assert.equal(adminViewAllowed(principal, "access-agents"), false);
    assert.equal(adminViewAllowed(principal, "audit"), false);
    assert.equal(adminViewAllowed(principal, "memberships"), false);
    assert.equal(adminViewAllowed(principal, "financials"), false);
    assert.equal(adminViewAllowed(principal, "retail-financials"), false);
    assert.equal(adminViewAllowed(principal, "settlements"), false);
    assert.equal(adminViewAllowed(principal, "panya"), false);
    assert.equal(adminViewAllowed(principal, "products"), false);
    assert.equal(adminViewAllowed(principal, "visibility"), false);
    assert.equal(
      (permissionsForRole("retail_assistant") as readonly string[]).includes("stock.write"),
      false
    );
    assert.equal(firstAllowedAdminView(principal), "retail-customer-orders");
  });

  it("gives retail admins stock and retailer finance access while keeping platform access pages closed", () => {
    const principal = {
      permissions: permissionsForRole("retail_admin"),
      role: "retail_admin" as const
    };

    assert.equal(adminViewAllowed(principal, "settings"), true);
    assert.equal(adminViewAllowed(principal, "retail-customer-orders"), true);
    assert.equal(adminViewAllowed(principal, "stock"), true);
    assert.equal(adminViewAllowed(principal, "people"), false);
    assert.equal(adminViewAllowed(principal, "memberships"), false);
    assert.equal(adminViewAllowed(principal, "organisations"), false);
    assert.equal(adminViewAllowed(principal, "access"), false);
    assert.equal(adminViewAllowed(principal, "access-agents"), true);
    assert.equal(adminViewAllowed(principal, "audit"), false);
    assert.equal(adminViewAllowed(principal, "financials", "tenant"), false);
    assert.equal(adminViewAllowed(principal, "retail-financials", "tenant"), true);
    assert.equal(adminViewAllowed(principal, "settlements", "tenant"), false);
    assert.equal(adminViewAllowed(principal, "panya", "tenant"), false);
    assert.equal(adminViewAllowed(principal, "products"), false);
    assert.equal(adminViewAllowed(principal, "visibility"), false);
    assert.equal(
      (permissionsForRole("retail_admin") as readonly string[]).includes("finance.read"),
      true
    );
    assert.equal(
      (permissionsForRole("retail_admin") as readonly string[]).includes("stock.write"),
      true
    );
    assert.equal(firstAllowedAdminView(principal), "retail-customer-orders");
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
      /organisation_memberships_role_check CHECK \(\(\(principal_type = 'person'::text\) AND \(role = ANY \(ARRAY\['platform_owner'::text, 'platform_admin'::text, 'retail_admin'::text, 'retail_agent'::text, 'retail_assistant'::text\]\)\) OR \(\(principal_type = 'agent'::text\) AND \(role = ANY \(ARRAY\['platform_agent'::text, 'retail_agent'::text\]\)\)\)\)/
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

	  it("stores agent roles and credentials in first-class DB tables", () => {
	    const schema = readFileSync("db-schema.sql", "utf8");
	    const migration = readFileSync("scripts/admin-access-schema.ts", "utf8");

	    assert.match(schema, /CREATE TABLE public\.agent_credentials/);
	    assert.match(schema, /membership_id uuid REFERENCES public\.organisation_memberships\(id\) ON DELETE SET NULL/);
	    assert.match(schema, /credential_hash text NOT NULL/);
	    assert.match(schema, /display_prefix text NOT NULL/);
	    assert.match(schema, /agents_role_check CHECK \(\(role = ANY \(ARRAY\['platform_agent'::text, 'retail_agent'::text\]\)\)\)/);
	    assert.match(schema, /organisation_id uuid REFERENCES public\.organisations\(id\) ON DELETE SET NULL/);
	    assert.match(migration, /create table if not exists public\.agent_credentials/);
	    assert.match(migration, /add column if not exists membership_id uuid references public\.organisation_memberships\(id\) on delete set null/);
	    assert.match(migration, /organisation_memberships_agent_org_active_idx/);
	  });

	  it("makes task execution organisation-owned and membership-scoped", () => {
	    const schema = readFileSync("db-schema.sql", "utf8");
	    const migration = readFileSync("scripts/admin-access-schema.ts", "utf8");

	    assert.match(
	      schema,
	      /CREATE TABLE public\.tasks \([\s\S]*organisation_id uuid NOT NULL REFERENCES public\.organisations\(id\)/
	    );
	    assert.match(
	      schema,
	      /CREATE TABLE public\.worker_sessions \([\s\S]*membership_id uuid NOT NULL/
	    );
	    assert.match(
	      schema,
	      /CREATE TABLE public\.task_reservations \([\s\S]*membership_id uuid NOT NULL/
	    );
	    assert.match(schema, /worker_sessions_membership_instance_idx/);
	    assert.match(schema, /task_reservations_membership_idx/);
	    assert.match(schema, /worker_sessions_membership_id_fkey[\s\S]*ON DELETE RESTRICT/);
	    assert.match(schema, /task_reservations_membership_id_fkey[\s\S]*ON DELETE RESTRICT/);
	    assert.match(migration, /alter table public\.tasks\s+add column if not exists organisation_id uuid/);
	    assert.match(migration, /alter column organisation_id set not null/);
	    assert.match(migration, /foreign key \(organisation_id\) references public\.organisations\(id\)/);
	    assert.match(migration, /alter table public\.worker_sessions\s+add column if not exists membership_id uuid references public\.organisation_memberships\(id\) on delete restrict/);
	    assert.match(migration, /alter table public\.task_reservations\s+add column if not exists membership_id uuid references public\.organisation_memberships\(id\) on delete restrict/);
	  });

	  it("authenticates agent keys through active organisation memberships", () => {
	    const resolver = readFileSync("lib/access-principal.ts", "utf8");
	    const access = readFileSync("lib/admin-access.ts", "utf8");
	    const agents = readFileSync("lib/admin-access-agents.ts", "utf8");
	    const route = readFileSync("app/api/admin/access/route.ts", "utf8");
	    const accessView = readFileSync("components/admin/access-view.tsx", "utf8");
	    const stockPlanner = readFileSync("lib/retail-stock-planner-agent.ts", "utf8");
	    const stockPlannerScript = readFileSync("scripts/seed-retail-stock-planner-agent.ts", "utf8");
	    const taskService = readFileSync("lib/task-service.ts", "utf8");

	    assert.match(resolver, /join public\.organisation_memberships/);
	    assert.match(resolver, /organisation_memberships\.id = agent_credentials\.membership_id/);
	    assert.match(resolver, /organisation_memberships\.status = 'active'/);
	    assert.match(resolver, /membershipId: row\.membership_id/);
    // Agent lifecycle lives in admin-access-agents; facade re-exports from admin-access.
    assert.match(agents, /export async function inviteAgent/);
    assert.match(agents, /action: "admin\.agent_invited"/);
    assert.match(agents, /export async function addAgentMembership/);
    assert.match(agents, /action: "admin\.agent_membership_added"/);
    assert.match(agents, /export async function deleteAgentMembership/);
    assert.match(agents, /status = 'deleted'/);
	    assert.match(agents, /resourceType: "agent_credential"/);
    assert.match(access, /export \{\s*[\s\S]*inviteAgent[\s\S]*\} from "@\/lib\/admin-access-agents"/);
	    assert.match(route, /action === "invite_agent"/);
	    assert.match(route, /action === "add_agent_membership"/);
	    assert.match(route, /membershipId: text\(body\.membershipId\)/);
	    assert.match(accessView, /filteredMembershipAgents/);
	    assert.match(accessView, /setAddAgentAssociationOpen\(true\)/);
	    assert.match(accessView, /setSelectedAgentMembershipId\(agent\.membershipId\)/);
	    assert.match(stockPlanner, /export async function seedRetailStockPlannerAgent/);
	    assert.match(stockPlanner, /SYSTEM_AGENTS\.retailStockPlanner/);
	    assert.match(stockPlanner, /role = 'retail_agent'/);
	    assert.match(stockPlanner, /organisation_type = 'tenant'[\s\S]*status = 'active'/);
	    assert.match(stockPlanner, /principal_type,[\s\S]*agent_id,[\s\S]*role,[\s\S]*status/);
	    assert.match(stockPlanner, /credential_hash/);
	    assert.match(stockPlanner, /hashAdminToken\(apiKey\)/);
	    assert.match(stockPlanner, /generatedApiKey/);
	    assert.match(stockPlanner, /system\.retail_stock_planner_credential_generated/);
	    assert.match(stockPlannerScript, /seedRetailStockPlannerAgent\(sql\)/);
	    assert.match(taskService, /task_organisations\.organisation_type = 'platform'/);
	    assert.match(taskService, /tasks\.organisation_id = \$\{input\.accessScope\.organisationId\}::uuid/);
	  });

  it("maps admin access APIs to access permissions while leaving passkey auth public", () => {
    assert.equal(permissionForAdminRequest("GET", "/api/admin/auth/session"), null);
    assert.equal(permissionForAdminRequest("POST", "/api/admin/auth/logout"), null);
    assert.equal(permissionForAdminRequest("POST", "/api/admin/settings"), "settings.read");
    assert.equal(permissionForAdminRequest("GET", "/api/admin/retail-stock"), "stock.read");
    assert.equal(permissionForAdminRequest("POST", "/api/admin/retail-stock"), "stock.write");
    assert.equal(permissionForAdminRequest("GET", "/api/admin/access"), "access.read");
    assert.equal(permissionForAdminRequest("POST", "/api/admin/access"), "access.write");
    assert.equal(
      permissionForAdminRequest("POST", "/api/admin/impersonation/start"),
      "access.write"
    );
  });

  it("does not let impersonation turn a platform admin into a platform owner", () => {
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");

    assert.match(invites, /actor\.actorMembership\.role !== "platform_owner"/);
    assert.match(invites, /target\.role === "platform_owner"/);
    assert.match(invites, /Platform Admin cannot assume Platform Owner access/);
    assert.doesNotMatch(invites, /actor\.role !== "platform_owner"/);
  });

  it("does not let platform admins alter platform-owner people through invites", () => {
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const shared = readFileSync("lib/admin-access-shared.ts", "utf8");

    assert.match(shared, /function personHasPlatformOwnerMembership/);
    assert.match(
      invites,
      /createAdminInvitation[\s\S]*personHasPlatformOwnerMembership\(sql, existingPerson\.id\)/
    );
    assert.match(invites, /Platform Admin cannot change Platform Owner users/);
  });

  it("scopes retail admin access data and writes to the effective organisation", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const shared = readFileSync("lib/admin-access-shared.ts", "utf8");
    const route = readFileSync("app/api/admin/access/route.ts", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");

    assert.match(shared, /function scopedAccessOrganisationId/);
    assert.match(shared, /context\.effectiveOrganisation\.id/);
    assert.match(invites, /Retail admins can only invite people to their own organisation/);
    assert.match(invites, /Retail admins can only update memberships in their own organisation/);
    assert.match(invites, /Retail admins can only delete memberships in their own organisation/);
    assert.match(invites, /Retail admins can only delete invites in their own organisation/);
    assert.match(route, /getAdminAccessData\(context\)/);
    assert.match(page, /getAdminAccessData\(adminContext\)/);
    assert.match(route, /context\.effectiveOrganisation\.type !== "platform"/);
    assert.match(access, /export \{\s*[\s\S]*createAdminInvitation[\s\S]*\} from "@\/lib\/admin-access-invites"/);
  });

  it("keeps retail organisation settings separate from platform-only invites", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const shared = readFileSync("lib/admin-access-shared.ts", "utf8");
    const accessRoute = readFileSync("app/api/admin/access/route.ts", "utf8");
    const accessView = readFileSync("components/admin/access-view.tsx", "utf8");
    const settingsRoute = readFileSync("app/api/admin/settings/route.ts", "utf8");
    const settingsView = readFileSync("components/admin/settings-view.tsx", "utf8");

    assert.match(access, /export async function getAdminSettingsData/);
    assert.match(access, /export async function updateEffectiveOrganisationSettings/);
    assert.match(shared, /function normalOrganisationCurrency/);
    assert.match(shared, /function normalOrganisationCountry/);
	    assert.match(access, /currency = \$\{normalizedCurrency\}/);
	    assert.match(access, /country_code = \$\{normalizedCountryCode\}/);
    assert.match(access, /normalizeDispatchCity\(dispatchCity\)/);
    assert.match(access, /jsonb_build_object\('dispatchCity'/);
    assert.match(access, /returning id::text, slug, name, organisation_type, status, default_locale, country_code, currency, metadata/);
	    assert.match(access, /Only platform admins can update organisation currency/);
	    assert.match(access, /canEditCustomerPriceMargin/);
	    assert.match(access, /Customer margin can only be updated at platform level/);
	    assert.match(access, /metadata = case/);
	    assert.match(access, /when organisation_type = 'platform' then coalesce\(metadata, '\{\}'::jsonb\) \|\| \$\{sql\.json\(marginMetadataPatch\)\}::jsonb/);
	    assert.match(access, /else coalesce\(metadata, '\{\}'::jsonb\) - 'customerPriceMarginPercent'/);
	    assert.match(access, /context\.effectiveMembership\.role === "retail_admin"/);
    assert.match(accessRoute, /context\.actorMembership\.role !== "platform_owner"/);
    assert.match(accessRoute, /context\.actorMembership\.role !== "platform_admin"/);
    assert.match(accessRoute, /function currencyValue/);
    assert.match(accessRoute, /function countryValue/);
    assert.match(accessRoute, /const currency = currencyValue\(body\.currency, "THB"\)/);
    assert.match(accessRoute, /const countryCode = countryValue\(body\.countryCode, "TH"\)/);
    assert.match(accessRoute, /currency,/);
    assert.match(accessRoute, /countryCode,/);
    assert.match(accessRoute, /dispatchCity: text\(body\.dispatchCity\)/);
    assert.match(accessView, /supportedOrganisationCurrencies/);
    assert.match(accessView, /productCountryOptions/);
    assert.match(accessView, /organisationDispatchCityLabels/);
    assert.match(accessView, /currency: String\(form\.get\("currency"\) \?\? "THB"\)/);
    assert.match(accessView, /countryCode: String\(form\.get\("countryCode"\) \?\? "TH"\)/);
    assert.match(accessView, /dispatchCity: String\(form\.get\("dispatchCity"\) \?\? ""\)/);
    assert.match(accessView, /name="currency"/);
    assert.match(accessView, /name="countryCode"/);
    assert.match(accessView, /name="dispatchCity"/);
    assert.match(accessView, /defaultValue=\{organisation\.dispatchCity \?\? ""\}/);
    assert.match(accessView, /defaultValue=\{organisation\.currency\}/);
    assert.match(accessView, /defaultValue=\{organisation\.countryCode\}/);
    assert.match(accessView, /labels\.settings\.currency/);
	    assert.match(settingsRoute, /requireAdminRouteAccess\(\s*request,\s*"settings\.read"/);
	    assert.match(settingsRoute, /action === "update_organisation"/);
	    assert.match(settingsRoute, /currency: text\(body\.currency\)/);
	    assert.match(settingsRoute, /Object\.hasOwn\(body, "customerPriceMarginPercent"\)/);
	    assert.match(settingsView, /labels\.settings\.currency/);
	    assert.match(settingsView, /canEditCustomerPriceMargin/);
	    assert.match(settingsView, /\.\.\.\(canEditCustomerPriceMargin \? \{ customerPriceMarginPercent \} : \{\}\)/);
	    assert.match(settingsView, /showRetailPeople/);
    assert.match(settingsView, /settingsData\.people\.map/);
    assert.match(settingsView, /fetch\("\/api\/admin\/settings"/);
  });

  it("audits every successful RBAC mutation path with clear admin actions", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const agents = readFileSync("lib/admin-access-agents.ts", "utf8");
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const route = readFileSync("app/api/admin/access/route.ts", "utf8");
    const shared = readFileSync("components/admin/dashboard-shared.tsx", "utf8");

    assert.match(route, /await createOrganisation\(\{\s*actor: context/);
    assert.match(route, /await updateOrganisation\(\{\s*actor: context/);
    assert.match(access, /action: "admin\.organisation_created"/);
    assert.match(access, /action: "admin\.organisation_updated"/);
    assert.match(access, /action: "admin\.person_updated"/);
    assert.match(invites, /action: "admin\.membership_updated"/);
    assert.match(invites, /action: "admin\.membership_added"/);
    assert.match(invites, /action: "admin\.membership_deleted"/);
    assert.match(invites, /action: "admin\.invite_created"/);
    assert.match(invites, /action: "admin\.invite_deleted"/);
    assert.match(agents, /action: "admin\.agent_invited"/);
    assert.match(agents, /action: "admin\.agent_membership_added"/);
    assert.match(agents, /action: "admin\.agent_membership_updated"/);
    assert.match(agents, /action: "admin\.agent_credential_generated"/);
    assert.match(agents, /action: "admin\.agent_credential_revoked"/);
    assert.match(shared, /replaceAll\("\.", " "\)/);
  });

  it("expires and deletes pending admin invitations before they can be accepted", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const auth = readFileSync("lib/admin-access-auth.ts", "utf8");
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const shared = readFileSync("lib/admin-access-shared.ts", "utf8");
    const route = readFileSync("app/api/admin/access/route.ts", "utf8");

    assert.match(shared, /function expirePendingAdminInvitations/);
    assert.match(shared, /const inviteDays = 7/);
    assert.match(shared, /set status = 'expired', updated_at = now\(\)/);
    assert.match(access, /deleteAdminInvitation/);
    assert.match(invites, /export async function deleteAdminInvitation/);
    assert.match(invites, /status in \('pending', 'expired'\)/);
    assert.match(invites, /set status = 'revoked', updated_at = now\(\)/);
    assert.match(auth, /Registration invite expired or was deleted/);
    assert.match(route, /action === "delete_invitation"/);
    assert.match(route, /deleteAdminInvitation/);
  });

  it("soft deletes memberships with active-session and platform-owner safeguards", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const route = readFileSync("app/api/admin/access/route.ts", "utf8");
    const schema = readFileSync("scripts/admin-access-schema.ts", "utf8");
    const view = readFileSync("components/admin/access-view.tsx", "utf8");

    assert.match(access, /addAdminMembership/);
    assert.match(invites, /export async function addAdminMembership/);
    assert.match(invites, /Retail admins can only add memberships in their own organisation/);
    assert.match(route, /action === "add_membership"/);
    assert.match(route, /addAdminMembership/);
    assert.match(view, /labels\.access\.addMembership/);
    assert.match(view, /<option value="deleted">\{labels\.access\.deleted\}<\/option>/);
    assert.doesNotMatch(view, /labels\.access\.deleteMembership/);
    assert.match(invites, /export async function deleteAdminMembership/);
    assert.match(invites, /if \(status === "deleted"\)/);
    assert.match(invites, /status = 'deleted'/);
    assert.match(invites, /status <> 'deleted'/);
    assert.match(invites, /'deletedAt', now\(\)/);
    assert.match(invites, /'deletedStatus', status/);
    assert.match(invites, /metadata \? 'deletedAt'/);
    assert.doesNotMatch(invites, /delete from public\.organisation_memberships/);
    assert.match(schema, /organisation_memberships_status_check check \(status in \('active', 'deleted', 'disabled', 'invited'\)\)/);
    assert.match(schema, /set status = 'deleted'\s+where metadata \? 'deletedAt'/);
    assert.match(invites, /You cannot delete the active session membership/);
    assert.match(invites, /Platform Admin cannot change Platform Owner access/);
    assert.match(invites, /At least one active Platform Owner membership is required/);
    assert.match(invites, /action: "admin\.membership_deleted"/);
    assert.match(route, /status !== "deleted"/);
    assert.match(route, /action === "delete_membership"/);
    assert.match(route, /deleteAdminMembership/);
    assert.match(route, /membershipDeleted: true/);
  });

  it("stores admin access metadata as JSON objects, not encoded JSON strings", () => {
    const access = readFileSync("lib/admin-access.ts", "utf8");
    const auth = readFileSync("lib/admin-access-auth.ts", "utf8");
    const invites = readFileSync("lib/admin-access-invites.ts", "utf8");
    const surface = `${access}\n${auth}\n${invites}`;

    assert.doesNotMatch(surface, /JSON\.stringify\([^)]*metadata[^)]*\)::jsonb/);
    assert.match(surface, /\$\{sql\.json\(toJsonValue\(metadata \?\? \{\}\)\)\}::jsonb/);
  });
});
