import type { AdminDashboardView } from "@/components/admin/dashboard-content";

export type AdminPermission =
  | "access.read"
  | "access.agents.read"
  | "access.write"
  | "agents.read"
  | "agents.write"
  | "alerts.read"
  | "alerts.write"
  | "catalogue.read"
  | "catalogue.write"
  | "communications.read"
  | "communications.write"
  | "content.read"
  | "content.write"
  | "finance.read"
  | "impersonation.write"
  | "marketing.read"
  | "performance.read"
  | "performance.write"
  | "reviews.read"
  | "reviews.write"
  | "settings.read"
  | "stock.read"
  | "stock.write"
  | "tasks.read"
  | "tasks.write";

export const adminRoles = [
  "platform_owner",
  "platform_admin",
  "retail_admin",
  "retail_agent",
  "retail_assistant"
] as const;

export type AdminRole = (typeof adminRoles)[number];

export type AdminOrganisationType = "platform" | "tenant";
export type AgentRole = "platform_agent" | "retail_agent";

export type AdminSessionPrincipal = Readonly<{
  permissions: readonly AdminPermission[];
  role: AdminRole;
}>;

export type AgentPrincipal = Readonly<{
  agentId: string;
  capabilities: readonly string[];
  membershipId: string;
  organisationId: string;
  permissions: readonly AdminPermission[];
  role: AgentRole;
}>;

const allPermissions = [
  "access.read",
  "access.agents.read",
  "access.write",
  "agents.read",
  "agents.write",
  "alerts.read",
  "alerts.write",
  "catalogue.read",
  "catalogue.write",
  "communications.read",
  "communications.write",
  "content.read",
  "content.write",
  "finance.read",
  "impersonation.write",
  "marketing.read",
  "performance.read",
  "performance.write",
  "reviews.read",
  "reviews.write",
  "settings.read",
  "stock.read",
  "stock.write",
  "tasks.read",
  "tasks.write"
] as const satisfies readonly AdminPermission[];

export const adminRolePermissions = {
  platform_owner: allPermissions,
  platform_admin: allPermissions,
  retail_admin: ["access.agents.read", "settings.read", "stock.read", "stock.write"],
  retail_agent: ["settings.read", "stock.read", "stock.write"],
  retail_assistant: ["settings.read", "stock.read"]
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export const adminRoleLabels = {
  platform_owner: "Platform Owner",
  platform_admin: "Platform Admin",
  retail_admin: "Retail Admin",
  retail_agent: "Retail Agent",
  retail_assistant: "Retail Assistant"
} as const satisfies Record<AdminRole, string>;

export const platformAdminRoles = [
  "platform_owner",
  "platform_admin"
] as const satisfies readonly AdminRole[];
export const retailAdminRoles = [
  "retail_admin",
  "retail_agent",
  "retail_assistant"
] as const satisfies readonly AdminRole[];
export const agentRoles = [
  "platform_agent",
  "retail_agent"
] as const satisfies readonly AgentRole[];
export const agentRoleLabels = {
  platform_agent: "Platform Agent",
  retail_agent: "Retail Agent"
} as const satisfies Record<AgentRole, string>;
export const agentRolePermissions = {
  platform_agent: [
    "agents.read",
    "alerts.read",
    "alerts.write",
    "catalogue.read",
    "catalogue.write",
    "communications.read",
    "communications.write",
    "content.read",
    "content.write",
    "marketing.read",
    "performance.read",
    "performance.write",
    "reviews.read",
    "reviews.write",
    "tasks.read",
    "tasks.write"
  ],
  retail_agent: [
    "communications.read",
    "communications.write",
    "settings.read",
    "stock.read",
    "stock.write",
    "tasks.read",
    "tasks.write"
  ]
} as const satisfies Record<AgentRole, readonly AdminPermission[]>;
const platformRoleSet = new Set<AdminRole>(platformAdminRoles);
const retailRoleSet = new Set<AdminRole>(retailAdminRoles);

export function rolesForAdminOrganisationType(type: AdminOrganisationType) {
  return type === "tenant" ? retailAdminRoles : platformAdminRoles;
}

export function adminRoleAllowedForOrganisationType(
  role: AdminRole,
  type: AdminOrganisationType
) {
  return type === "tenant"
    ? retailRoleSet.has(role)
    : platformRoleSet.has(role);
}

export function normalizeAdminRole(
  role: string | null | undefined,
  organisationType: AdminOrganisationType = "tenant"
): AdminRole {
  if (isAdminRole(role)) {
    return role;
  }

  if (role === "admin" && organisationType === "platform") {
    return "platform_admin";
  }

  if (role === "tenant" && organisationType === "tenant") {
    return "retail_admin";
  }

  return organisationType === "platform" ? "platform_admin" : "retail_assistant";
}

const adminViews = [
  "glance",
  "flow",
  "financials",
  "campaigns",
  "leads",
  "communications",
  "blogs",
  "testimonials",
  "foods",
  "products",
  "stock",
  "supplements",
  "reviews",
  "agents",
  "alerts",
  "content",
  "product-insights",
  "supplement-insights",
  "visibility",
  "people",
  "memberships",
  "organisations",
  "access-agents",
  "audit",
  "access",
  "settings"
] as const satisfies readonly AdminDashboardView[];

export const adminDashboardViews = adminViews;

export function isAdminDashboardView(value: unknown): value is AdminDashboardView {
  return typeof value === "string" && adminViews.includes(value as AdminDashboardView);
}

export function permissionsForRole(role: string | null | undefined) {
  return role && isAdminRole(role) ? adminRolePermissions[role] : [];
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && value in adminRolePermissions;
}

export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && value in agentRolePermissions;
}

