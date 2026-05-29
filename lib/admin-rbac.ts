import type { AdminDashboardView } from "@/components/admin/dashboard-content";

export type AdminPermission =
  | "access.read"
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
  | "tasks.read"
  | "tasks.write";

export type AdminRole =
  | "agent_manager"
  | "catalogue_manager"
  | "content_manager"
  | "finance_viewer"
  | "ops_manager"
  | "platform_admin"
  | "platform_owner"
  | "platform_viewer"
  | "tenant_admin"
  | "tenant_user"
  | "viewer";

export type AdminSessionPrincipal = Readonly<{
  permissions: readonly AdminPermission[];
  role: AdminRole;
}>;

const allPermissions = [
  "access.read",
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
  "tasks.read",
  "tasks.write"
] as const satisfies readonly AdminPermission[];

export const adminRolePermissions = {
  agent_manager: [
    "agents.read",
    "agents.write",
    "tasks.read",
    "tasks.write",
    "performance.read"
  ],
  catalogue_manager: [
    "catalogue.read",
    "catalogue.write",
    "reviews.read",
    "reviews.write",
    "performance.read"
  ],
  content_manager: [
    "content.read",
    "content.write",
    "marketing.read",
    "performance.read"
  ],
  finance_viewer: ["finance.read", "performance.read"],
  ops_manager: [
    "agents.read",
    "alerts.read",
    "alerts.write",
    "communications.read",
    "communications.write",
    "performance.read",
    "reviews.read",
    "reviews.write",
    "tasks.read",
    "tasks.write"
  ],
  platform_admin: allPermissions.filter(
    (permission) => permission !== "access.write"
  ),
  platform_owner: allPermissions,
  platform_viewer: [
    "agents.read",
    "alerts.read",
    "catalogue.read",
    "communications.read",
    "content.read",
    "finance.read",
    "marketing.read",
    "performance.read",
    "reviews.read",
    "tasks.read"
  ],
  tenant_admin: [
    "agents.read",
    "communications.read",
    "performance.read",
    "reviews.read",
    "tasks.read"
  ],
  tenant_user: ["performance.read"],
  viewer: ["performance.read"]
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export const adminRoleLabels = {
  agent_manager: "Agent manager",
  catalogue_manager: "Catalogue manager",
  content_manager: "Content manager",
  finance_viewer: "Finance viewer",
  ops_manager: "Operations manager",
  platform_admin: "Platform admin",
  platform_owner: "Platform owner",
  platform_viewer: "Platform viewer",
  tenant_admin: "Tenant admin",
  tenant_user: "Tenant user",
  viewer: "Viewer"
} as const satisfies Record<AdminRole, string>;

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
  "reviews",
  "agents",
  "alerts",
  "content",
  "product-insights",
  "supplement-insights",
  "visibility",
  "access",
  "access-agents",
  "audit",
  "people",
  "organisations"
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

export function hasAdminPermission(
  principal: AdminSessionPrincipal | null | undefined,
  permission: AdminPermission
) {
  return Boolean(principal?.permissions.includes(permission));
}

export function adminViewPermission(view: AdminDashboardView): AdminPermission {
  if (
    view === "access" ||
    view === "access-agents" ||
    view === "audit" ||
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

  if (view === "visibility") {
    return "tasks.read";
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
  return allowedAdminViews(principal)[0] ?? fallback;
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
