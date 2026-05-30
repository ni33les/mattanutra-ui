import type { Locale } from "@/lib/i18n";
import type {
  AdminOrganisationType,
  AdminPermission,
  AdminRole
} from "@/lib/admin-rbac";

export type AdminAccessStatus = "active" | "deleted" | "disabled" | "invited";

export type AdminOrganisation = Readonly<{
  defaultLocale: Locale;
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived" | "disabled";
  type: AdminOrganisationType;
}>;

export type AdminPerson = Readonly<{
  displayName: string;
  email: string;
  id: string;
  preferredLocale: Locale;
  status: AdminAccessStatus;
}>;

export type AdminMembership = Readonly<{
  id: string;
  organisationId: string;
  personId: string;
  role: AdminRole;
  status: AdminAccessStatus;
  title: string | null;
}>;

export type AdminInvitation = Readonly<{
  email: string;
  expiresAt: string;
  id: string;
  organisationId: string;
  preferredLocale: Locale;
  role: AdminRole;
  status: "accepted" | "expired" | "pending" | "revoked";
}>;

export type AdminInviteExistingAccess = Readonly<{
  membership: AdminMembership | null;
  organisation: AdminOrganisation;
  person: AdminPerson;
  reason: "existing_membership" | "inactive_person";
}>;

export type AdminInviteMembershipAdded = Readonly<{
  membership: AdminMembership;
  organisation: AdminOrganisation;
  person: AdminPerson;
}>;

export type AdminAuditEvent = Readonly<{
  action: string;
  actorPersonId: string | null;
  assumedPersonId: string | null;
  createdAt: string;
  id: string;
  organisationId: string | null;
  resourceId: string | null;
  resourceType: string | null;
}>;

export type AdminAccessAgent = Readonly<{
  capabilities: string[];
  id: string;
  name: string;
  organisationId: string | null;
  personId: string | null;
  status: string;
  type: string;
}>;

export type AdminAccessData = Readonly<{
  agents: AdminAccessAgent[];
  auditEvents: AdminAuditEvent[];
  invitations: AdminInvitation[];
  memberships: AdminMembership[];
  organisations: AdminOrganisation[];
  people: AdminPerson[];
  roleLabels: Record<AdminRole, string>;
  roles: AdminRole[];
}>;

export type AdminSettingsPerson = Readonly<{
  displayName: string;
  email: string;
  id: string;
  membershipStatus: AdminAccessStatus;
  preferredLocale: Locale;
  role: AdminRole;
  status: AdminAccessStatus;
  title: string | null;
}>;

export type AdminSettingsData = Readonly<{
  canEditOrganisation: boolean;
  organisation: AdminOrganisation;
  people: AdminSettingsPerson[];
}>;

export type AdminSessionContext = Readonly<{
  actorMembership: AdminMembership;
  actorOrganisation: AdminOrganisation;
  actorPerson: AdminPerson;
  assumedMembership: AdminMembership | null;
  assumedOrganisation: AdminOrganisation | null;
  assumedPerson: AdminPerson | null;
  csrfToken: string | null;
  effectiveMembership: AdminMembership;
  effectiveOrganisation: AdminOrganisation;
  effectivePerson: AdminPerson;
  expiresAt: string;
  isLegacy: boolean;
  permissions: AdminPermission[];
  role: AdminRole;
  sessionCookie: string | null;
  sessionId: string | null;
}>;

export type AdminClientSessionContext = Omit<
  AdminSessionContext,
  "csrfToken" | "sessionCookie"
>;
