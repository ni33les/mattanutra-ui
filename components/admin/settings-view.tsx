"use client";

import { useState, type FormEvent } from "react";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import type {
  AdminClientSessionContext,
  AdminSettingsData
} from "@/lib/admin-access";
import type { AdminRole } from "@/lib/admin-rbac";
import { localeLabels, publicLocales, type Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  AdminLogoutButton,
  adminLocaleTextClass,
  classNames
} from "@/components/admin/dashboard-shared";

type SaveProfileResponse = Readonly<{
  error?: string;
  session?: AdminClientSessionContext;
  settingsData?: AdminSettingsData;
  updated?: boolean;
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

function statusLabel(labels: AdminContent, status: string) {
  if (status === "active") {
    return labels.access.active;
  }

  if (status === "disabled") {
    return labels.access.disabled;
  }

  return labels.access.pending;
}

async function saveSettings(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/settings", {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const json = (await response.json().catch(() => ({}))) as SaveProfileResponse;

  if (!response.ok) {
    throw new Error(json.error);
  }

  return json;
}

export function AdminSettingsView({
  context,
  labels,
  locale,
  settingsData: initialSettingsData
}: Readonly<{
  context: AdminClientSessionContext;
  labels: AdminContent;
  locale: Locale;
  settingsData: AdminSettingsData | null;
}>) {
  const [session, setSession] = useState(context);
  const [settingsData, setSettingsData] = useState(initialSettingsData);
  const [displayName, setDisplayName] = useState(context.actorPerson.displayName);
  const [preferredLocale, setPreferredLocale] = useState<Locale>(
    context.actorPerson.preferredLocale
  );
  const [organisationName, setOrganisationName] = useState(
    initialSettingsData?.organisation.name ?? ""
  );
  const [organisationLocale, setOrganisationLocale] = useState<Locale>(
    initialSettingsData?.organisation.defaultLocale ?? "en"
  );
  const [organisationCurrency, setOrganisationCurrency] = useState(
    initialSettingsData?.organisation.currency ?? "THB"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canSave = !session.isLegacy;
  const canEditOrganisation =
    canSave && Boolean(settingsData?.canEditOrganisation);
  const showRetailPeople =
    session.effectiveOrganisation.type === "tenant" &&
    session.effectiveMembership.role === "retail_admin" &&
    Boolean(settingsData);

  function applyResult(result: SaveProfileResponse) {
    if (result.session) {
      setSession(result.session);
    }

    if (result.settingsData) {
      setSettingsData(result.settingsData);
      setOrganisationName(result.settingsData.organisation.name);
      setOrganisationLocale(result.settingsData.organisation.defaultLocale);
      setOrganisationCurrency(result.settingsData.organisation.currency);
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await saveSettings({
        action: "update_self",
        displayName,
        preferredLocale
      });

      applyResult(result);
      setMessage(labels.settings.saved);
    } catch {
      setError(labels.settings.saveError);
    } finally {
      setBusy(false);
    }
  }

  async function submitOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditOrganisation) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await saveSettings({
        action: "update_organisation",
        currency: organisationCurrency,
        defaultLocale: organisationLocale,
        name: organisationName
      });

      applyResult(result);
      setMessage(labels.settings.saved);
    } catch {
      setError(labels.settings.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-[#1FA77A]/10 text-[#126B4F] ring-1 ring-[#1FA77A]/15">
            <UserCircleIcon aria-hidden={true} className="size-5" />
          </span>
          <h2
            className={classNames(
              "text-base font-semibold text-gray-900",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {labels.settings.profile}
          </h2>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={submitProfile}>
          <label className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.displayName}
            <input
              className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
              disabled={!canSave || busy}
              onChange={(event) => setDisplayName(event.target.value)}
              required={true}
              value={displayName}
            />
          </label>

          <div className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.email}
            <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600 ring-1 ring-inset ring-gray-200">
              {session.actorPerson.email}
            </div>
          </div>

          <label className="grid gap-1 text-xs font-semibold text-gray-500">
            {labels.settings.language}
            <select
              className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
              disabled={!canSave || busy}
              onChange={(event) => setPreferredLocale(event.target.value as Locale)}
              value={preferredLocale}
            >
              {publicLocales.map((localeCode) => (
                <option key={localeCode} value={localeCode}>
                  {localeLabels[localeCode]}
                </option>
              ))}
            </select>
          </label>

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

          <div>
            <button
              className={classNames(
                "inline-flex items-center justify-center rounded-md bg-[#20343A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#16252A] disabled:cursor-not-allowed disabled:opacity-60",
                adminLocaleTextClass(locale, "label")
              )}
              disabled={!canSave || busy}
              type="submit"
            >
              {labels.settings.save}
            </button>
          </div>
        </form>
      </section>

      {settingsData ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2
            className={classNames(
              "text-base font-semibold text-gray-900",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {labels.access.organisation}
          </h2>
          <form className="mt-5 grid gap-4" onSubmit={submitOrganisation}>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.name}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                disabled={!canEditOrganisation || busy}
                onChange={(event) => setOrganisationName(event.target.value)}
                required={true}
                value={organisationName}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.defaultLocale}
              <select
                className="rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                disabled={!canEditOrganisation || busy}
                onChange={(event) => setOrganisationLocale(event.target.value as Locale)}
                value={organisationLocale}
              >
                {publicLocales.map((localeCode) => (
                  <option key={localeCode} value={localeCode}>
                    {localeLabels[localeCode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.settings.currency}
              <input
                className="rounded-md bg-white px-3 py-2 text-sm font-normal uppercase text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
                disabled={!canEditOrganisation || busy}
                maxLength={3}
                onChange={(event) =>
                  setOrganisationCurrency(event.target.value.toUpperCase())
                }
                pattern="[A-Z]{3}"
                required={true}
                value={organisationCurrency}
              />
            </label>
            <div className="grid gap-1 text-xs font-semibold text-gray-500">
              {labels.access.slug}
              <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600 ring-1 ring-inset ring-gray-200">
                {settingsData.organisation.slug}
              </div>
            </div>
            {canEditOrganisation ? (
              <div>
                <button
                  className={classNames(
                    "inline-flex items-center justify-center rounded-md bg-[#20343A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#16252A] disabled:cursor-not-allowed disabled:opacity-60",
                    adminLocaleTextClass(locale, "label")
                  )}
                  disabled={busy}
                  type="submit"
                >
                  {labels.settings.save}
                </button>
              </div>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2
          className={classNames(
            "text-base font-semibold text-gray-900",
            adminLocaleTextClass(locale, "heading")
          )}
        >
          {labels.settings.account}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {labels.settings.logoutHint}
        </p>
        <div className="mt-5">
          <AdminLogoutButton label={labels.logout} locale={locale} />
        </div>
      </section>

      {showRetailPeople && settingsData ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 xl:col-span-2">
          <h2
            className={classNames(
              "text-base font-semibold text-gray-900",
              adminLocaleTextClass(locale, "heading")
            )}
          >
            {labels.access.people}
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="py-2 pr-4">{labels.access.name}</th>
                  <th className="py-2 pr-4">{labels.access.email}</th>
                  <th className="py-2 pr-4">{labels.access.role}</th>
                  <th className="py-2 pr-4">{labels.access.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settingsData.people.map((person) => (
                  <tr key={person.id}>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {person.displayName}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{person.email}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {roleLabels[locale][person.role]}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {statusLabel(labels, person.membershipStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
