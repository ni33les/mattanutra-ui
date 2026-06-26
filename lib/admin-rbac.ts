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
  | "panya.read"
  | "panya.write"
  | "reviews.read"
  | "reviews.write"
  | "settings.read"
  | "shipments.configure"
  | "shipments.read"
  | "shipments.write"
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
  "panya.read",
  "panya.write",
  "reviews.read",
  "reviews.write",
  "settings.read",
  "shipments.configure",
  "shipments.read",
  "shipments.write",
  "stock.read",
  "stock.write",
  "tasks.read",
  "tasks.write"
] as const satisfies readonly AdminPermission[];

export const adminRolePermissions = {
  platform_owner: allPermissions,
  platform_admin: allPermissions,
  retail_admin: [
    "access.agents.read",
    "communications.read",
    "communications.write",
    "finance.read",
    "settings.read",
    "shipments.configure",
    "shipments.read",
    "shipments.write",
    "stock.read",
    "stock.write"
  ],
  retail_agent: [
    "communications.read",
    "communications.write",
    "settings.read",
    "shipments.read",
    "shipments.write",
    "stock.read",
    "stock.write"
  ],
  retail_assistant: ["settings.read", "shipments.read", "stock.read"]
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
    "shipments.configure",
    "shipments.read",
    "shipments.write",
    "tasks.read",
    "tasks.write"
  ],
  retail_agent: [
    "communications.read",
    "communications.write",
    "settings.read",
    "shipments.read",
    "shipments.write",
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
  "supplements",
  "retail-customer-orders",
  "retail-financials",
  "stock",
  "retail-stock-advice",
  "retail-reorder",
  "retail-fulfillment",
  "retail-movements",
  "retail-audit",
  "reviews",
  "agents",
  "alerts",
  "content",
  "coverage-improvement-insights",
  "customer-insights",
  "product-insights",
  "supplement-insights",
  "visibility",
  "people",
  "panya",
  "memberships",
  "organisations",
  "access-agents",
  "audit",
  "access",
  "settings",
  "settlements"
] as const satisfies readonly AdminDashboardView[];

export const adminDashboardViews = adminViews;

export const retailOperationViews = [
  "retail-customer-orders",
  "retail-financials",
  "stock",
  "retail-stock-advice",
  "retail-reorder",
  "retail-fulfillment",
  "retail-movements",
  "retail-audit"
] as const satisfies readonly AdminDashboardView[];
const retailOperationViewSet = new Set<AdminDashboardView>(retailOperationViews);

function adminViewAvailableForOrganisation(
  view: AdminDashboardView,
  organisationType?: AdminOrganisationType
) {
  if (organisationType === "platform") {
    return !retailOperationViewSet.has(view);
  }

  return organisationType === "tenant"
    ? view !== "financials" && view !== "panya" && view !== "settlements"
    : true;
}

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

  if (
    view === "campaigns" ||
    view === "coverage-improvement-insights" ||
    view === "customer-insights" ||
    view === "product-insights" ||
    view === "supplement-insights" ||
    view === "leads"
  ) {
    return "marketing.read";
  }

  if (view === "communications") {
    return "communications.read";
  }

  if (view === "panya") {
    return "panya.read";
  }

  if (
    view === "financials" ||
    view === "retail-financials" ||
    view === "settlements"
  ) {
    return "finance.read";
  }

  if (
    view === "foods" ||
    view === "products" ||
    view === "supplements"
  ) {
    return "catalogue.read";
  }

  if (view === "reviews") {
    return "reviews.read";
  }

  if (
    view === "stock" ||
    view === "retail-audit" ||
    view === "retail-movements" ||
    view === "retail-customer-orders" ||
    view === "retail-fulfillment" ||
    view === "retail-stock-advice" ||
    view === "retail-reorder"
  ) {
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

export function allowedAdminViews(
  principal: AdminSessionPrincipal,
  organisationType?: AdminOrganisationType
) {
  return adminDashboardViews.filter((view) =>
    hasAdminPermission(principal, adminViewPermission(view)) &&
    adminViewAvailableForOrganisation(view, organisationType)
  );
}

export function firstAllowedAdminView(
  principal: AdminSessionPrincipal,
  fallback: AdminDashboardView = "glance",
  organisationType?: AdminOrganisationType
) {
  if (
    (principal.role === "retail_admin" ||
      principal.role === "retail_agent" ||
      principal.role === "retail_assistant") &&
    adminViewAllowed(principal, "retail-customer-orders", organisationType)
  ) {
    return "retail-customer-orders";
  }

  return (
    allowedAdminViews(principal, organisationType).find(
      (view) => view !== "access" && view !== "access-agents"
    ) ?? fallback
  );
}

export function adminViewAllowed(
  principal: AdminSessionPrincipal,
  view: AdminDashboardView,
  organisationType?: AdminOrganisationType
) {
  return hasAdminPermission(principal, adminViewPermission(view)) &&
    adminViewAvailableForOrganisation(view, organisationType);
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

  if (pathname.startsWith("/api/admin/panya")) {
    return write ? "panya.write" : "panya.read";
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

    if (view === "panya") {
      return "panya.read";
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
