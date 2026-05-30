"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AdminAccessData,
  AdminClientSessionContext,
  AdminInviteExistingAccess,
  AdminInviteMembershipAdded
} from "@/lib/admin-access";
import {
  rolesForAdminOrganisationType,
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
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [createOrganisationOpen, setCreateOrganisationOpen] = useState(false);
  const [invitePersonOpen, setInvitePersonOpen] = useState(false);
  const [membershipFilterOrganisationId, setMembershipFilterOrganisationId] =
    useState("");
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
  const inviteOrganisation =
    organisationById.get(inviteOrganisationId) ?? accessData.organisations[0];
  const membershipOrganisation =
    organisationById.get(membershipOrganisationId) ?? accessData.organisations[0];
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

      if (result.invitationDeleted) {
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
          title={labels.access.memberships}
        >
          {canFilterMembershipOrganisations ? (
            <label className="mb-4 block max-w-sm text-xs font-semibold text-gray-500">
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
                          <input type="hidden" name="membershipId" value={membership.id} />
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

      {view === "access-agents" ? (
        <Panel title={labels.access.agents}>
          <div className="divide-y divide-gray-100">
            {accessData.agents.map((agent) => (
              <div key={agent.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-gray-900">{agent.name}</div>
                  <span
                    className={classNames(
                      "rounded-full px-2 py-1 text-xs font-medium ring-1",
                      statusClass(agent.status)
                    )}
                  >
                    {statusLabel(labels, agent.status)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {readableToken(agent.type)} ·{" "}
                  {agent.organisationId
                    ? organisationById.get(agent.organisationId)?.name
                    : labels.access.platform}
                  {agent.personId ? ` · ${personById.get(agent.personId)?.displayName ?? ""}` : ""}
                </div>
                {agent.capabilities.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {agent.capabilities.map((capability) => (
                      <span
                        className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
                        key={capability}
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
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
