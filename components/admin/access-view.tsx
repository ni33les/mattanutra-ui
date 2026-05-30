"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  KeyIcon,
  UserGroupIcon
} from "@heroicons/react/24/outline";
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

type AdminAccessViewProps = Readonly<{
  accessToken: string;
  context: AdminClientSessionContext;
  data: AdminAccessData;
  labels: AdminContent;
  locale: Locale;
  view: Extract<
    AdminDashboardView,
    "access" | "access-agents" | "audit" | "organisations" | "people"
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
  children,
  title
}: Readonly<{
  children: ReactNode;
  title: string;
}>) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function statusLabel(labels: AdminContent, status: string) {
  if (status === "active") {
    return labels.access.active;
  }

  if (status === "disabled") {
    return labels.access.disabled;
  }

  if (status === "pending" || status === "invited") {
    return labels.access.pending;
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
    inviteUrl?: string;
    membershipAdded?: AdminInviteMembershipAdded;
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
  const canManageOrganisations =
    canWrite && context.effectiveOrganisation.type === "platform";
  const [inviteOrganisationId, setInviteOrganisationId] = useState(
    () => accessData.organisations[0]?.id ?? ""
  );
  const inviteOrganisation =
    organisationById.get(inviteOrganisationId) ?? accessData.organisations[0];
  const inviteRoles = rolesForOrganisationType(
    accessData.roles,
    inviteOrganisation?.type ?? "tenant",
    canManageOwners
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

      if (result.inviteUrl) {
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
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : labels.access.error);
    } finally {
      setBusy(false);
    }
  }

  function createOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "create_organisation",
      defaultLocale: String(form.get("defaultLocale") ?? "en"),
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? "")
    });
    event.currentTarget.reset();
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

  function invitePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "invite_person",
      email: String(form.get("email") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      preferredLocale: String(form.get("preferredLocale") ?? "en"),
      role: String(form.get("role") ?? inviteRoles[0] ?? "retail_assistant")
    });
    event.currentTarget.reset();
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
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#20343A] shadow-sm hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
              disabled={busy}
              onClick={() => void mutate({ action: "stop_impersonation" })}
              type="button"
            >
              <ArrowPathIcon aria-hidden={true} className="size-4" />
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
        <Panel title={labels.access.organisations}>
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
                    className="self-end rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
                    disabled={busy}
                    type="submit"
                  >
                    {labels.access.save}
                  </button>
                ) : null}
              </form>
            ))}
          </div>

          {canManageOrganisations ? (
            <form onSubmit={createOrganisation} className="mt-5 grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-2">
              <input
                className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                name="name"
                placeholder={labels.access.name}
                required={true}
              />
              <input
                className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                name="slug"
                placeholder={labels.access.slug}
                required={true}
              />
              <select
                className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                name="defaultLocale"
              >
                {publicLocales.map((localeCode) => (
                  <option key={localeCode} value={localeCode}>
                    {localeLabels[localeCode]}
                  </option>
                ))}
              </select>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#188B66] disabled:cursor-wait disabled:opacity-70 sm:col-span-2"
                disabled={busy}
                type="submit"
              >
                <BuildingOffice2Icon aria-hidden={true} className="size-4" />
                {labels.access.createOrganisation}
              </button>
            </form>
          ) : null}
        </Panel>
      ) : null}

      {view === "people" ? (
        <>
          <Panel title={labels.access.invitePerson}>
            {canWrite ? (
              <form onSubmit={invitePerson} className="grid gap-3">
                <input
                  className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                  name="email"
                  placeholder={labels.access.email}
                  required={true}
                  type="email"
                />
                <select
                  className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                  name="organisationId"
                  onChange={(event) => setInviteOrganisationId(event.target.value)}
                  value={inviteOrganisationId}
                >
                  {accessData.organisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>
                      {organisation.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                    name="role"
                  >
                    {inviteRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[locale][role]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-inset ring-gray-300"
                    name="preferredLocale"
                  >
                    {publicLocales.map((localeCode) => (
                      <option key={localeCode} value={localeCode}>
                        {localeLabels[localeCode]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#20343A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#16252A] disabled:cursor-wait disabled:opacity-70"
                  disabled={busy}
                  type="submit"
                >
                  <KeyIcon aria-hidden={true} className="size-4" />
                  {labels.access.invite}
                </button>
              </form>
            ) : null}

            <div className="mt-5 divide-y divide-gray-100 border-t border-gray-100 pt-2">
              {accessData.invitations.slice(0, 8).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{invite.email}</div>
                    <div className="text-xs text-gray-500">
                      {organisationById.get(invite.organisationId)?.name ?? labels.access.organisation} ·{" "}
                      {roleLabels[locale][invite.role]} · {formatGeneratedAt(invite.expiresAt, locale)}
                    </div>
                  </div>
                  <span
                    className={classNames(
                      "shrink-0 rounded-full px-2 py-1 text-xs font-medium ring-1",
                      statusClass(invite.status)
                    )}
                  >
                    {statusLabel(labels, invite.status)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

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
                        className="self-end rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
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

          <Panel title={labels.access.memberships}>
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
                  {accessData.memberships.map((membership) => {
                    const person = personById.get(membership.personId);
                    const organisation = organisationById.get(membership.organisationId);
                    const membershipRoles = rolesForOrganisationType(
                      accessData.roles,
                      organisation?.type ?? "tenant",
                      canManageOwners
                    );
                    const availableMembershipRoles = membershipRoles.includes(membership.role)
                      ? membershipRoles
                      : [membership.role, ...membershipRoles];
                    const membershipProtected =
                      membership.role === "platform_owner" && !canManageOwners;

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
                          <form onSubmit={saveMembership} className="flex flex-wrap gap-2">
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <select
                              className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-inset ring-gray-300"
                              defaultValue={membership.role}
                              disabled={!canWrite || busy || membershipProtected}
                              name="role"
                            >
                              {availableMembershipRoles.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabels[locale][role]}
                                </option>
                              ))}
                            </select>
                            <select
                              className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-inset ring-gray-300"
                              defaultValue={membership.status}
                              disabled={!canWrite || busy || membershipProtected}
                              name="status"
                            >
                              <option value="active">{labels.access.active}</option>
                              <option value="disabled">{labels.access.disabled}</option>
                              <option value="invited">{labels.access.pending}</option>
                            </select>
                            {canWrite ? (
                              <button
                                className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
                                disabled={busy || membershipProtected}
                                type="submit"
                              >
                                {labels.access.save}
                              </button>
                            ) : null}
                          </form>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={classNames(
                              "inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1",
                              statusClass(membership.status)
                            )}
                          >
                            {statusLabel(labels, membership.status)}
                          </span>
                        </td>
                        <td className="py-3">
                          {canAssume &&
                          membership.personId !== context.actorPerson.id &&
                          (membership.role !== "platform_owner" || canManageOwners) ? (
                            <button
                              className="inline-flex items-center gap-1 rounded-md bg-[#1FA77A] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-[#188B66] disabled:cursor-wait disabled:opacity-70"
                              disabled={busy}
                              onClick={() =>
                                void mutate({
                                  action: "assume_identity",
                                  membershipId: membership.id
                                })
                              }
                              type="button"
                            >
                              <UserGroupIcon aria-hidden={true} className="size-4" />
                              {labels.access.assume}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
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
          <div className="divide-y divide-gray-100">
            {accessData.auditEvents.map((event) => (
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
