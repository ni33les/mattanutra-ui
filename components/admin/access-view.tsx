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
  AdminClientSessionContext
} from "@/lib/admin-access";
import type { AdminRole } from "@/lib/admin-rbac";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
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
}>;

const roleLabels = {
  en: {
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
  },
  th: {
    agent_manager: "ผู้จัดการเอเจนต์",
    catalogue_manager: "ผู้จัดการแคตตาล็อก",
    content_manager: "ผู้จัดการคอนเทนต์",
    finance_viewer: "ดูการเงิน",
    ops_manager: "ผู้จัดการปฏิบัติการ",
    platform_admin: "แอดมินแพลตฟอร์ม",
    platform_owner: "เจ้าของแพลตฟอร์ม",
    platform_viewer: "ดูแพลตฟอร์ม",
    tenant_admin: "แอดมินองค์กร",
    tenant_user: "ผู้ใช้องค์กร",
    viewer: "ผู้ดู"
  },
  "zh-CN": {
    agent_manager: "代理管理员",
    catalogue_manager: "目录管理员",
    content_manager: "内容管理员",
    finance_viewer: "财务查看者",
    ops_manager: "运营管理员",
    platform_admin: "平台管理员",
    platform_owner: "平台所有者",
    platform_viewer: "平台查看者",
    tenant_admin: "组织管理员",
    tenant_user: "组织用户",
    viewer: "查看者"
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
    invitation?: { inviteUrl?: string };
    reloaded?: boolean;
  };

  if (!response.ok) {
    throw new Error(json.error || "Admin access update failed");
  }

  return json;
}

export function AdminAccessView({
  accessToken,
  context,
  data,
  labels,
  locale
}: AdminAccessViewProps) {
  const [accessData, setAccessData] = useState(data);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const organisationById = useMemo(
    () => new Map(accessData.organisations.map((org) => [org.id, org])),
    [accessData.organisations]
  );
  const personById = useMemo(
    () => new Map(accessData.people.map((person) => [person.id, person])),
    [accessData.people]
  );
  const canWrite = context.permissions.includes("access.write");
  const canAssume = context.permissions.includes("impersonation.write") && !context.isLegacy;

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

      if (result.invitation?.inviteUrl) {
        setMessage(`${labels.access.inviteUrl}: ${result.invitation.inviteUrl}`);
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
      slug: String(form.get("slug") ?? ""),
      type: String(form.get("type") ?? "tenant")
    });
    event.currentTarget.reset();
  }

  function invitePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "invite_person",
      email: String(form.get("email") ?? ""),
      organisationId: String(form.get("organisationId") ?? ""),
      preferredLocale: String(form.get("preferredLocale") ?? "en"),
      role: String(form.get("role") ?? "viewer")
    });
    event.currentTarget.reset();
  }

  function saveMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void mutate({
      action: "update_membership",
      membershipId: String(form.get("membershipId") ?? ""),
      role: String(form.get("role") ?? "viewer"),
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

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title={labels.access.organisations}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.access.name}</th>
                  <th className="py-2 pr-4">{labels.access.type}</th>
                  <th className="py-2 pr-4">{labels.access.defaultLocale}</th>
                  <th className="py-2">{labels.access.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accessData.organisations.map((organisation) => (
                  <tr key={organisation.id}>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {organisation.name}
                      <div className="text-xs text-gray-500">{organisation.slug}</div>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {organisation.type === "platform"
                        ? labels.access.platform
                        : labels.access.tenant}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {localeLabels[organisation.defaultLocale]}
                    </td>
                    <td className="py-3">
                      <span
                        className={classNames(
                          "inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1",
                          statusClass(organisation.status)
                        )}
                      >
                        {statusLabel(labels, organisation.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canWrite ? (
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
                name="type"
              >
                <option value="tenant">{labels.access.tenant}</option>
                <option value="platform">{labels.access.platform}</option>
              </select>
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
                  {accessData.roles.map((role) => (
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
      </div>

      <Panel title={labels.access.people}>
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
                          disabled={!canWrite || busy}
                          name="role"
                        >
                          {accessData.roles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[locale][role]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-md bg-white px-2 py-1 text-sm ring-1 ring-inset ring-gray-300"
                          defaultValue={membership.status}
                          disabled={!canWrite || busy}
                          name="status"
                        >
                          <option value="active">{labels.access.active}</option>
                          <option value="disabled">{labels.access.disabled}</option>
                          <option value="invited">{labels.access.pending}</option>
                        </select>
                        {canWrite ? (
                          <button
                            className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
                            disabled={busy}
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
                      {canAssume && membership.personId !== context.actorPerson.id ? (
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

      <div className="grid gap-8 xl:grid-cols-2">
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
      </div>
    </div>
  );
}