export function normalizeAgentRole(
  role: string | null | undefined,
  organisationType: AdminOrganisationType = "platform"
): AgentRole {
  if (isAgentRole(role)) {
    return role;
  }

  return organisationType === "platform" ? "platform_agent" : "retail_agent";
}

export function permissionsForAgentRole(role: string | null | undefined) {
  return role && isAgentRole(role) ? agentRolePermissions[role] : [];
}

export function hasAdminPermission(
  principal: AdminSessionPrincipal | null | undefined,
  permission: AdminPermission
) {
  return Boolean(principal?.permissions.includes(permission));
}

export function adminViewPermission(view: AdminDashboardView): AdminPermission {
  if (view === "access-agents") {
    return "access.agents.read";
  }

  if (
    view === "access" ||
    view === "audit" ||
    view === "memberships" ||
    view === "organisations" ||
    view === "people"
  ) {
    return "access.read";
  }

  if (view === "agents") {
    return "agents.read";
  }

  if (view === "alerts") {
    return "alerts.read";
  }

  if (view === "blogs" || view === "content" || view === "testimonials") {
    return "content.read";
  }

  if (view === "campaigns" || view === "leads") {
    return "marketing.read";
  }

  if (view === "communications") {
    return "communications.read";
  }

  if (view === "financials") {
    return "finance.read";
  }

  if (
    view === "foods" ||
    view === "product-insights" ||
    view === "products" ||
    view === "supplement-insights" ||
    view === "supplements"
  ) {
    return "catalogue.read";
  }

  if (view === "reviews") {
    return "reviews.read";
  }

  if (view === "stock") {
    return "stock.read";
  }

  if (view === "visibility") {
    return "tasks.read";
  }

  if (view === "settings") {
    return "settings.read";
  }

  return "performance.read";
}

export function allowedAdminViews(principal: AdminSessionPrincipal) {
  return adminDashboardViews.filter((view) =>
    hasAdminPermission(principal, adminViewPermission(view))
  );
}

export function firstAllowedAdminView(
  principal: AdminSessionPrincipal,
  fallback: AdminDashboardView = "glance"
) {
  return (
    allowedAdminViews(principal).find(
      (view) => view !== "access" && view !== "access-agents"
    ) ?? fallback
  );
}

export function adminViewAllowed(
  principal: AdminSessionPrincipal,
  view: AdminDashboardView
) {
  return hasAdminPermission(principal, adminViewPermission(view));
}

export function permissionForAdminRequest(
  method: string,
  pathname: string
): AdminPermission | null {
  const write = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (pathname.startsWith("/api/admin/auth/")) {
    return null;
  }

  if (
    pathname.startsWith("/api/admin/settings")
  ) {
    return "settings.read";
  }

  if (pathname.startsWith("/api/admin/retail-stock")) {
    return write ? "stock.write" : "stock.read";
  }

  if (
    pathname.startsWith("/api/admin/access") ||
    pathname.startsWith("/api/admin/impersonation")
  ) {
    return write ? "access.write" : "access.read";
  }

  if (pathname.startsWith("/api/admin/agents")) {
    return write ? "agents.write" : "agents.read";
  }

  if (pathname.startsWith("/api/admin/alerts")) {
    return write ? "alerts.write" : "alerts.read";
  }

  if (pathname.startsWith("/api/admin/communications")) {
    return write ? "communications.write" : "communications.read";
  }

  if (
    pathname.startsWith("/api/admin/content") ||
    pathname.startsWith("/api/admin/blog")
  ) {
    return write ? "content.write" : "content.read";
  }

  if (pathname.startsWith("/api/admin/conversion-targets")) {
    return write ? "performance.write" : "performance.read";
  }

  if (pathname.startsWith("/api/admin/query/")) {
    const view = pathname.split("/").pop();

    if (view === "content") {
      return "content.read";
    }

    if (view === "products" || view === "supplements" || view === "product-recommendations") {
      return "catalogue.read";
    }

    if (view === "agents") {
      return "agents.read";
    }

    if (view === "alerts") {
      return "alerts.read";
    }

    if (view === "communications") {
      return "communications.read";
    }

    if (view === "tasks") {
      return "tasks.read";
    }

    if (view === "reviews") {
      return "reviews.read";
    }

    if (view === "campaigns" || view === "leads") {
      return "marketing.read";
    }

    return "performance.read";
  }

  if (
    pathname.startsWith("/api/admin/foods") ||
    pathname.startsWith("/api/admin/product") ||
    pathname.startsWith("/api/admin/supplements")
  ) {
    return write ? "catalogue.write" : "catalogue.read";
  }

  if (pathname.startsWith("/api/admin/review-tasks")) {
    return write ? "reviews.write" : "reviews.read";
  }

  if (pathname.startsWith("/api/admin/tasks")) {
    return write ? "tasks.write" : "tasks.read";
  }

  if (pathname.startsWith("/api/admin/visibility")) {
    return "tasks.read";
  }

  return null;
}
