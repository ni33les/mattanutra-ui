"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AdminAccessData,
  AdminClientSessionContext,
  AdminInviteExistingAccess,
  AdminInviteMembershipAdded,
  AgentCredentialCreated
} from "@/lib/admin-access";
import {
  agentRoles,
  rolesForAdminOrganisationType,
  type AgentRole,
  type AdminRole,
  type AdminOrganisationType
} from "@/lib/admin-rbac";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import type {
  AdminContent,
  AdminDashboardView
} from "@/components/admin/dashboard-content";
import {
  adminLocaleTextClass,
  classNames,
  formatGeneratedAt,
  readableToken
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";

type AdminAccessViewProps = Readonly<{
  accessToken: string;
  context: AdminClientSessionContext;
  data: AdminAccessData;
  labels: AdminContent;
  locale: Locale;
  view: Extract<
    AdminDashboardView,
    | "access"
    | "access-agents"
    | "audit"
    | "memberships"
    | "organisations"
    | "people"
  >;
}>;

const roleLabels = {
  en: {
    platform_owner: "Platform Owner",
    platform_admin: "Platform Admin",
    retail_admin: "Retail Admin",
    retail_agent: "Retail Agent",
    retail_assistant: "Retail Assistant"
  },
  th: {
    platform_owner: "เจ้าของแพลตฟอร์ม",
    platform_admin: "แอดมินแพลตฟอร์ม",
    retail_admin: "แอดมินร้านค้า",
    retail_agent: "เอเจนต์ร้านค้า",
    retail_assistant: "ผู้ช่วยร้านค้า"
  },
  "zh-CN": {
    platform_owner: "平台所有者",
    platform_admin: "平台管理员",
    retail_admin: "零售管理员",
    retail_agent: "零售代理",
    retail_assistant: "零售助理"
  }
} satisfies Record<Locale, Record<AdminRole, string>>;

const agentRoleLabels = {
  en: {
    platform_agent: "Platform Agent",
    retail_agent: "Retail Agent"
  },
  th: {
    platform_agent: "เอเจนต์แพลตฟอร์ม",
    retail_agent: "เอเจนต์ร้านค้า"
  },
  "zh-CN": {
    platform_agent: "平台代理",
    retail_agent: "零售代理"
  }
} satisfies Record<Locale, Record<AgentRole, string>>;

const agentTypes = ["system", "ai", "deterministic", "external", "human"] as const;

function Panel({
  action,
  children,
  title
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  title: string;
}>) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function statusLabel(labels: AdminContent, status: string) {
  if (status === "accepted") {
    return labels.access.accepted;
  }

  if (status === "active") {
    return labels.access.active;
  }

  if (status === "disabled") {
    return labels.access.disabled;
  }

  if (status === "deleted") {
    return labels.access.deleted;
  }

  if (status === "pending" || status === "invited") {
    return labels.access.pending;
  }

  if (status === "expired") {
    return labels.access.expired;
  }

  if (status === "revoked") {
    return labels.access.revoked;
  }

  return readableToken(status);
}

function agentStatusLabel(labels: AdminContent, status: string) {
  if (status === "active") {
    return labels.access.active;
  }

  if (status === "offline") {
    return labels.agents.offline;
  }

  if (status === "paused") {
    return labels.agents.paused;
  }

  if (status === "retired") {
    return labels.agents.retired;
  }

  return statusLabel(labels, status);
}

function statusClass(status: string) {
  if (status === "active" || status === "accepted") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }

  if (status === "disabled" || status === "revoked" || status === "expired") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-100";
}

function actionButtonClass(intent: "assume" | "delete" | "primary" | "save") {
  const base =
    "inline-flex min-w-[5.5rem] items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold ring-1 transition disabled:cursor-wait disabled:opacity-70";

  if (intent === "assume" || intent === "primary") {
    return classNames(
      base,
      "bg-[#1FA77A] text-white shadow-sm ring-transparent hover:bg-[#188B66]"
    );
  }

  if (intent === "delete") {
    return classNames(base, "bg-white text-red-700 ring-red-200 hover:bg-red-50");
  }

  return classNames(base, "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50");
}

async function postAccess(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/access", {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const json = (await response.json().catch(() => ({}))) as {
    data?: AdminAccessData;
    error?: string;
    existingAccess?: AdminInviteExistingAccess;
    credential?: AgentCredentialCreated;
    invitationDeleted?: boolean;
    inviteUrl?: string;
    membershipAdded?: AdminInviteMembershipAdded;
    membershipDeleted?: boolean;
    reloaded?: boolean;
  };

  if (!response.ok) {
    throw new Error(json.error || "Admin access update failed");
  }

  return json;
}

function rolesForOrganisationType(
  roles: readonly AdminRole[],
  type: AdminOrganisationType,
  canManageOwners: boolean
) {
  const allowed = new Set(rolesForAdminOrganisationType(type));

  return roles.filter((role) =>
    allowed.has(role) && (canManageOwners || role !== "platform_owner")
  );
}

function capabilitiesFromForm(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function agentRolesForOrganisationType(type: AdminOrganisationType): AgentRole[] {
  const allowed = new Set<AgentRole>(
    type === "platform" ? ["platform_agent"] : ["retail_agent"]
  );

  return agentRoles.filter((role) => allowed.has(role));
}

export function AdminAccessView({
  accessToken,
  context,
  data,
  labels,
  locale,
  view
}: AdminAccessViewProps) {
  const [accessData, setAccessData] = useState(data);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditPersonId, setAuditPersonId] = useState("");
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [addAgentAssociationOpen, setAddAgentAssociationOpen] = useState(false);
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [createOrganisationOpen, setCreateOrganisationOpen] = useState(false);
  const [createdCredential, setCreatedCredential] =
    useState<AgentCredentialCreated | null>(null);
  const [invitePersonOpen, setInvitePersonOpen] = useState(false);
  const [membershipFilterOrganisationId, setMembershipFilterOrganisationId] =
    useState("");
  const [agentFilterOrganisationId, setAgentFilterOrganisationId] = useState("");
  const [selectedAgentMembershipId, setSelectedAgentMembershipId] =
    useState<string | null>(null);
  const organisationById = useMemo(
    () => new Map(accessData.organisations.map((org) => [org.id, org])),
    [accessData.organisations]
  );
  const ownerPersonIds = useMemo(
    () =>
      new Set(
        accessData.memberships
          .filter((membership) => membership.role === "platform_owner")
          .map((membership) => membership.personId)
      ),
    [accessData.memberships]
  );
  const personById = useMemo(
    () => new Map(accessData.people.map((person) => [person.id, person])),
    [accessData.people]
  );
  const canWrite = context.permissions.includes("access.write");
  const canAssume = context.permissions.includes("impersonation.write") && !context.isLegacy;
  const canManageOwners = context.actorMembership.role === "platform_owner";
  const canAddMembership =
    canWrite &&
    (context.actorMembership.role === "platform_owner" ||
      context.actorMembership.role === "platform_admin");
  const canInvitePeople =
    canWrite &&
    (context.actorMembership.role === "platform_owner" ||
      context.actorMembership.role === "platform_admin");
  const canManageOrganisations =
    canWrite && context.effectiveOrganisation.type === "platform";
  const canFilterMembershipOrganisations =
    context.effectiveOrganisation.type === "platform" &&
    accessData.organisations.length > 1;
  const [inviteOrganisationId, setInviteOrganisationId] = useState(
    () => accessData.organisations[0]?.id ?? ""
  );
  const [membershipOrganisationId, setMembershipOrganisationId] = useState(
    () => accessData.organisations[0]?.id ?? ""
  );
  const [agentOrganisationId, setAgentOrganisationId] = useState(
    () => accessData.organisations[0]?.id ?? ""
  );
  const [agentAssociationOrganisationId, setAgentAssociationOrganisationId] =
    useState(() => accessData.organisations[0]?.id ?? "");
  const inviteOrganisation =
    organisationById.get(inviteOrganisationId) ?? accessData.organisations[0];
  const membershipOrganisation =
    organisationById.get(membershipOrganisationId) ?? accessData.organisations[0];
  const agentOrganisation =
    organisationById.get(agentOrganisationId) ?? accessData.organisations[0];
  const agentAssociationOrganisation =
    organisationById.get(agentAssociationOrganisationId) ??
    accessData.organisations[0];
  const inviteRoles = rolesForOrganisationType(
    accessData.roles,
    inviteOrganisation?.type ?? "tenant",
    canManageOwners
  );
  const addMembershipRoles = rolesForOrganisationType(
    accessData.roles,
    membershipOrganisation?.type ?? "tenant",
    canManageOwners
  );
  const addAgentRoles = agentRolesForOrganisationType(
    agentOrganisation?.type ?? "tenant"
  );
  const addAgentAssociationRoles = agentRolesForOrganisationType(
    agentAssociationOrganisation?.type ?? "tenant"
  );
  const uniqueAgents = useMemo(() => {
    const seen = new Set<string>();

    return accessData.agents.filter((agent) => {
      if (seen.has(agent.id)) {
        return false;
      }

      seen.add(agent.id);
      return true;
    });
  }, [accessData.agents]);
  const activePeople = useMemo(
    () => accessData.people.filter((person) => person.status === "active"),
    [accessData.people]
  );
  const filteredAuditEvents = useMemo(
    () =>
      auditPersonId
        ? accessData.auditEvents.filter(
            (event) =>
              event.actorPersonId === auditPersonId ||
              event.assumedPersonId === auditPersonId
          )
        : accessData.auditEvents,
    [accessData.auditEvents, auditPersonId]
  );
  const visibleInvitations = useMemo(
    () =>
      accessData.invitations.filter(
        (invite) => invite.status === "pending" || invite.status === "expired"
      ),
    [accessData.invitations]
  );
  const filteredMemberships = useMemo(
    () =>
      membershipFilterOrganisationId
        ? accessData.memberships.filter(
            (membership) =>
              membership.organisationId === membershipFilterOrganisationId
          )
        : accessData.memberships,
    [accessData.memberships, membershipFilterOrganisationId]
  );
  const filteredMembershipAgents = useMemo(
    () =>
      membershipFilterOrganisationId
        ? accessData.agents.filter(
            (agent) => agent.organisationId === membershipFilterOrganisationId
          )
        : accessData.agents,
    [accessData.agents, membershipFilterOrganisationId]
  );
  const filteredAgents = useMemo(
    () =>
      agentFilterOrganisationId
        ? accessData.agents.filter(
            (agent) => agent.organisationId === agentFilterOrganisationId
          )
        : accessData.agents,
    [accessData.agents, agentFilterOrganisationId]
  );
  const selectedAgent = useMemo(
    () =>
      selectedAgentMembershipId
        ? accessData.agents.find(
            (agent) => agent.membershipId === selectedAgentMembershipId
          ) ?? null
        : null,
    [accessData.agents, selectedAgentMembershipId]
  );
  const selectedAgentOrganisation = selectedAgent?.organisationId
    ? organisationById.get(selectedAgent.organisationId) ?? null
    : null;
  const selectedAgentRoles = selectedAgent
    ? agentRolesForOrganisationType(
        selectedAgentOrganisation?.type ??
          (selectedAgent.role === "platform_agent" ? "platform" : "tenant")
      )
    : [];
  const selectedAgentRoleOptions =
    selectedAgent && !selectedAgentRoles.includes(selectedAgent.role)
      ? [selectedAgent.role, ...selectedAgentRoles]
      : selectedAgentRoles;

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await postAccess({
        accessToken,
        ...body
      });

      if (result.data) {
        setAccessData(result.data);
      }

      if (result.credential) {
        setCreatedCredential(result.credential);
        setMessage(labels.access.updated);
      } else if (result.invitationDeleted) {
        setMessage(labels.access.invitationDeleted);
      } else if (result.membershipDeleted) {
        setMessage(labels.access.membershipDeleted);
      } else if (result.inviteUrl) {
        setMessage(`${labels.access.inviteUrl}: ${result.inviteUrl}`);
      } else if (result.membershipAdded) {
        setMessage(
          [
            labels.access.membershipAdded,
            result.membershipAdded.person.email,
            result.membershipAdded.organisation.name,
            roleLabels[locale][result.membershipAdded.membership.role]
          ].join(" · ")
        );
      } else if (result.existingAccess) {
        const message =
          result.existingAccess.reason === "inactive_person"
            ? labels.access.inactivePerson
            : labels.access.alreadyMember;
        const role = result.existingAccess.membership
          ? roleLabels[locale][result.existingAccess.membership.role]
          : "";

        setMessage(
          [
            message,
            result.existingAccess.person.email,
            result.existingAccess.organisation.name,
            role
          ].filter(Boolean).join(" · ")
        );
      } else {
        setMessage(labels.access.updated);
      }

      if (result.reloaded) {
        window.location.reload();
      }

      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : labels.access.error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const updated = await mutate({
      action: "create_organisation",
      defaultLocale: String(form.get("defaultLocale") ?? "en"),
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? "")
    });

    if (updated) {
      formElement.reset();
      setCreateOrganisationOpen(false);
    }
  }

  function saveOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") ?? "active");

    void mutate({
      action: "update_organisation",
      defaultLocale: String(form.get("defaultLocale") ?? "en"),
      name: String(form.get("name") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      slug: String(form.get("slug") ?? ""),
      status
    });
  }

  function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "update_person",
      displayName: String(form.get("displayName") ?? ""),
      personId: String(form.get("personId") ?? ""),
      preferredLocale: String(form.get("preferredLocale") ?? "en"),
      status: String(form.get("status") ?? "active")
    });
  }

  async function invitePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const updated = await mutate({
      action: "invite_person",
      email: String(form.get("email") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      preferredLocale: String(form.get("preferredLocale") ?? "en"),
      role: String(form.get("role") ?? inviteRoles[0] ?? "retail_assistant")
    });

    if (updated) {
      formElement.reset();
      setInvitePersonOpen(false);
    }
  }

  function deleteInvitation(invitationId: string) {
    void mutate({
      action: "delete_invitation",
      invitationId
    });
  }

  async function addMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const updated = await mutate({
      action: "add_membership",
      organisationId: String(form.get("organisationId") ?? ""),
      personId: String(form.get("personId") ?? ""),
      role: String(form.get("role") ?? addMembershipRoles[0] ?? "retail_assistant"),
      status: String(form.get("status") ?? "active")
    });

    if (updated) {
      formElement.reset();
      setAddMembershipOpen(false);
    }
  }

  async function addAgentAssociation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const updated = await mutate({
      action: "add_agent_membership",
      agentId: String(form.get("agentId") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      role: String(form.get("role") ?? addAgentAssociationRoles[0] ?? "retail_agent"),
      status: String(form.get("status") ?? "active")
    });

    if (updated) {
      formElement.reset();
      setAddAgentAssociationOpen(false);
    }
  }

  function saveMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "update_membership",
      membershipId: String(form.get("membershipId") ?? ""),
      role: String(form.get("role") ?? "retail_assistant"),
      status: String(form.get("status") ?? "active")
    });
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const updated = await mutate({
      action: "invite_agent",
      agentStatus: String(form.get("agentStatus") ?? "active"),
      capabilities: capabilitiesFromForm(form.get("capabilities")),
      membershipStatus: "invited",
      model: String(form.get("model") ?? ""),
      name: String(form.get("name") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      personId: String(form.get("personId") ?? ""),
      role: String(form.get("role") ?? addAgentRoles[0] ?? "retail_agent"),
      agentType: String(form.get("agentType") ?? "system")
    });

    if (updated) {
      formElement.reset();
      setAddAgentOpen(false);
    }
  }

  function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "update_agent",
      agentId: String(form.get("agentId") ?? ""),
      agentStatus: String(form.get("agentStatus") ?? "active"),
      capabilities: capabilitiesFromForm(form.get("capabilities")),
      membershipId: String(form.get("membershipId") ?? ""),
      membershipStatus: String(form.get("membershipStatus") ?? "active"),
      model: String(form.get("model") ?? ""),
      name: String(form.get("name") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      personId: String(form.get("personId") ?? ""),
      role: String(form.get("role") ?? "retail_agent"),
      status: String(form.get("agentStatus") ?? "active"),
      agentType: String(form.get("agentType") ?? "system")
    });
  }

  function generateCredential(membershipId: string) {
    void mutate({
      action: "generate_agent_credential",
      membershipId,
      label: "default"
    });
  }

  function revokeCredential(credentialId: string) {
    void mutate({
      action: "revoke_agent_credential",
      credentialId
    });
  }

  function rotateCredential(credentialId: string) {
    void mutate({
      action: "rotate_agent_credential",
      credentialId,
      label: "rotated"
    });
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl bg-[#20343A] p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#7DDDB8]">
              {labels.access.session}
            </p>
            <h2
              className={classNames(
                "mt-1 text-2xl font-bold",
                adminLocaleTextClass(locale, "heading")
              )}
            >
              {labels.access.actor}: {context.actorPerson.displayName}
            </h2>
            {context.assumedPerson ? (
              <p className="mt-1 text-sm text-white/75">
                {labels.access.assumed}: {context.assumedPerson.displayName} ·{" "}
                {roleLabels[locale][context.role]}
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/75">
                {context.actorOrganisation.name} · {roleLabels[locale][context.role]}
              </p>
            )}
          </div>
          {context.assumedPerson ? (
            <button
              className={actionButtonClass("save")}
              disabled={busy}
              onClick={() => void mutate({ action: "stop_impersonation" })}
              type="button"
            >
              {labels.access.stopAssuming}
            </button>
          ) : null}
        </div>
      </section>

      {message || error ? (
        <div
          className={classNames(
            "rounded-md px-3 py-2 text-sm font-medium ring-1",
            error
              ? "bg-red-50 text-red-700 ring-red-100"
              : "bg-emerald-50 text-emerald-700 ring-emerald-100"
          )}
        >
          {error || message}
        </div>
      ) : null}

      {view === "organisations" ? (
        <Panel
          action={
            canManageOrganisations ? (
              <button
                className={actionButtonClass("primary")}
                disabled={busy}
                onClick={() => setCreateOrganisationOpen(true)}
                type="button"
              >
                {labels.access.addOrganisation}
              </button>
            ) : null
          }
          title={labels.access.organisations}
        >
          <div className="divide-y divide-gray-100">
            {accessData.organisations.map((organisation) => (
              <form
                className="grid gap-3 py-4 lg:grid-cols-[1.2fr_1fr_0.9fr_0.9fr_auto]"
                key={organisation.id}
                onSubmit={saveOrganisation}
              >
                <input type="hidden" name="organisationId" value={organisation.id} />
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.name}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    defaultValue={organisation.name}
                    disabled={!canManageOrganisations || busy}
                    name="name"
                    required={true}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.slug}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    defaultValue={organisation.slug}
                    disabled={!canManageOrganisations || busy}
                    name="slug"
                    required={true}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.defaultLocale}
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    defaultValue={organisation.defaultLocale}
                    disabled={!canManageOrganisations || busy}
                    name="defaultLocale"
                  >
                    {publicLocales.map((localeCode) => (
                      <option key={localeCode} value={localeCode}>
                        {localeLabels[localeCode]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.status}
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    defaultValue={organisation.status}
                    disabled={!canManageOrganisations || busy}
                    name="status"
                  >
                    <option value="active">{labels.access.active}</option>
                    <option value="disabled">{labels.access.disabled}</option>
                    <option value="archived">{readableToken("archived")}</option>
                  </select>
                </label>
                {canManageOrganisations ? (
                  <button
                    className={classNames("self-end", actionButtonClass("save"))}
                    disabled={busy}
                    type="submit"
                  >
                    {labels.access.save}
                  </button>
                ) : null}
              </form>
            ))}
          </div>
        </Panel>
      ) : null}

      {createOrganisationOpen && canManageOrganisations ? (
        <AdminModal
          closeDisabled={busy}
          closeLabel={labels.contentPages.cancel}
          label={labels.access.addOrganisation}
          onClose={() => setCreateOrganisationOpen(false)}
          size="md"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {labels.access.addOrganisation}
            </span>
          }
        >
          <form className="grid gap-4 p-6" onSubmit={createOrganisation}>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.name}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="name"
                required={true}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.slug}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="slug"
                required={true}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.defaultLocale}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="defaultLocale"
              >
                {publicLocales.map((localeCode) => (
                  <option key={localeCode} value={localeCode}>
                    {localeLabels[localeCode]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                className={actionButtonClass("save")}
                disabled={busy}
                onClick={() => setCreateOrganisationOpen(false)}
                type="button"
              >
                {labels.contentPages.cancel}
              </button>
              <button
                className={actionButtonClass("primary")}
                disabled={busy}
                type="submit"
              >
                {labels.access.addOrganisation}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {view === "people" ? (
        <>
          <Panel
            action={
              canInvitePeople ? (
                <button
                  className={actionButtonClass("primary")}
                  disabled={busy}
                  onClick={() => setInvitePersonOpen(true)}
                  type="button"
                >
                  {labels.access.invite}
                </button>
              ) : null
            }
            title={labels.access.invitations}
          >
	          <div className="overflow-x-auto">
	            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500">
                    <th className="py-2 pr-4">{labels.access.email}</th>
                    <th className="py-2 pr-4">{labels.access.organisation}</th>
                    <th className="py-2 pr-4">{labels.access.role}</th>
                    <th className="py-2 pr-4">{labels.access.expiresAt}</th>
                    <th className="py-2 pr-4">{labels.access.status}</th>
                    <th className="py-2">{labels.contentPages.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleInvitations.slice(0, 8).map((invite) => (
                    <tr key={invite.id}>
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {invite.email}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {organisationById.get(invite.organisationId)?.name ??
                          labels.access.organisation}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {roleLabels[locale][invite.role]}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {formatGeneratedAt(invite.expiresAt, locale)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={classNames(
                            "inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1",
                            statusClass(invite.status)
                          )}
                        >
                          {statusLabel(labels, invite.status)}
                        </span>
                      </td>
                      <td className="py-3">
                        {canWrite &&
                        (invite.status === "pending" || invite.status === "expired") ? (
                          <button
                            aria-label={`${labels.access.deleteInvitation}: ${invite.email}`}
                            className={actionButtonClass("delete")}
                            disabled={busy}
                            onClick={() => deleteInvitation(invite.id)}
                            title={labels.access.deleteInvitation}
                            type="button"
                          >
                            {labels.contentPages.deleteAction}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {invitePersonOpen && canInvitePeople ? (
            <AdminModal
              closeDisabled={busy}
              closeLabel={labels.contentPages.cancel}
              label={labels.access.invitePerson}
              onClose={() => setInvitePersonOpen(false)}
              size="md"
              title={
                <span className={adminLocaleTextClass(locale, "heading")}>
                  {labels.access.invitePerson}
                </span>
              }
            >
              <form className="grid gap-4 p-6" onSubmit={invitePerson}>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.email}
                  <input
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    disabled={busy}
                    name="email"
                    required={true}
                    type="email"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">
                  {labels.access.organisation}
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                    disabled={busy || accessData.organisations.length === 0}
                    name="organisationId"
                    onChange={(event) => setInviteOrganisationId(event.target.value)}
                    required={true}
                    value={inviteOrganisationId}
                  >
                    {accessData.organisations.map((organisation) => (
                      <option key={organisation.id} value={organisation.id}>
                        {organisation.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.access.role}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={busy || inviteRoles.length === 0}
                      key={inviteOrganisationId}
                      name="role"
                    >
                      {inviteRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[locale][role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-gray-500">
                    {labels.access.preferredLocale}
                    <select
                      className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                      disabled={busy}
                      name="preferredLocale"
                    >
                      {publicLocales.map((localeCode) => (
                        <option key={localeCode} value={localeCode}>
                          {localeLabels[localeCode]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button
                    className={actionButtonClass("save")}
                    disabled={busy}
                    onClick={() => setInvitePersonOpen(false)}
                    type="button"
                  >
                    {labels.contentPages.cancel}
                  </button>
                  <button
                    className={actionButtonClass("primary")}
                    disabled={
                      busy ||
                      accessData.organisations.length === 0 ||
                      inviteRoles.length === 0
                    }
                    type="submit"
                  >
                    {labels.access.invite}
                  </button>
                </div>
              </form>
            </AdminModal>
          ) : null}

          <Panel title={labels.access.people}>
            <div className="divide-y divide-gray-100">
              {accessData.people.map((person) => {
                const personProtected = ownerPersonIds.has(person.id) && !canManageOwners;

                return (
                  <form
                    className="grid gap-3 py-4 lg:grid-cols-[1.3fr_1.5fr_0.9fr_0.9fr_auto]"
                    key={person.id}
                    onSubmit={savePerson}
                  >
                    <input type="hidden" name="personId" value={person.id} />
                    <label className="grid gap-1 text-xs font-semibold text-gray-500">
                      {labels.access.name}
                      <input
                        className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                        defaultValue={person.displayName}
                        disabled={!canWrite || busy || personProtected}
                        name="displayName"
                        required={true}
                      />
                    </label>
                    <div className="grid gap-1 text-xs font-semibold text-gray-500">
                      {labels.access.email}
                      <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600 ring-1 ring-inset ring-gray-200">
                        {person.email}
                      </div>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-gray-500">
                      {labels.access.preferredLocale}
                      <select
                        className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                        defaultValue={person.preferredLocale}
                        disabled={!canWrite || busy || personProtected}
                        name="preferredLocale"
                      >
                        {publicLocales.map((localeCode) => (
                          <option key={localeCode} value={localeCode}>
                            {localeLabels[localeCode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-gray-500">
                      {labels.access.status}
                      <select
                        className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                        defaultValue={person.status}
                        disabled={!canWrite || busy || personProtected}
                        name="status"
                      >
                        <option value="active">{labels.access.active}</option>
                        <option value="disabled">{labels.access.disabled}</option>
                        <option value="invited">{labels.access.pending}</option>
                      </select>
                    </label>
                    {canWrite ? (
                      <button
                        className={classNames("self-end", actionButtonClass("save"))}
                        disabled={busy || personProtected}
                        type="submit"
                      >
                        {labels.access.save}
                      </button>
                    ) : null}
                  </form>
                );
              })}
            </div>
          </Panel>
        </>
      ) : null}

      {view === "memberships" ? (
        <>
          {canFilterMembershipOrganisations ? (
            <label className="block max-w-sm text-xs font-semibold text-gray-500">
              {labels.access.filterByOrganisation}
              <select
                className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                onChange={(event) =>
                  setMembershipFilterOrganisationId(event.target.value)
                }
                value={membershipFilterOrganisationId}
              >
                <option value="">{labels.access.allOrganisations}</option>
                {accessData.organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <Panel
            action={
              canAddMembership ? (
                <button
                  className={actionButtonClass("primary")}
                  disabled={busy}
                  onClick={() => setAddMembershipOpen(true)}
                  type="button"
                >
                  {labels.access.addMembership}
                </button>
              ) : null
            }
            title={labels.access.people}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500">
                    <th className="py-2 pr-4">{labels.access.name}</th>
                    <th className="py-2 pr-4">{labels.access.organisation}</th>
                    <th className="py-2 pr-4">{labels.access.role}</th>
                    <th className="py-2 pr-4">{labels.access.status}</th>
                    <th className="py-2">{labels.contentPages.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMemberships.map((membership) => {
                    const person = personById.get(membership.personId);
                    const organisation = organisationById.get(membership.organisationId);
                    const membershipRoles = rolesForOrganisationType(
                      accessData.roles,
                      organisation?.type ?? "tenant",
                      canManageOwners
                    );
                    const availableMembershipRoles = membershipRoles.includes(
                      membership.role
                    )
                      ? membershipRoles
                      : [membership.role, ...membershipRoles];
                    const membershipProtected =
                      membership.role === "platform_owner" && !canManageOwners;
                    const membershipIsActiveSession =
                      membership.id === context.actorMembership.id ||
                      membership.id === context.effectiveMembership.id;
                    const membershipFormId = `membership-form-${membership.id}`;

                    return (
                      <tr key={membership.id}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-900">
                            {person?.displayName ?? labels.access.people}
                          </div>
                          <div className="text-xs text-gray-500">{person?.email}</div>
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {organisation?.name ?? labels.access.organisation}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-inset ring-gray-300"
                            defaultValue={membership.role}
                            disabled={!canWrite || busy || membershipProtected}
                            form={membershipFormId}
                            name="role"
                          >
                            {availableMembershipRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[locale][role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-inset ring-gray-300"
                            defaultValue={membership.status}
                            disabled={!canWrite || busy || membershipProtected}
                            form={membershipFormId}
                            name="status"
                          >
                            <option value="active">{labels.access.active}</option>
                            <option value="disabled">{labels.access.disabled}</option>
                            <option value="invited">{labels.access.pending}</option>
                            {!membershipProtected && !membershipIsActiveSession ? (
                              <option value="deleted">{labels.access.deleted}</option>
                            ) : null}
                          </select>
                        </td>
                        <td className="py-3">
                          <form id={membershipFormId} onSubmit={saveMembership}>
                            <input
                              type="hidden"
                              name="membershipId"
                              value={membership.id}
                            />
                          </form>
                          <div className="flex flex-wrap items-center gap-2">
                            {canWrite ? (
                              <button
                                className={actionButtonClass("save")}
                                disabled={busy || membershipProtected}
                                form={membershipFormId}
                                type="submit"
                              >
                                {labels.access.save}
                              </button>
                            ) : null}
                            {canAssume &&
                            membership.status === "active" &&
                            !membershipIsActiveSession &&
                            (membership.role !== "platform_owner" || canManageOwners) ? (
                              <button
                                className={actionButtonClass("assume")}
                                disabled={busy}
                                onClick={() =>
                                  void mutate({
                                    action: "assume_identity",
                                    membershipId: membership.id
                                  })
                                }
                                type="button"
                              >
                                {labels.access.assume}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            action={
              canManageOrganisations ? (
                <button
                  className={actionButtonClass("primary")}
                  disabled={busy || uniqueAgents.length === 0}
                  onClick={() => setAddAgentAssociationOpen(true)}
                  type="button"
                >
                  {labels.access.addAgentAssociation}
                </button>
              ) : null
            }
            title={labels.access.agents}
          >
              {filteredMembershipAgents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-500">
                        <th className="py-2 pr-4">{labels.access.name}</th>
                        <th className="py-2 pr-4">{labels.access.organisation}</th>
                        <th className="py-2 pr-4">{labels.access.role}</th>
                        <th className="py-2 pr-4">{labels.access.status}</th>
                        <th className="py-2 pr-4">{labels.agents.status}</th>
                        <th className="py-2 pr-4">{labels.access.credentials}</th>
                        <th className="py-2">{labels.contentPages.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMembershipAgents.map((agent) => {
                        const agentOrganisationRow = agent.organisationId
                          ? organisationById.get(agent.organisationId)
                          : null;

                        return (
                          <tr key={agent.membershipId}>
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-900">
                                {agent.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {readableToken(agent.type)}
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {agentOrganisationRow?.name ?? labels.access.organisation}
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {agentRoleLabels[locale][agent.role]}
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={classNames(
                                  "rounded-full px-2 py-1 text-xs font-medium ring-1",
                                  statusClass(agent.membershipStatus)
                                )}
                              >
                                {statusLabel(labels, agent.membershipStatus)}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={classNames(
                                  "rounded-full px-2 py-1 text-xs font-medium ring-1",
                                  statusClass(agent.status)
                                )}
                              >
                                {agentStatusLabel(labels, agent.status)}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {agent.credentialCount}
                            </td>
                            <td className="py-3">
                              <button
                                className={actionButtonClass("save")}
                                disabled={busy}
                                onClick={() =>
                                  setSelectedAgentMembershipId(agent.membershipId)
                                }
                                type="button"
                              >
                                {labels.access.details}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">{labels.agents.empty}</p>
              )}
          </Panel>
        </>
      ) : null}

      {addMembershipOpen && canAddMembership ? (
        <AdminModal
          closeDisabled={busy}
          closeLabel={labels.contentPages.cancel}
          label={labels.access.addMembership}
          onClose={() => setAddMembershipOpen(false)}
          size="lg"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {labels.access.addMembership}
            </span>
          }
        >
          <form className="grid gap-4 p-6" onSubmit={addMembership}>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.people}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy || activePeople.length === 0}
                name="personId"
                required={true}
              >
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName} · {person.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.organisation}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy || accessData.organisations.length === 0}
                name="organisationId"
                onChange={(event) => setMembershipOrganisationId(event.target.value)}
                required={true}
                value={membershipOrganisationId}
              >
                {accessData.organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.role}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  disabled={busy || addMembershipRoles.length === 0}
                  key={membershipOrganisationId}
                  name="role"
                >
                  {addMembershipRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[locale][role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue="active"
                  disabled={busy}
                  name="status"
                >
                  <option value="active">{labels.access.active}</option>
                  <option value="disabled">{labels.access.disabled}</option>
                  <option value="invited">{labels.access.pending}</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                className={actionButtonClass("save")}
                disabled={busy}
                onClick={() => setAddMembershipOpen(false)}
                type="button"
              >
                {labels.contentPages.cancel}
              </button>
              <button
                className={actionButtonClass("primary")}
                disabled={
                  busy ||
                  activePeople.length === 0 ||
                  accessData.organisations.length === 0 ||
                  addMembershipRoles.length === 0
                }
                type="submit"
              >
                {labels.access.addMembership}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {addAgentAssociationOpen && canManageOrganisations ? (
        <AdminModal
          closeDisabled={busy}
          closeLabel={labels.contentPages.cancel}
          label={labels.access.addAgentAssociation}
          onClose={() => setAddAgentAssociationOpen(false)}
          size="lg"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {labels.access.addAgentAssociation}
            </span>
          }
        >
          <form className="grid gap-4 p-6" onSubmit={addAgentAssociation}>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.agents}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy || uniqueAgents.length === 0}
                name="agentId"
                required={true}
              >
                {uniqueAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} · {readableToken(agent.type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.organisation}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy || accessData.organisations.length === 0}
                name="organisationId"
                onChange={(event) =>
                  setAgentAssociationOrganisationId(event.target.value)
                }
                required={true}
                value={agentAssociationOrganisationId}
              >
                {accessData.organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.role}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  disabled={busy || addAgentAssociationRoles.length === 0}
                  key={agentAssociationOrganisationId}
                  name="role"
                >
                  {addAgentAssociationRoles.map((role) => (
                    <option key={role} value={role}>
                      {agentRoleLabels[locale][role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue="active"
                  disabled={busy}
                  name="status"
                >
                  <option value="active">{labels.access.active}</option>
                  <option value="disabled">{labels.access.disabled}</option>
                  <option value="invited">{labels.access.pending}</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                className={actionButtonClass("save")}
                disabled={busy}
                onClick={() => setAddAgentAssociationOpen(false)}
                type="button"
              >
                {labels.contentPages.cancel}
              </button>
              <button
                className={actionButtonClass("primary")}
                disabled={
                  busy ||
                  uniqueAgents.length === 0 ||
                  accessData.organisations.length === 0 ||
                  addAgentAssociationRoles.length === 0
                }
                type="submit"
              >
                {labels.access.addAgentAssociation}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {view === "access-agents" ? (
        <Panel
          action={
            canManageOrganisations ? (
              <button
                className={actionButtonClass("primary")}
                disabled={busy}
                onClick={() => setAddAgentOpen(true)}
                type="button"
              >
                {labels.access.addAgent}
              </button>
            ) : null
          }
          title={labels.access.agents}
        >
          <label className="mb-4 block max-w-sm text-xs font-semibold text-gray-500">
            {labels.access.filterByOrganisation}
            <select
              className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
              onChange={(event) => setAgentFilterOrganisationId(event.target.value)}
              value={agentFilterOrganisationId}
            >
              <option value="">{labels.access.allOrganisations}</option>
              {accessData.organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </label>

          {filteredAgents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500">
                    <th className="py-2 pr-4">{labels.access.name}</th>
                    <th className="py-2 pr-4">{labels.access.organisation}</th>
                    <th className="py-2 pr-4">{labels.access.role}</th>
                    <th className="py-2 pr-4">{labels.access.status}</th>
                    <th className="py-2 pr-4">{labels.agents.status}</th>
                    <th className="py-2 pr-4">{labels.access.grokModel}</th>
                    <th className="py-2 pr-4">{labels.access.credentials}</th>
                    <th className="py-2">{labels.contentPages.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAgents.map((agent) => {
                    const agentOrganisationRow = agent.organisationId
                      ? organisationById.get(agent.organisationId)
                      : null;

                    return (
                      <tr key={agent.membershipId}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-900">
                            {agent.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {readableToken(agent.type)}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {agentOrganisationRow?.name ?? labels.access.organisation}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {agentRoleLabels[locale][agent.role]}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={classNames(
                              "rounded-full px-2 py-1 text-xs font-medium ring-1",
                              statusClass(agent.membershipStatus)
                            )}
                          >
                            {statusLabel(labels, agent.membershipStatus)}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={classNames(
                              "rounded-full px-2 py-1 text-xs font-medium ring-1",
                              statusClass(agent.status)
                            )}
                          >
                            {agentStatusLabel(labels, agent.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {agent.grokModel ?? agent.model ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {agent.credentialCount}
                        </td>
                        <td className="py-3">
                          <button
                            className={actionButtonClass("save")}
                            disabled={busy}
                            onClick={() =>
                              setSelectedAgentMembershipId(agent.membershipId)
                            }
                            type="button"
                          >
                            {labels.access.details}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{labels.agents.empty}</p>
          )}
        </Panel>
      ) : null}

      {selectedAgent ? (
        <AdminModal
          closeDisabled={busy}
          closeLabel={labels.contentPages.cancel}
          label={labels.access.details}
          onClose={() => setSelectedAgentMembershipId(null)}
          size="2xl"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {selectedAgent.name}
            </span>
          }
        >
          <div className="space-y-6 p-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-100">
                <div className="text-xs font-semibold text-gray-500">
                  {labels.access.model}
                </div>
                <div className="mt-1 break-words text-sm font-medium text-gray-900">
                  {selectedAgent.model ?? "-"}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-100">
                <div className="text-xs font-semibold text-gray-500">
                  {labels.access.grokModel}
                </div>
                <div className="mt-1 break-words text-sm font-medium text-gray-900">
                  {selectedAgent.grokModel ?? "-"}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-100">
                <div className="text-xs font-semibold text-gray-500">
                  {labels.access.reasoningLevel}
                </div>
                <div className="mt-1 break-words text-sm font-medium text-gray-900">
                  {selectedAgent.reasoningLevel ?? "-"}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {labels.access.prompt}
              </h3>
              {selectedAgent.prompt ? (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-4 text-xs leading-5 text-white">
                  {selectedAgent.prompt}
                </pre>
              ) : (
                <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 ring-1 ring-gray-100">
                  {labels.access.noPrompt}
                </p>
              )}
            </div>

            <form
              className="grid gap-4 border-t border-gray-100 pt-5 lg:grid-cols-12"
              id={`agent-form-${selectedAgent.membershipId}`}
              key={selectedAgent.membershipId}
              onSubmit={saveAgent}
            >
              <input name="agentId" type="hidden" value={selectedAgent.id} />
              <input
                name="membershipId"
                type="hidden"
                value={selectedAgent.membershipId}
              />
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.name}
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.name}
                  disabled={!canManageOrganisations || busy}
                  name="name"
                  required={true}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.organisation}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.organisationId ?? ""}
                  disabled={!canManageOrganisations || busy}
                  name="organisationId"
                  required={true}
                >
                  {accessData.organisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>
                      {organisation.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.role}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.role}
                  disabled={!canManageOrganisations || busy}
                  name="role"
                >
                  {selectedAgentRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {agentRoleLabels[locale][role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.membershipStatus}
                  disabled={!canManageOrganisations || busy}
                  name="membershipStatus"
                >
                  <option value="active">{labels.access.active}</option>
                  <option value="disabled">{labels.access.disabled}</option>
                  <option value="invited">{labels.access.pending}</option>
                  <option value="deleted">{labels.access.deleted}</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.agents.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.status}
                  disabled={!canManageOrganisations || busy}
                  name="agentStatus"
                >
                  <option value="active">{labels.access.active}</option>
                  <option value="paused">{labels.agents.paused}</option>
                  <option value="retired">{labels.agents.retired}</option>
                  {selectedAgent.status === "offline" ? (
                    <option value="offline">{labels.agents.offline}</option>
                  ) : null}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.type}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.type}
                  disabled={!canManageOrganisations || busy}
                  name="agentType"
                >
                  {agentTypes.map((type) => (
                    <option key={type} value={type}>
                      {readableToken(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.owner}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.personId ?? ""}
                  disabled={!canManageOrganisations || busy}
                  name="personId"
                >
                  <option value="">{labels.access.platform}</option>
                  {accessData.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName} · {person.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-3">
                {labels.access.model}
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.model ?? ""}
                  disabled={!canManageOrganisations || busy}
                  name="model"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500 lg:col-span-12">
                {labels.access.capabilities}
                <textarea
                  className="min-h-24 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue={selectedAgent.capabilities.join("\n")}
                  disabled={!canManageOrganisations || busy}
                  name="capabilities"
                />
              </label>
              <div className="flex justify-end gap-2 lg:col-span-12">
                <button
                  className={actionButtonClass("save")}
                  disabled={busy}
                  onClick={() => setSelectedAgentMembershipId(null)}
                  type="button"
                >
                  {labels.contentPages.cancel}
                </button>
                {canManageOrganisations ? (
                  <button
                    className={actionButtonClass("save")}
                    disabled={busy}
                    type="submit"
                  >
                    {labels.access.save}
                  </button>
                ) : null}
              </div>
            </form>

            <div className="border-t border-gray-100 pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {labels.access.credentials}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedAgent.credentialCount} {labels.access.credentials} ·{" "}
                    {statusLabel(labels, selectedAgent.membershipStatus)}
                  </p>
                </div>
                {canManageOrganisations &&
                selectedAgent.membershipStatus === "active" &&
                selectedAgent.status === "active" ? (
                  <button
                    className={actionButtonClass("primary")}
                    disabled={busy}
                    onClick={() => generateCredential(selectedAgent.membershipId)}
                    type="button"
                  >
                    {labels.access.generateKey}
                  </button>
                ) : null}
              </div>
              {selectedAgent.credentials.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-500">
                        <th className="py-2 pr-4">{labels.access.keyLabel}</th>
                        <th className="py-2 pr-4">{labels.access.status}</th>
                        <th className="py-2 pr-4">{labels.access.createdAt}</th>
                        <th className="py-2 pr-4">{labels.access.lastUsedAt}</th>
                        <th className="py-2">{labels.contentPages.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedAgent.credentials.map((credential) => (
                        <tr key={credential.id}>
                          <td className="py-2 pr-4">
                            <div className="font-medium text-gray-900">
                              {credential.label ?? labels.access.keyLabel}
                            </div>
                            <div className="text-xs text-gray-500">
                              {credential.displayPrefix}
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={classNames(
                                "rounded-full px-2 py-1 text-xs font-medium ring-1",
                                statusClass(credential.status)
                              )}
                            >
                              {statusLabel(labels, credential.status)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-600">
                            {formatGeneratedAt(credential.createdAt, locale)}
                          </td>
                          <td className="py-2 pr-4 text-gray-600">
                            {credential.lastUsedAt
                              ? formatGeneratedAt(credential.lastUsedAt, locale)
                              : "-"}
                          </td>
                          <td className="py-2">
                            {canManageOrganisations &&
                            credential.status === "active" ? (
                              <div className="flex flex-wrap gap-2">
                                {selectedAgent.membershipStatus === "active" &&
                                selectedAgent.status === "active" ? (
                                  <button
                                    className={actionButtonClass("save")}
                                    disabled={busy}
                                    onClick={() => rotateCredential(credential.id)}
                                    type="button"
                                  >
                                    {labels.access.rotateKey}
                                  </button>
                                ) : null}
                                <button
                                  className={actionButtonClass("delete")}
                                  disabled={busy}
                                  onClick={() => revokeCredential(credential.id)}
                                  type="button"
                                >
                                  {labels.access.revokeKey}
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  {labels.access.noCredentials}
                </p>
              )}
            </div>
          </div>
        </AdminModal>
      ) : null}

      {addAgentOpen && canManageOrganisations ? (
        <AdminModal
          closeDisabled={busy}
          closeLabel={labels.contentPages.cancel}
          label={labels.access.addAgent}
          onClose={() => setAddAgentOpen(false)}
          size="lg"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {labels.access.addAgent}
            </span>
          }
        >
          <form className="grid gap-4 p-6" onSubmit={createAgent}>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.name}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="name"
                required={true}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.organisation}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  disabled={busy || accessData.organisations.length === 0}
                  name="organisationId"
                  onChange={(event) => setAgentOrganisationId(event.target.value)}
                  required={true}
                  value={agentOrganisationId}
                >
                  {accessData.organisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>
                      {organisation.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.role}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  disabled={busy}
                  key={agentOrganisationId}
                  name="role"
                >
                  {addAgentRoles.map((role) => (
                    <option key={role} value={role}>
                      {agentRoleLabels[locale][role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.status}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue="active"
                  disabled={busy}
                  name="agentStatus"
                >
                  <option value="active">{labels.access.active}</option>
                  <option value="paused">{labels.agents.paused}</option>
                  <option value="retired">{labels.agents.retired}</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.type}
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  defaultValue="system"
                  disabled={busy}
                  name="agentType"
                >
                  {agentTypes.map((type) => (
                    <option key={type} value={type}>
                      {readableToken(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-gray-500">
                {labels.access.model}
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                  disabled={busy}
                  name="model"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.owner}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="personId"
              >
                <option value="">{labels.access.platform}</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName} · {person.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.capabilities}
              <textarea
                className="min-h-28 rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
                disabled={busy}
                name="capabilities"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                className={actionButtonClass("save")}
                disabled={busy}
                onClick={() => setAddAgentOpen(false)}
                type="button"
              >
                {labels.contentPages.cancel}
              </button>
              <button
                className={actionButtonClass("primary")}
                disabled={busy || accessData.organisations.length === 0}
                type="submit"
              >
                {labels.access.addAgent}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {createdCredential ? (
        <AdminModal
          closeLabel={labels.contentPages.cancel}
          label={labels.access.apiKey}
          onClose={() => setCreatedCredential(null)}
          size="lg"
          title={
            <span className={adminLocaleTextClass(locale, "heading")}>
              {labels.access.apiKey}
            </span>
          }
        >
          <div className="space-y-4 p-6">
            <p className="text-sm text-gray-600">{labels.access.keyShownOnce}</p>
            <code className="block break-all rounded-md bg-gray-950 p-4 text-sm font-semibold text-white">
              {createdCredential.apiKey}
            </code>
            <div className="flex justify-end">
              <button
                className={actionButtonClass("primary")}
                onClick={() => setCreatedCredential(null)}
                type="button"
              >
                {labels.contentPages.cancel}
              </button>
            </div>
          </div>
        </AdminModal>
      ) : null}

      {view === "audit" ? (
        <Panel title={labels.access.audit}>
          <label className="mb-4 block max-w-sm text-xs font-semibold text-gray-500">
            {labels.access.filterByPerson}
            <select
              className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300"
              onChange={(event) => setAuditPersonId(event.target.value)}
              value={auditPersonId}
            >
              <option value="">{labels.access.allPeople}</option>
              {accessData.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName} · {person.email}
                </option>
              ))}
            </select>
          </label>
          <div className="divide-y divide-gray-100">
            {filteredAuditEvents.map((event) => (
              <div key={event.id} className="py-3 text-sm">
                <div className="font-medium text-gray-900">
                  {readableToken(event.action)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatGeneratedAt(event.createdAt, locale)}
                  {event.actorPersonId
                    ? ` · ${personById.get(event.actorPersonId)?.displayName ?? event.actorPersonId}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
